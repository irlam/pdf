/* OCR image preparation and a temporary, non-editing selection overlay. */
(() => {
  const pageButton=document.getElementById('ocrPage'),selectionButton=document.getElementById('ocrSelection');
  let active=false,selectionLayer=null;
  function cancelSelection(){selectionLayer?.remove();selectionLayer=null;selectionButton.textContent='OCR Selection';selectionButton.setAttribute('aria-pressed','false');}
  function controls(disabled){pageButton.disabled=disabled;selectionButton.disabled=disabled;}
  async function prepareImage(selection){
    const page=await pdfDocRender.getPage(currentPageIndex+1),rotation=viewport.rotation;
    const dpi=Number(document.getElementById('ocrDpi').value)||300,scale=dpi/72;
    const vp=page.getViewport({scale,rotation});
    let x=0,y=0,w=vp.width,h=vp.height;
    if(selection){
      const r=selection,points=[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}].map(p=>{const pdf=cssToPdf(p);return vp.convertToViewportPoint(pdf.x,pdf.y);});
      x=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0]))));y=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1]))));
      w=Math.min(vp.width-x,Math.ceil(Math.max(...points.map(p=>p[0])))-x);h=Math.min(vp.height-y,Math.ceil(Math.max(...points.map(p=>p[1])))-y);
    }
    if(w<1||h<1)throw new Error('Select a larger area inside the PDF.');
    // Process large plans in overlapping sections instead of lowering their DPI.
    if(w*h<=20000000)return {page,vp,dpi,tiles:[{x,y,w:Math.ceil(w),h:Math.ceil(h)}]};
    const size=3200,overlap=256,cols=w<=size?1:Math.ceil((w-overlap)/(size-overlap)),rows=h<=size?1:Math.ceil((h-overlap)/(size-overlap)),tiles=[];
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const left=Math.max(0,Math.floor(col*w/cols-(col?overlap/2:0))),top=Math.max(0,Math.floor(row*h/rows-(row?overlap/2:0)));
      const right=Math.min(w,Math.ceil((col+1)*w/cols+(col<cols-1?overlap/2:0))),bottom=Math.min(h,Math.ceil((row+1)*h/rows+(row<rows-1?overlap/2:0)));
      tiles.push({x:x+left,y:y+top,w:Math.ceil(right-left),h:Math.ceil(bottom-top)});
    }
    return {page,vp,dpi,tiles};
  }
  async function renderImage(plan,tile){
    const canvas=document.createElement('canvas');canvas.width=tile.w;canvas.height=tile.h;
    const context=canvas.getContext('2d',{alpha:false});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    await plan.page.render({canvasContext:context,viewport:plan.vp,transform:[1,0,0,1,-tile.x,-tile.y],background:'#ffffff'}).promise;
    return canvas;
  }
  function tileText(result,tile,seen){
    if(!result.lines?.length)return result.text||'';
    const lines=[];
    for(const line of result.lines){
      const words=[];
      for(const word of line.words||[]){
        const box={x0:word.bbox.x0+tile.x,y0:word.bbox.y0+tile.y,x1:word.bbox.x1+tile.x,y1:word.bbox.y1+tile.y},key=word.text.trim().toLowerCase();
        const duplicate=seen.some(old=>{if(old.tile===tile||old.key!==key)return false;const overlap=Math.max(0,Math.min(old.box.x1,box.x1)-Math.max(old.box.x0,box.x0))*Math.max(0,Math.min(old.box.y1,box.y1)-Math.max(old.box.y0,box.y0));return overlap>.5*Math.min((box.x1-box.x0)*(box.y1-box.y0),(old.box.x1-old.box.x0)*(old.box.y1-old.box.y0));});
        if(!duplicate){seen.push({key,box,tile});words.push(word.text);}
      }
      if(words.length)lines.push(words.join(' '));
    }
    return lines.join('\n');
  }
  async function recognize(selection){
    if(active||ocrRunning){showWarning('OCR is already running. Please wait.');return;}
    if(!pdfDocRender){showWarning('Open a PDF first.');return;}
    active=true;cancelSelection();controls(true);let canvas;
    try{
      showLoading(selection?'Preparing selected area for OCR…':'Preparing high-resolution page for OCR…');
      const plan=await prepareImage(selection),parts=[],seen=[];let words=0;
      const layout=document.getElementById('ocrLayout').value;
      const psm=layout==='auto'?(selection?'11':'3'):layout;
      for(let i=0;i<plan.tiles.length;i++){
        controls(true);showLoading(`Preparing OCR section ${i+1} of ${plan.tiles.length}…`);
        canvas=await renderImage(plan,plan.tiles[i]);hideLoading();
        const result=await performOCR(canvas,{psm,dpi:plan.dpi});controls(true);
        canvas.width=canvas.height=1;canvas=null;if(!result)return;
        words+=result.words?.length||0;
        parts.push(plan.tiles.length===1?result.text:tileText(result,plan.tiles[i],seen));
      }
      const text=parts.filter(Boolean).join('\n').trim();if(!text){showWarning('No text detected. Try Drawing labels for scattered text, or select a smaller area.');return;}
      try{await navigator.clipboard.writeText(text);showSuccess(`OCR complete! ${plan.tiles.length>1?seen.length:words} words copied to clipboard.`);}catch{alert('OCR Result:\n\n'+text);}
    }catch(error){console.error(error);showError('OCR failed: '+(error.message||error));}
    finally{if(canvas)canvas.width=canvas.height=1;hideLoading();controls(false);active=false;}
  }
  pageButton.onclick=()=>recognize();
  selectionButton.onclick=()=>{
    if(selectionLayer){cancelSelection();return;}
    if(active||ocrRunning)return;
    if(!pdfDocRender){showWarning('Open a PDF first.');return;}
    const layer=document.createElement('div');selectionLayer=layer;layer.className='ocr-selection-layer';layer.setAttribute('aria-label','Drag an OCR text selection');
    const box=document.createElement('div');box.className='ocr-selection-box';box.hidden=true;layer.append(box);el.pageLayer.append(layer);
    const pageIndex=currentPageIndex,startViewport=viewport;let start=null,pointer=null;
    const point=event=>{const r=el.pdfCanvas.getBoundingClientRect();return {x:clamp(event.clientX-r.left,0,r.width),y:clamp(event.clientY-r.top,0,r.height)};};
    layer.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();start=point(event);pointer=event.pointerId;layer.setPointerCapture(pointer);box.hidden=false;});
    layer.addEventListener('pointermove',event=>{if(!start||pointer!==event.pointerId)return;const r=normalizeCssRect(start,point(event));Object.assign(box.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});});
    layer.addEventListener('pointerup',event=>{if(!start||pointer!==event.pointerId)return;event.preventDefault();event.stopPropagation();const r=normalizeCssRect(start,point(event));cancelSelection();if(currentPageIndex!==pageIndex||viewport!==startViewport){showWarning('The view changed. Select the OCR area again.');return;}if(r.w<5||r.h<5){showWarning('Drag a larger OCR selection box.');return;}recognize(r);});
    layer.addEventListener('pointercancel',cancelSelection);layer.addEventListener('mousedown',event=>{event.preventDefault();event.stopPropagation();});
    selectionButton.textContent='Cancel OCR selection';selectionButton.setAttribute('aria-pressed','true');showSuccess('Drag a box around the text to recognise. Escape cancels.');
  };
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&selectionLayer){event.preventDefault();event.stopImmediatePropagation();cancelSelection();}},true);
  el.tool.addEventListener('change',cancelSelection);el.file.addEventListener('change',cancelSelection);
})();
