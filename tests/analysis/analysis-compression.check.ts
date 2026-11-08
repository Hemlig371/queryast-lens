import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tableFromArrays,tableToIPC} from 'apache-arrow';
import {ByteBuffer} from 'flatbuffers';
import {Message} from 'apache-arrow/fb/message';
import {MessageHeader} from 'apache-arrow/fb/message-header';
import {RecordBatch} from 'apache-arrow/fb/record-batch';
import {DictionaryBatch} from 'apache-arrow/fb/dictionary-batch';
import {compressArrowIpc} from '../../src/analysis/arrowCompression';

for(const codec of ['lz4','zstd'] as const)test(`${codec} compresses actual IPC buffers, including dictionaries and exact BIGINTs`,async()=>{
  const count=12000;
  const table=tableFromArrays({
    id:Int32Array.from({length:count},(_,i)=>i%8),
    big:BigInt64Array.from({length:count},(_,i)=>9007199254740993n+BigInt(i)),
    label:Array.from({length:count},(_,i)=>i%7===0?null:'Москва'.repeat(i%3+1)),
    flag:Array.from({length:count},(_,i)=>i%9===0?null:i%2===0),
  });
  const input=tableToIPC(table.concat(table),'stream');
  const output=await compressArrowIpc(input,codec);
  assert.ok(output.length<input.length/2,`${codec}: ${input.length} -> ${output.length}`);
  let offset=0,batches=0,dictionaries=0;
  while(offset<output.length){
    assert.equal(new DataView(output.buffer,output.byteOffset+offset,4).getInt32(0,true),-1);
    const size=new DataView(output.buffer,output.byteOffset+offset+4,4).getInt32(0,true);offset+=8;if(!size)break;
    const msg=Message.getRootAsMessage(new ByteBuffer(output.subarray(offset,offset+size)));offset+=size;
    if(msg.headerType()===MessageHeader.RecordBatch||msg.headerType()===MessageHeader.DictionaryBatch){
      const dict=msg.headerType()===MessageHeader.DictionaryBatch;
      const batch=dict?(msg.header(new DictionaryBatch()) as DictionaryBatch).data()!:(msg.header(new RecordBatch()) as RecordBatch);
      assert.equal(batch.compression()!.codec(),codec==='lz4'?0:1);
      if(dict)dictionaries++;else batches++;
    }
    offset+=Number(msg.bodyLength());
  }
  assert.equal(batches,2);assert.ok(dictionaries>0);
  const folder=process.env.LENS_COMPRESSION_FIXTURES_DIR;
  if(folder){await mkdir(folder,{recursive:true});await writeFile(join(folder,'expected.arrow'),input);await writeFile(join(folder,`${codec}.arrow`),output);}
});

test('invalid IPC fails explicitly',async()=>{
  await assert.rejects(compressArrowIpc(new Uint8Array([255,255]),'lz4'),/Truncated/);
});
