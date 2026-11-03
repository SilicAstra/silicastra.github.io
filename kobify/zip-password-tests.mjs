import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const extract=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1];
const ctx=vm.createContext({console,Uint8Array,Uint8ClampedArray,ArrayBuffer,DataView,Int32Array,Uint32Array,Uint16Array,Int16Array,Int8Array,Float32Array,Float64Array,Date,TextEncoder,TextDecoder,crypto:webcrypto,setTimeout,clearTimeout,Blob,Response,URL,ReadableStream,WritableStream,TransformStream,CompressionStream,DecompressionStream,structuredClone,btoa,atob});
for(const id of ['pdf-library','zip-library','zip-aes-library','recovery-source','bundle-source'])vm.runInContext(extract(id),ctx);
vm.runInContext('this.bundle={createRecoveryPngZip,readRecoveryBundle,createRecoveryPng,inspectRecoveryPng,stripPngBundle,writePngBundlePayload,permutePixels,pixelDigest};',ctx);
function crc32(data){let crc=-1;for(const byte of data){crc^=byte;for(let k=0;k<8;k++)crc=crc>>>1^((crc&1)?0xedb88320:0);}return (crc^-1)>>>0;}
function chunk(type,data){const name=Buffer.from(type),body=Buffer.concat([name,data]),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(body));return Buffer.concat([length,body,crc]);}
function png(pixels,n){const head=Buffer.alloc(13);head.writeUInt32BE(n);head.writeUInt32BE(n,4);head[8]=8;head[9]=6;const rows=Buffer.alloc(n*(n*4+1));for(let y=0;y<n;y++)Buffer.from(pixels.buffer,pixels.byteOffset+y*n*4,n*4).copy(rows,y*(n*4+1)+1);return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));}

const output=new URL('../../../output/zip-password-tests/',import.meta.url);mkdirSync(output,{recursive:true});
let cases=0;
for(const n of [64,96,128,192,256]){
 const original=Uint8ClampedArray.from({length:n*n*4},(_,i)=>i%4===3?255:(i*57)%256),map=Array.from({length:n*n},(_,i)=>n*n-1-i),pixels=ctx.bundle.permutePixels(original,map),image=png(pixels,n);
 const key={format:'kobify-pixel-key',version:1,size:n,destinationToSource:map,resultSha256:await ctx.bundle.pixelDigest(pixels),originalSha256:await ctx.bundle.pixelDigest(original)};
 for(const password of ['', '测试🔑 abc 123',' ']){
  const packed=await ctx.bundle.createRecoveryPngZip(key,image,password),payload=ctx.bundle.inspectRecoveryPng(packed).key;
  assert.equal(payload[0],80);assert.equal(payload[1],75);assert.deepEqual(Array.from(ctx.bundle.stripPngBundle(packed)),Array.from(image));
  if(password){await assert.rejects(()=>ctx.bundle.readRecoveryBundle(packed),e=>e.code==='PASSWORD_REQUIRED');await assert.rejects(()=>ctx.bundle.readRecoveryBundle(packed,'wrong'),e=>e.code==='PASSWORD_INVALID');}
  const result=await ctx.bundle.readRecoveryBundle(packed,password);assert.equal(result.encrypted,!!password);assert.deepEqual(Array.from(result.key.destinationToSource),map);
  assert.equal(await ctx.bundle.pixelDigest(ctx.bundle.permutePixels(pixels,result.key.destinationToSource,true)),key.originalSha256);
  const reader=new ctx.zip.ZipReader(new ctx.zip.Uint8ArrayReader(payload),{useWebWorkers:false});const entries=await reader.getEntries();assert.equal(entries.length,3);for(const e of entries){assert.equal(e.encrypted,!!password);assert.equal(e.compressionMethod,0);if(password)assert.equal(e.extraFieldAES.strength,3);}await reader.close();
  if(n===128){const name=password===''?'plain':password===' '?'space':'encrypted';writeFileSync(new URL(name+'.png',output),packed);writeFileSync(new URL(name+'.zip',output),payload);}
  if(password){const altered=payload.slice();const dv=new DataView(altered.buffer),start=30+dv.getUint16(26,true)+dv.getUint16(28,true);altered[start+20]^=1;const corrupt=ctx.bundle.writePngBundlePayload(image,altered);await assert.rejects(()=>ctx.bundle.readRecoveryBundle(corrupt,password));}
  cases++;
 }
 const legacy=ctx.bundle.createRecoveryPng(key,image);assert.deepEqual(Array.from((await ctx.bundle.readRecoveryBundle(legacy)).key.destinationToSource),map);
 await assert.rejects(()=>ctx.bundle.createRecoveryPngZip(key,image,'x'.repeat(257)));
 const archive=await ctx.bundle.createRecoveryPngZip(key,image,'same');const again=await ctx.bundle.createRecoveryPngZip(key,image,'same');assert.notDeepEqual(Array.from(ctx.bundle.inspectRecoveryPng(archive).key),Array.from(ctx.bundle.inspectRecoveryPng(again).key),'fresh salt each export');
}
// ZIP STORE + allowlist prevents decompression bombs; malformed counts and paths
// must fail even if the PNG CRC is valid.
const validImage=readFileSync(new URL('plain.png',output));const clean=ctx.bundle.stripPngBundle(validImage);const bad=new Uint8Array([80,75,3,4,0,0]);await assert.rejects(()=>ctx.bundle.readRecoveryBundle(ctx.bundle.writePngBundlePayload(clean,bad)));
const tooMany=ctx.bundle.inspectRecoveryPng(validImage).key.slice();new DataView(tooMany.buffer).setUint16(tooMany.length-12,4,true);await assert.rejects(()=>ctx.bundle.readRecoveryBundle(ctx.bundle.writePngBundlePayload(clean,tooMany)));
writeFileSync(new URL('report.json',output),JSON.stringify({passed:true,roundTrips:cases,sizes:[64,96,128,192,256],encryption:'WinZip AES-256 AE-2; ZIP STORE',cases:['no-password automatic recovery','Unicode password','spaces retained','missing/wrong password','authenticated corruption','fresh salts','unchanged visible PNG','exact original pixel SHA-256','legacy JSON PNG compatibility','oversized passwords','malformed ZIP entry counts']},null,2));
console.log('PASS: '+cases+' ZIP/PNG password round trips, AES authentication, backward compatibility, and size guards.');
