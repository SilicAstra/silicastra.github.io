(function(){
  'use strict';
  const grid=64;
  const board=$('board-view');
  const input=$('board-input');
  const output=$('board-output');
  const strokes=document.createElement('canvas');
  strokes.width=strokes.height=input.width;
  const ink=strokes.getContext('2d');
  const paper=input.getContext('2d');
  const targetSelect=$('board-target');
  const backgroundChoice=$('board-background');
  const boardStatus=$('board-status');
  const initial=Uint32Array.from({length:grid*grid},(_,i)=>i);
  let liveRenderer,matcher,active=false,busy=false,queued=false,refine=false;
  let target,colors,mapping=initial,positions,goals,raf=0,timer=0,lastFrame=0;
  let colorsDirty=true,backgroundMode="white",backgroundCanvas=null,backgroundRequest=0,backgroundPending=false,pointer=null,lastPoint=null,usingDrawing=false;

  function message(text,error=false){
    boardStatus.textContent=text;
    boardStatus.classList.toggle('error',error);
  }

  function composite(){
    paper.fillStyle=backgroundMode==='black'?'#000':'#fff';
    paper.fillRect(0,0,input.width,input.height);
    if(backgroundMode==='image'&&backgroundCanvas)paper.drawImage(backgroundCanvas,0,0);
    paper.drawImage(strokes,0,0);
  }

  function refreshColors(){
    if(!colorsDirty)return;
    colors=sample(input,grid);
    liveRenderer.setup(grid,colors,target,mapping);
    colorsDirty=false;
  }

  function requestMatch(final=false){
    if(!active||!target||!matcher)return;
    queued=true;
    refine=final;
    if(!busy&&!timer)timer=setTimeout(matchNext,final?0:90);
  }

  function matchNext(){
    timer=0;
    if(!active||!target||!matcher||busy||!queued)return;
    refreshColors();
    const final=refine;
    queued=false;
    busy=true;
    matcher.postMessage({
      source:colors,target,n:grid,proximity:.10,
      live:true,refine:final,previousMapping:mapping
    });
  }

  function syncTarget(){
    syncTargetPicker(targetSelect);
    $('board-use').disabled=!targetImage||usingDrawing;
    if(!active)return;
    clearTimeout(timer);
    timer=0;
    busy=queued=false;
    matcher?.terminate();
    matcher=null;
    target=targetImage?sample(targetImage,grid):null;
    mapping=initial;
    positions=new Float32Array(grid*grid*2);
    goals=new Float32Array(positions.length);
    for(let i=0;i<initial.length;i++){
      positions[2*i]=goals[2*i]=i%grid+.5;
      positions[2*i+1]=goals[2*i+1]=Math.floor(i/grid)+.5;
    }
    output.hidden=!target;
    if(!target){
      message(inputStatus());
      return;
    }
    try{
      liveRenderer??=new PixelRenderer(output);
      const url=URL.createObjectURL(new Blob([$('matching-source').textContent],{type:'text/javascript'}));
      try{matcher=new Worker(url);}
      finally{URL.revokeObjectURL(url);}
      matcher.onmessage=receiveMapping;
      matcher.onerror=()=>message('实时重排暂不可用，请重新打开画板。',true);
      message('画笔颜色会决定成品配色。');
      colorsDirty=true;
      wake();
      requestMatch(true);
    }catch{
      message('实时重排暂不可用，请重新打开画板。',true);
    }
  }

  function receiveMapping({data,currentTarget}){
    if(!active||currentTarget!==matcher)return;
    if(data.type==='error'){
      busy=false;
      message('实时重排暂不可用，请重新打开画板。',true);
      return;
    }
    if(data.type!=='done')return;
    mapping=data.mapping;
    for(let dst=0;dst<mapping.length;dst++){
      const src=mapping[dst]*2;
      goals[src]=dst%grid+.5;
      goals[src+1]=Math.floor(dst/grid)+.5;
    }
    colorsDirty=true;
    wake();
    busy=false;
    if(queued&&!timer)timer=setTimeout(matchNext,refine?0:90);
  }

  function wake(){
    if(!raf&&active)raf=requestAnimationFrame(render);
  }

  function render(now){
    raf=0;
    if(!active||!target||!liveRenderer)return;
    refreshColors();
    const elapsed=lastFrame?Math.min(50,now-lastFrame):16;
    const step=1-Math.exp(-elapsed/145);
    let moving=false;
    for(let i=0;i<positions.length;i++){
      const difference=goals[i]-positions[i];
      if(reducedMotion||Math.abs(difference)<.02)positions[i]=goals[i];
      else{
        positions[i]+=difference*step;
        moving=true;
      }
    }
    liveRenderer.draw(positions);
    lastFrame=moving?now:0;
    if(moving)wake();
  }

  function point(event){
    const rect=input.getBoundingClientRect();
    return [(event.clientX-rect.left)*input.width/rect.width,(event.clientY-rect.top)*input.height/rect.height];
  }

  function paint(event,first=false){
    const next=point(event);
    const color=board.querySelector('[name="board-ink"]:checked').value;
    const size=Number($('board-brush').value);
    ink.fillStyle=ink.strokeStyle=color;
    ink.lineWidth=size;
    ink.lineCap=ink.lineJoin='round';
    ink.beginPath();
    if(first||!lastPoint){
      ink.arc(...next,size/2,0,Math.PI*2);
      ink.fill();
    }else{
      ink.moveTo(...lastPoint);
      ink.lineTo(...next);
      ink.stroke();
    }
    lastPoint=next;
  }

  function updateDrawing(final=false){
    composite();
    colorsDirty=true;
    wake();
    requestMatch(final);
  }

  input.addEventListener('pointerdown',event=>{
    if(pointer!==null||event.button!==0)return;
    pointer=event.pointerId;
    input.setPointerCapture(pointer);
    paint(event,true);
    updateDrawing();
  });
  input.addEventListener('pointermove',event=>{
    if(event.pointerId!==pointer)return;
    const events=event.getCoalescedEvents?.();
    for(const sampleEvent of events?.length?events:[event])paint(sampleEvent);
    updateDrawing();
  });
  for(const eventName of ['pointerup','pointercancel','lostpointercapture']){
    input.addEventListener(eventName,event=>{
      if(pointer!==event.pointerId)return;
      if(eventName==='pointerup')paint(event);
      pointer=lastPoint=null;
      updateDrawing(true);
    });
  }

  $('board-clear').addEventListener('click',()=>{
    ink.clearRect(0,0,strokes.width,strokes.height);
    updateDrawing(true);
  });
  function syncBackgroundChoice(){
    backgroundChoice.value=backgroundMode;
    backgroundChoice.querySelector('[value="replace-image"]').hidden=backgroundMode!=='image';
  }

  backgroundChoice.addEventListener('change',()=>{
    const choice=backgroundChoice.value;
    if(choice==='image'||choice==='replace-image'){
      syncBackgroundChoice();
      $('board-background-file').click();
      return;
    }
    backgroundRequest++;
    backgroundPending=false;
    backgroundMode=choice;
    syncBackgroundChoice();
    updateDrawing(true);
  });
  $('board-background-file').addEventListener('change',async event=>{
    const file=event.target.files[0];
    event.target.value='';
    if(!file)return;
    const problem=fileProblem(file);
    if(problem){message(problem,true);return;}
    const generation=++backgroundRequest;
    backgroundPending=true;
    const url=URL.createObjectURL(file);
    try{
      const image=await loadImage(url);
      if(generation!==backgroundRequest)return;
      if(image.naturalWidth*image.naturalHeight>64000000)throw new Error('图片尺寸过大，请缩小到 6400 万像素以内。');
      backgroundCanvas=pixelCanvas(sample(image,input.width),input.width);
      backgroundMode='image';
      syncBackgroundChoice();
      message('背景图片已就绪。');
      updateDrawing(true);
    }catch(error){
      if(generation===backgroundRequest)message(error.message,true);
    }finally{
      URL.revokeObjectURL(url);
      if(generation===backgroundRequest)backgroundPending=false;
    }
  });

  targetSelect.addEventListener('change',()=>handleTargetChoice(targetSelect));
  $('board-use').addEventListener('click',async()=>{
    if(!targetImage||usingDrawing)return;
    if(backgroundPending){message('请等待背景图片载入。');return;}
    usingDrawing=true;
    $('board-use').disabled=true;
    const snapshot=input.toDataURL('image/png');
    try{
      const image=await loadImage(snapshot);
      if(!active||location.hash!=='#draw'||!targetImage)return;
      fileGeneration++;
      if(sourceObjectURL)URL.revokeObjectURL(sourceObjectURL);
      sourceObjectURL=null;
      sourceImage=image;
      currentSourceName='画板作品';
      delete $('file-name').dataset.noI18n;
      $('file-name').textContent=currentSourceName;
      generate();
    }catch{
      message('画板作品无法读取，请重试。',true);
    }finally{
      usingDrawing=false;
      $('board-use').disabled=!targetImage;
    }
  });

  document.addEventListener('kobify-target-change',syncTarget);
  document.addEventListener('kobify-view-change',()=>{
    const show=document.body.dataset.view==='draw';
    if(active===show)return;
    active=show;
    if(show){
      composite();
      syncTarget();
    }else{
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      matcher?.terminate();
      matcher=null;
      timer=raf=lastFrame=0;
      const captured=pointer;
      pointer=lastPoint=null;
      if(captured!==null&&input.hasPointerCapture(captured))input.releasePointerCapture(captured);
    }
  });
  syncRoute();
})();
