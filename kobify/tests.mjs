import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const extract=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1];
const ctx=vm.createContext({self:{postMessage(){}},console});
vm.runInContext(extract('matching-source')+'\nthis.Matcher=PixelMatcher;',ctx);
vm.runInContext(extract('simulation-source')+'\nthis.Sim=PixelSimulation;',ctx);
const n=16,count=n*n;
const source=Uint8ClampedArray.from({length:count*4},(_,i)=>i%4===3?255:(i*71+Math.floor(i/11)*23)%256);
const target=new Uint8ClampedArray(source.length);
for(let i=0;i<count;i++)target.set(source.subarray((count-i-1)*4,(count-i)*4),i*4);
const m=new ctx.Matcher(source,target,n,0),m2=new ctx.Matcher(source,target,n,0);
let previous=m.totalCost();
for(let i=0;i<35;i++){
  m.pass(Math.max(1,n-i));m2.pass(Math.max(1,n-i));
  assert.ok(m.totalCost()<=previous);previous=m.totalCost();
  assert.equal(new Set(m.map).size,count);
  assert.deepEqual(Array.from(m.map).sort((a,b)=>a-b),Array.from({length:count},(_,i)=>i));
}
assert.ok(m.totalCost()<m.initialCost*.2);
assert.deepEqual(Array.from(m.map),Array.from(m2.map));
const identity=new ctx.Matcher(source,source,n,0);identity.pass(n);
assert.equal(identity.totalCost(),0);
assert.deepEqual(Array.from(identity.map),Array.from({length:count},(_,i)=>i));
const solid=new ctx.Matcher(new Uint8ClampedArray(source.length).fill(255),target,n,0);solid.pass(n);
assert.equal(solid.totalCost(),solid.initialCost);
assert.throws(()=>new ctx.Matcher(source,target,0));
assert.throws(()=>new ctx.Sim(new Uint32Array(count),n));
const sim=new ctx.Sim(m.map,n);
for(let step=0;step<500;step++){
  sim.step(Math.min(1,step/200));
  assert.ok(sim.positions.every(v=>Number.isFinite(v)&&v>=0&&v<=n));
}
for(let dst=0;dst<count;dst++)assert.equal(sim.destinations[m.map[dst]*2],dst%n+.5);
sim.snap(1);assert.deepEqual(Array.from(sim.positions),Array.from(sim.destinations));
sim.snap(0);assert.deepEqual(Array.from(sim.positions),Array.from(sim.origins));
assert.ok(sim.velocity.every(v=>v===0));
for(const id of ['renderer-source','app-source'])new vm.Script(extract(id));
console.log('PASS: bijection, decreasing objective, deterministic mapping, identity/solid inputs, invalid inputs, bounded simulation, exact endpoints and JS syntax.');
