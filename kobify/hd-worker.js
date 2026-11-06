importScripts('./hd-assets/tf.min.js','./hd-assets/upscaler.min.js');
let engine=null,backend='';
async function initialize(forceHttp=false){if(engine)return engine;try{await tf.setBackend('webgl');await tf.ready();backend=tf.getBackend();}catch{await tf.setBackend('cpu');await tf.ready();backend='cpu';}
 const cache='indexeddb://kobify-esrgan-slim-1-x4',models=await tf.io.listModels().catch(()=>({}));let path=!forceHttp&&models[cache]?cache:new URL('./hd-assets/model.json',self.location.href).href;
 engine=new Upscaler({model:{path,scale:4,modelType:'layers',inputRange:[0,255],outputRange:[0,255]}});try{await engine.ready;}catch(e){engine=null;if(path===cache){await tf.io.removeModel(cache).catch(()=>{});return initialize(true);}throw e;}
 if(path!==cache){const pkg=await engine.getModel();await pkg.model.save(cache).catch(()=>{});}return engine;}
let queue=Promise.resolve();self.onmessage=({data})=>{queue=queue.then(async()=>{let input,output;try{
 self.postMessage({id:data.id,type:'progress',value:0,stage:'正在加载 AI 高清模型…'});const up=await initialize();const canvas=new OffscreenCanvas(256,256),ctx=canvas.getContext('2d'),small=new OffscreenCanvas(data.size,data.size);small.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.pixels),data.size,data.size),0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(small,0,0,256,256);
 input=tf.browser.fromPixels(ctx.getImageData(0,0,256,256));output=await up.upscale(input,{output:'tensor',patchSize:32,padding:4,awaitNextFrame:true,progress:value=>self.postMessage({id:data.id,type:'progress',value,stage:'AI 高清放大'})});
 if(output.shape[0]!==1024||output.shape[1]!==1024)throw Error('AI 输出尺寸异常');const values=await output.data(),rgba=new Uint8ClampedArray(1024*1024*4);for(let i=0;i<1024*1024;i++){rgba[i*4]=values[i*3];rgba[i*4+1]=values[i*3+1];rgba[i*4+2]=values[i*3+2];rgba[i*4+3]=255;}
 self.postMessage({id:data.id,type:'done',pixels:rgba.buffer,backend,model:'ESRGAN-slim x4',tensors:tf.memory().numTensors},[rgba.buffer]);
 }catch(e){self.postMessage({id:data.id,type:'error',message:String(e.message||e)});}finally{input?.dispose();output?.dispose();}});};
