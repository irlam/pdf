/* Remove source shapes through the normal staged-edit, draft and export workflow. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),engine=window.PdfObjects;
  const dock=$('objectRemovalBar'),filter=$('objectFilter'),join=$('objectConnected'),status=$('objectRemovalStatus');
  const previewButton=$('objectPreview'),removeButton=$('objectRemove'),clearButton=$('objectClear');
  const hitContext=document.createElement('canvas').getContext('2d');
  let model=null,modelWriter=null,modelRenderer=null,modelPage=-1,chosen=new Set(),hover=[],preview=false,previewReady=false,lastSignature=null,displayRecord=null;
  let gesture=null,lastToolActive=false,analysisError='',renderPending=Promise.resolve();
  const removals=()=>edits.filter(it=>it.type==='sourceRemoval');
  const targets=(page=currentPageIndex)=>new Set(removals().filter(it=>it.page===page).flatMap(it=>it.targets));
  function invalidate(){model=null;chosen.clear();hover=[];preview=false;previewReady=false;analysisError='';}
  function getModel(){
    if(!pdfDocWriter)return null;
    if(modelWriter!==pdfDocWriter||modelRenderer!==pdfDocRender||modelPage!==currentPageIndex){invalidate();modelWriter=pdfDocWriter;modelRenderer=pdfDocRender;modelPage=currentPageIndex;}
    if(!model&&!analysisError)try{model=engine.analyse(pdfDocWriter,currentPageIndex);}catch(e){analysisError=e.message;}
    return model;
  }
  function available(){const removed=targets();return (getModel()?.objects||[]).filter(o=>!removed.has(o.key)&&engine.eligible(o,filter.value));}
  function path(item){
    if(item.path)return item.path;const p=new Path2D();
    if(item.type==='annotation')p.rect(item.rect.x,item.rect.y,item.rect.w,item.rect.h);
    else for(const [op,...v] of item.commands){if(op==='M')p.moveTo(...v);else if(op==='L')p.lineTo(...v);else if(op==='C')p.bezierCurveTo(...v);else p.closePath();}
    item.path=p;return p;
  }
  function clipPath(clip){if(!clip.path)clip.path=path(clip);return clip.path;}
  function hit(x,y){
    const candidates=available(),tolerance=5*dpr()/viewport.scale;
    for(let i=candidates.length-1;i>=0;i--){const o=candidates[i],r=o.rect;
      if(x<r.x-tolerance||x>r.x+r.w+tolerance||y<r.y-tolerance||y>r.y+r.h+tolerance)continue;
      if(o.clips?.some(c=>!hitContext.isPointInPath(clipPath(c),x,y,c.rule)))continue;
      if(o.type==='annotation')return o;
      if(o.hasFill&&hitContext.isPointInPath(path(o),x,y,o.rule))return o;
      hitContext.lineWidth=Math.max(o.width,2*tolerance);if(o.hasStroke&&hitContext.isPointInStroke(path(o),x,y))return o;
    }
    return null;
  }
  function group(item){return item?(join.checked?engine.connected(item,available()):[item]):[];}
  function update(){
    const active=el.tool.value==='removeObjects';dock.hidden=!active;
    if(!active)return;
    const m=getModel(),count=available().length,staged=targets().size;
    previewButton.disabled=!chosen.size||preview;removeButton.disabled=!preview||!previewReady;clearButton.disabled=!chosen.size&&!preview;
    $('objectSelectionCount').textContent=`${chosen.size} selected${staged?' · '+staged+' removed on this page':''}`;
    status.textContent=analysisError||(!pdfDocWriter?'Open a PDF to remove drawing objects.':preview?(previewReady?'Preview ready. Check the drawing, then keep the removal or cancel.':'Rendering removal preview…'):chosen.size?'Selection highlighted. Preview the removal before keeping it.':count?`${count} selectable objects. Click a shape or drag around objects. Shift adds to the selection.`:m&&!m.objects.length?'This page has no separate drawing shapes or supported markups. Text and scanned images are protected.':'No objects match this filter. Try All drawing shapes or PDF annotations.');
    if(m?.warnings.length)status.textContent+=' '+m.warnings.join(' ');
    el.pageLayer.classList.toggle('removing-objects',active);
  }
  function highlights(){
    if(el.tool.value!=='removeObjects'||!viewport)return;
    getModel();update();if(preview)return;
    overlayCtx.save();overlayCtx.setTransform(...viewport.transform);overlayCtx.lineWidth=2*dpr()/viewport.scale;overlayCtx.setLineDash([]);
    const list=model?.objects||[];
    for(const o of list){const selected=chosen.has(o.key);if(!selected&&!hover.includes(o.key))continue;
      overlayCtx.save();for(const clip of o.clips||[])overlayCtx.clip(clipPath(clip),clip.rule);
      overlayCtx.fillStyle=selected?'#f9731650':'#38bdf840';overlayCtx.strokeStyle=selected?'#f97316':'#0284c7';
      if(o.hasFill||o.type==='annotation')overlayCtx.fill(path(o),o.rule||'nonzero');overlayCtx.lineWidth=Math.max(o.hasStroke?o.width:0,2*dpr()/viewport.scale);overlayCtx.stroke(path(o));overlayCtx.restore();
    }
    overlayCtx.restore();
    if(gesture?.end){const a=gesture.start,b=gesture.end;overlayCtx.save();overlayCtx.setLineDash([6*dpr(),4*dpr()]);overlayCtx.strokeStyle='#38bdf8';overlayCtx.fillStyle='#38bdf820';overlayCtx.lineWidth=dpr();overlayCtx.strokeRect(a.x*dpr(),a.y*dpr(),(b.x-a.x)*dpr(),(b.y-a.y)*dpr());overlayCtx.fillRect(a.x*dpr(),a.y*dpr(),(b.x-a.x)*dpr(),(b.y-a.y)*dpr());overlayCtx.restore();}
  }
  function displayRemovals(){if(preview&&(modelWriter!==pdfDocWriter||modelRenderer!==pdfDocRender||modelPage!==currentPageIndex)){chosen.clear();hover=[];preview=false;previewReady=false;}return [...removals(),...(preview&&chosen.size?[{page:currentPageIndex,targets:[...chosen]}]:[])];}
  function retire(record){if(!record)return;record.retired=true;if(record.users===0&&record.doc){record.doc.destroy();record.doc=null;}}
  async function renderDisplay(originalPage,index,vp,context){
    const list=displayRemovals();if(!list.length){retire(displayRecord);displayRecord=null;return false;}
    const key=JSON.stringify(list.map(r=>[r.page,r.targets])),writer=pdfDocWriter,renderer=pdfDocRender;
    if(!displayRecord||displayRecord.writer!==writer||displayRecord.renderer!==renderer||displayRecord.key!==key){
      retire(displayRecord);const record={writer,renderer,key,users:0,retired:false,doc:null};
      record.promise=(async()=>{const bytes=await writer.save();const temporary=await PDFLib.PDFDocument.load(bytes);engine.apply(temporary,list);const doc=await pdfjsLib.getDocument({data:await temporary.save()}).promise;record.doc=doc;return doc;})();displayRecord=record;
    }
    const record=displayRecord;record.users++;
    try{const doc=await record.promise,p=await doc.getPage(index+1);await p.render({canvasContext:context,viewport:vp}).promise;return true;}
    finally{record.users--;if(record.retired&&record.users===0&&record.doc){record.doc.destroy();record.doc=null;}}
  }
  function signature(){return JSON.stringify(displayRemovals().map(r=>[r.page,[...r.targets].sort()]));}
  function scheduleDisplay(){
    if(!pdfDocRender)return;const sig=signature();
    if(lastSignature?.writer===pdfDocWriter&&lastSignature?.renderer===pdfDocRender&&lastSignature?.sig===sig)return;
    lastSignature={writer:pdfDocWriter,renderer:pdfDocRender,sig};
    if(sig==='[]'&&!displayRecord)return;
    const source=pdfDocRender,page=currentPageIndex;
    renderPending=Promise.resolve().then(()=>{if(source===pdfDocRender&&page===currentPageIndex)return renderPage(page);}).then(()=>{if(preview&&signature()===sig){previewReady=true;update();}}).catch(e=>{previewReady=false;status.textContent='Preview failed: '+e.message;removeButton.disabled=true;showError('Object removal preview failed: '+e.message);});
  }
  const draw=drawOverlay;drawOverlay=function(){draw();highlights();scheduleDisplay();};
  function reset(){gesture=null;chosen.clear();hover=[];preview=false;previewReady=false;drawOverlay();update();}
  previewButton.onclick=()=>{if(!chosen.size)return;preview=true;previewReady=false;hover=[];drawOverlay();};
  removeButton.onclick=()=>{
    if(!preview||!previewReady||!chosen.size)return;
    const count=chosen.size;pushHistory();edits.push({id:nextId++,type:'sourceRemoval',page:currentPageIndex,targets:[...chosen],rectCss:{x:0,y:0,w:0,h:0}});selectedIds=[];
    preview=false;previewReady=false;chosen.clear();hover=[];drawOverlay();update();window.dispatchEvent(new Event('pdf-objects-changed'));showSuccess(`${count} drawing object${count===1?'':'s'} removed. Undo restores them.`);
  };
  clearButton.onclick=reset;
  for(const control of [filter,join])control.onchange=reset;
  function eventPoint(event){const r=el.pdfCanvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
  function inside(p){return p.x>=0&&p.y>=0&&p.x<=el.pdfCanvas.clientWidth&&p.y<=el.pdfCanvas.clientHeight;}
  el.pageLayer.addEventListener('pointerdown',event=>{
    if(el.tool.value!=='removeObjects'||event.button!==0||!pdfDocRender)return;
    const p=eventPoint(event);if(!inside(p))return;event.preventDefault();event.stopImmediatePropagation();
    if(preview){showWarning('Keep or cancel the removal preview first.');return;}
    gesture={x:event.clientX,y:event.clientY,pointer:event.pointerId,start:p};el.pageLayer.setPointerCapture(event.pointerId);
  },true);
  el.pageLayer.addEventListener('pointerup',event=>{
    if(!gesture||event.pointerId!==gesture.pointer)return;const start=gesture;gesture=null;event.preventDefault();event.stopImmediatePropagation();
    if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>6){
      const end=eventPoint(event),left=Math.min(start.start.x,end.x),right=Math.max(start.start.x,end.x),top=Math.min(start.start.y,end.y),bottom=Math.max(start.start.y,end.y);
      const list=available().filter(o=>{const r=o.rect,points=[[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]].map(p=>viewport.convertToViewportPoint(...p));return points.every(p=>p[0]/dpr()>=left&&p[0]/dpr()<=right&&p[1]/dpr()>=top&&p[1]/dpr()<=bottom);});
      if(!event.shiftKey)chosen.clear();for(const item of list)chosen.add(item.key);hover=[];drawOverlay();return;
    }
    const p=eventPoint(event);if(!inside(p))return;const q=cssToPdf(p),item=hit(q.x,q.y),members=group(item),allSelected=members.length&&members.every(o=>chosen.has(o.key));
    if(!event.shiftKey)chosen.clear();for(const o of members){if(allSelected)chosen.delete(o.key);else chosen.add(o.key);}hover=[];drawOverlay();
  },true);
  el.pageLayer.addEventListener('pointermove',event=>{
    if(el.tool.value!=='removeObjects'||preview||!pdfDocRender)return;
    if(gesture){gesture.end=eventPoint(event);drawOverlay();return;}
    const p=eventPoint(event),q=inside(p)?cssToPdf(p):null,next=group(q?hit(q.x,q.y):null).map(o=>o.key);
    if(next.join('|')!==hover.join('|')){hover=next;drawOverlay();}
  });
  el.pageLayer.addEventListener('pointerleave',()=>{if(!gesture&&hover.length){hover=[];drawOverlay();}});
  el.pageLayer.addEventListener('pointercancel',()=>{gesture=null;});
  el.pageLayer.addEventListener('mousedown',event=>{if(el.tool.value==='removeObjects'){event.preventDefault();event.stopImmediatePropagation();}},true);
  window.addEventListener('keydown',event=>{
    if(el.tool.value!=='removeObjects'||isTyping())return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();reset();}
    if(['Delete','Backspace'].includes(event.key)&&chosen.size){event.preventDefault();event.stopImmediatePropagation();if(!preview)previewButton.click();}
  },true);
  el.tool.addEventListener('change',()=>{const active=el.tool.value==='removeObjects';if(!active)reset();el.pageLayer.classList.toggle('removing-objects',el.tool.value==='removeObjects');update();if(pdfDocRender&&lastToolActive!==active)renderPending=renderPage(currentPageIndex).catch(e=>showError(e.message));lastToolActive=active;});
  el.file.addEventListener('change',()=>{invalidate();lastSignature=null;});
  const baseUndo=undo,baseRedo=redo;
  function history(action){const before=JSON.stringify(removals());gesture=null;chosen.clear();hover=[];preview=false;previewReady=false;action();drawOverlay();if(before!==JSON.stringify(removals()))window.dispatchEvent(new Event('pdf-objects-changed'));}
  undo=()=>history(baseUndo);redo=()=>history(baseRedo);

  window.PdfObjectRemoval={renderDisplay,apply:engine.apply,whenIdle:()=>renderPending};
})();
