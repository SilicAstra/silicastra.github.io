import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const extract=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1];
const ctx=vm.createContext({console,Uint8Array,Uint8ClampedArray,ArrayBuffer,DataView,Int32Array,Uint32Array,Uint16Array,Int16Array,Int8Array,Float32Array,Float64Array,Date,TextEncoder,TextDecoder,crypto:webcrypto,setTimeout,clearTimeout});
for(const id of ['pdf-library','zip-library','recovery-source','bundle-source'])vm.runInContext(extract(id),ctx);
vm.runInContext('this.bundle={createRecoveryPng,readRecoveryPng,permutePixels,pixelDigest};',ctx);
function crc32(data){let crc=-1;for(const byte of data){crc^=byte;for(let k=0;k<8;k++)crc=crc>>>1^((crc&1)?0xedb88320:0);}return (crc^-1)>>>0;}
function chunk(type,data){const name=Buffer.from(type),body=Buffer.concat([name,data]),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(body));return Buffer.concat([length,body,crc]);}
function png(pixels,n){const head=Buffer.alloc(13);head.writeUInt32BE(n);head.writeUInt32BE(n,4);head[8]=8;head[9]=6;const rows=Buffer.alloc(n*(n*4+1));for(let y=0;y<n;y++)Buffer.from(pixels.buffer,pixels.byteOffset+y*n*4,n*4).copy(rows,y*(n*4+1)+1);return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));}

for(const n of [32,48,64,96,128,192,256]){
 const source=Uint8ClampedArray.from({length:n*n*4},(_,i)=>i%4===3?255:(i*57)%256),map=Array.from({length:n*n},(_,i)=>n*n-1-i),result=ctx.bundle.permutePixels(source,map),image=png(result,n);
 const key={format:'kobify-pixel-key',version:1,size:n,destinationToSource:map,resultSha256:await ctx.bundle.pixelDigest(result),originalSha256:await ctx.bundle.pixelDigest(source)};
 const packed=ctx.bundle.createRecoveryPng(key,image),read=ctx.bundle.readRecoveryPng(packed);
 assert.equal(await ctx.bundle.pixelDigest(ctx.bundle.permutePixels(result,read.key.destinationToSource,true)),key.originalSha256);
 assert.deepEqual(Array.from(read.key.destinationToSource),map);
 // Image data is unchanged; standard PNG viewers ignore the ancillary key chunk.
 const chunks=bytes=>{const out=[];for(let p=8;p<bytes.length;){const len=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(p),name=String.fromCharCode(...bytes.subarray(p+4,p+8));if(name!=='koBy')out.push(...bytes.subarray(p,p+12+len));p+=12+len;}return out;};
 assert.deepEqual(chunks(packed),chunks(image));
 assert.throws(()=>ctx.bundle.readRecoveryPng(image));
 assert.throws(()=>ctx.bundle.createRecoveryPng(key,packed));
 const damaged=packed.slice();damaged[damaged.length-20]^=1;assert.throws(()=>ctx.bundle.readRecoveryPng(damaged));
 assert.throws(()=>ctx.bundle.readRecoveryPng(packed.subarray(0,packed.length-1)));
 if(n===128){mkdirSync(new URL('../../../output/',import.meta.url),{recursive:true});writeFileSync(new URL('../../../output/png-key-test.png',import.meta.url),packed);}
}
console.log('PASS: five PNG image/key round trips, unchanged image chunks, inverse pixels, missing/duplicate key, corruption and truncation rejection.');
