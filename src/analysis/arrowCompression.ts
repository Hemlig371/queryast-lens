import {Builder,ByteBuffer} from 'flatbuffers';
import {Message} from 'apache-arrow/fb/message';
import {MessageHeader} from 'apache-arrow/fb/message-header';
import {RecordBatch} from 'apache-arrow/fb/record-batch';
import {DictionaryBatch} from 'apache-arrow/fb/dictionary-batch';
import {Buffer as ArrowBuffer} from 'apache-arrow/fb/buffer';
import {FieldNode} from 'apache-arrow/fb/field-node';
import {BodyCompression} from 'apache-arrow/fb/body-compression';
import {BodyCompressionMethod} from 'apache-arrow/fb/body-compression-method';
import {CompressionType} from 'apache-arrow/fb/compression-type';
import {KeyValue} from 'apache-arrow/fb/key-value';

export type ArrowCodec = 'lz4' | 'zstd';
const align = (length:number) => Math.ceil(length/8)*8;
const safe = (value:bigint) => {const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid Arrow IPC size');return n;};
let zstdUrl: (()=>string) | undefined;
export function configureZstdWasm(source:()=>string){zstdUrl=source;}
let zstdReady: Promise<typeof import('@bokuweb/zstd-wasm')> | undefined;

async function compressor(codec:ArrowCodec) {
  if(codec==='lz4') {
    const lz4=await import('lz4js');
    return (bytes:Uint8Array) => new Uint8Array(lz4.compress(bytes));
  }
  zstdReady ??= (async()=>{
    const zstd=await import('@bokuweb/zstd-wasm');
    if(typeof window==='undefined') await zstd.init();
    else {
      const url=zstdUrl?.()??new URL('analysis-zstd.wasm',document.baseURI).href;
      try{await (zstd.init as (url?:string)=>Promise<void>)(url);}finally{if(url.startsWith('blob:'))URL.revokeObjectURL(url);}
    }
    return zstd;
  })().catch(error=>{zstdReady=undefined;throw error;});
  const zstd=await zstdReady;
  return (bytes:Uint8Array) => zstd.compress(bytes,3);
}

/** Arrow IPC BUFFER compression, not a gzip/zstd wrapper around an .arrow file.
 * Rebuild only batch metadata/physical buffers. Schema, dictionary IDs and all
 * numeric bytes remain unchanged; no import into another analytical engine.
 */
export async function compressArrowIpc(ipc:Uint8Array,codec:ArrowCodec):Promise<Uint8Array> {
  const compress=await compressor(codec);
  const chunks:Uint8Array[]=[];
  let offset=0;
  while(offset<ipc.length) {
    const start=offset;
    if(offset+4>ipc.length)throw Error('Truncated Arrow IPC prefix');
    let size=new DataView(ipc.buffer,ipc.byteOffset+offset,4).getInt32(0,true);offset+=4;
    if(size===-1){if(offset+4>ipc.length)throw Error('Truncated Arrow IPC continuation');size=new DataView(ipc.buffer,ipc.byteOffset+offset,4).getInt32(0,true);offset+=4;}
    if(size===0){chunks.push(Uint8Array.from([255,255,255,255,0,0,0,0]));break;}
    if(size<0||offset+size>ipc.length)throw Error('Invalid Arrow IPC metadata length');
    const message=Message.getRootAsMessage(new ByteBuffer(ipc.subarray(offset,offset+size)));
    offset+=size;
    const bodyLength=safe(message.bodyLength());
    if(offset+bodyLength>ipc.length)throw Error('Truncated Arrow IPC body');
    const body=ipc.subarray(offset,offset+bodyLength);offset+=bodyLength;
    const kind=message.headerType();
    if(kind!==MessageHeader.RecordBatch&&kind!==MessageHeader.DictionaryBatch){chunks.push(ipc.slice(start,offset));continue;}
    const dictionary=kind===MessageHeader.DictionaryBatch ? message.header(new DictionaryBatch()) as DictionaryBatch : undefined;
    const batch=dictionary ? dictionary.data()! : message.header(new RecordBatch()) as RecordBatch;
    if(batch.compression())throw Error('Arrow IPC is already compressed');
    const regions:{offset:number;length:number}[]=[];
    const buffers:Uint8Array[]=[];
    let total=0;
    for(let i=0;i<batch.buffersLength();i++) {
      const region=batch.buffers(i)!;
      const from=safe(region.offset()),length=safe(region.length());
      if(from+length>body.length)throw Error('Invalid Arrow buffer bounds');
      if(!length){regions.push({offset:total,length:0});continue;}
      const raw=body.subarray(from,from+length);
      const encoded=compress(raw);
      const useCompressed=encoded.length<raw.length;
      const payload=useCompressed?encoded:raw;
      const block=new Uint8Array(align(8+payload.length));
      new DataView(block.buffer).setBigInt64(0,useCompressed?BigInt(raw.length):-1n,true);
      block.set(payload,8);
      regions.push({offset:total,length:8+payload.length});total+=block.length;buffers.push(block);
    }
    const builder=new Builder();
    RecordBatch.startNodesVector(builder,batch.nodesLength());
    for(let i=batch.nodesLength()-1;i>=0;i--){const node=batch.nodes(i)!;FieldNode.createFieldNode(builder,node.length(),node.nullCount());}
    const nodes=builder.endVector();
    RecordBatch.startBuffersVector(builder,regions.length);
    for(let i=regions.length-1;i>=0;i--)ArrowBuffer.createBuffer(builder,BigInt(regions[i].offset),BigInt(regions[i].length));
    const locations=builder.endVector();
    const compression=BodyCompression.createBodyCompression(builder,codec==='lz4'?CompressionType.LZ4_FRAME:CompressionType.ZSTD,BodyCompressionMethod.BUFFER);
    RecordBatch.startRecordBatch(builder);
    RecordBatch.addLength(builder,batch.length());RecordBatch.addNodes(builder,nodes);RecordBatch.addBuffers(builder,locations);RecordBatch.addCompression(builder,compression);
    let header=RecordBatch.endRecordBatch(builder);
    if(dictionary){DictionaryBatch.startDictionaryBatch(builder);DictionaryBatch.addId(builder,dictionary.id());DictionaryBatch.addData(builder,header);DictionaryBatch.addIsDelta(builder,dictionary.isDelta());header=DictionaryBatch.endDictionaryBatch(builder);}
    const kv=[];
    for(let i=0;i<message.customMetadataLength();i++){
      const entry=message.customMetadata(i)!;
      const key=entry.key(),value=entry.value();
      kv.push(KeyValue.createKeyValue(builder,key===null?0:builder.createString(key),value===null?0:builder.createString(value)));
    }
    const metadata=kv.length?Message.createCustomMetadataVector(builder,kv):0;
    const result=Message.createMessage(builder,message.version(),kind,header,BigInt(total),metadata);
    builder.finish(result);
    const encoded=builder.asUint8Array();
    const prefix=new Uint8Array(8+align(encoded.length));
    const view=new DataView(prefix.buffer);view.setInt32(0,-1,true);view.setInt32(4,align(encoded.length),true);prefix.set(encoded,8);
    chunks.push(prefix,...buffers);
  }
  const result=new Uint8Array(chunks.reduce((sum,chunk)=>sum+chunk.length,0));let at=0;
  for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}
  return result;
}
