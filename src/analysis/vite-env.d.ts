/// <reference types="vite/client" />
declare module '*?base64' { const value:string; export default value; }
declare module 'lz4js' { export function compress(input:Uint8Array):Uint8Array; export function decompress(input:Uint8Array):Uint8Array; }
