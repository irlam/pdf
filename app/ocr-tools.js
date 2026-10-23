/* High-resolution OCR, temporary word boxes and staged text replacements. */
(() => {
  const pageButton=document.getElementById('ocrPage'),selectionButton=document.getElementById('ocrSelection');
  let active=false,selectionLayer=null;
  let recognised=[],recognisedDocument=null,recognisedPage=-1,resultLayer=null;
  const editButton=document.getElementById("ocrEditText");
  const dialog=document.getElementById("ocrTextDialog"),input=document.getElementById("ocrReplacementText");
  let editing=null;
  function hideResults(){resultLayer?.remove();resultLayer=null;}
  function showResults(){
    hideResults();
    if(!editButton.checked||recognisedDocument!==pdfDocRender||recognisedPage!==currentPageIndex||el.tool.value!=="ocr")return;
    resultLayer=document.createElement("div");resultLayer.className="ocr-results-layer";
    for(const word of recognised){
      const points=word.corners.map(p=>viewport.convertToViewportPoint(p.x,p.y)),xs=points.map(p=>p[0]/dpr()),ys=points.map(p=>p[1]/dpr());
      const w=Math.hypot(xs[1]-xs[0],ys[1]-ys[0]),h=Math.hypot(xs[3]-xs[0],ys[3]-ys[0]),angle=Math.atan2(ys[1]-ys[0],xs[1]-xs[0])*180/Math.PI;
      const rect={x:(xs[0]+xs[2]-w)/2,y:(ys[0]+ys[2]-h)/2,w,h};
      const button=document.createElement("button");button.type="button";button.className="ocr-word";button.setAttribute("aria-label","Edit recognised text: "+word.text);button.title=word.text+" — click to edit";
      Object.assign(button.style,{left:rect.x+"px",top:rect.y+"px",width:Math.max(8,rect.w)+"px",height:Math.max(8,rect.h)+"px",transform:"rotate("+angle+"deg)"});
      button.onclick=()=>{editing={word,rect,angle,document:pdfDocRender,page:currentPageIndex};const item=edits.find(it=>it.id===word.editId);input.value=item?.text??word.text;document.getElementById("ocrTextColour").value=item?.color||"#000000";document.getElementById("ocrCoverColour").value=item?.cover||"#ffffff";dialog.showModal();input.focus();input.select();};resultLayer.append(button);
    }
    el.pageLayer.append(resultLayer);
  }
  editButton.onchange=showResults;
  document.getElementById("ocrTextCancel").onclick=()=>dialog.close();
  document.getElementById("ocrTextForm").onsubmit=async event=>{
    event.preventDefault();if(!editing)return;
    if(editing.document!==pdfDocRender||editing.page!==currentPageIndex){dialog.close();return showWarning("The PDF changed. Run OCR again.");}
    const pending=editing,text=input.value.replace(/[\r\n]+/g," ");
    try{const font=await pdfDocWriter.embedFont(PDFLib.StandardFonts.Helvetica);font.encodeText(text);}catch{showWarning("This text needs a font that supports its characters. This replacement tool currently supports Western European text.");return;}
    if(!dialog.open||editing!==pending||pending.document!==pdfDocRender||pending.page!==currentPageIndex)return;
    const existing=edits.find(it=>it.id===editing.word.editId);
    pushHistory();
    const item=existing||{id:nextId++,type:"text",ocrText:true,page:currentPageIndex,rectCss:{...editing.rect},rot:editing.angle,fontFamily:"Helvetica",align:"left"};
    Object.assign(item,{text,color:document.getElementById("ocrTextColour").value,cover:document.getElementById("ocrCoverColour").value});
    if(!existing)edits.push(item);editing.word.editId=item.id;selectedIds=[item.id];dialog.close();drawOverlay();showResults();showSuccess("Text replacement staged. Use Select to move it, or Undo to revert.");
  };
  const render=renderPage;renderPage=async function(...args){hideResults();await render(...args);showResults();};
  el.tool.addEventListener("change",showResults);
  el.file.addEventListener("change",()=>{recognised=[];hideResults();dialog.close();});
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
  function tileText(result,tile,seen,plan){
    if(!result.lines?.length)return result.text||'';
    const lines=[];
    for(const line of result.lines){
      const words=[];
      for(const word of line.words||[]){
        const box={x0:word.bbox.x0+tile.x,y0:word.bbox.y0+tile.y,x1:word.bbox.x1+tile.x,y1:word.bbox.y1+tile.y},key=word.text.trim().toLowerCase();
        const duplicate=seen.some(old=>{if(old.tile===tile||old.key!==key)return false;const overlap=Math.max(0,Math.min(old.box.x1,box.x1)-Math.max(old.box.x0,box.x0))*Math.max(0,Math.min(old.box.y1,box.y1)-Math.max(old.box.y0,box.y0));return overlap>.5*Math.min((box.x1-box.x0)*(box.y1-box.y0),(old.box.x1-old.box.x0)*(old.box.y1-old.box.y0));});
        if(!duplicate){seen.push({key,box,tile,text:word.text,corners:[[box.x0,box.y0],[box.x1,box.y0],[box.x1,box.y1],[box.x0,box.y1]].map(p=>{const q=plan.vp.convertToPdfPoint(...p);return {x:q[0],y:q[1]};})});words.push(word.text);}
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
      const sourceDocument=pdfDocRender,sourcePage=currentPageIndex;
      const plan=await prepareImage(selection),parts=[],seen=[];let words=0;
      const layout=document.getElementById('ocrLayout').value;
      const psm=layout==='auto'?(selection?'11':'3'):layout;
      for(let i=0;i<plan.tiles.length;i++){
        controls(true);showLoading(`Preparing OCR section ${i+1} of ${plan.tiles.length}…`);
        canvas=await renderImage(plan,plan.tiles[i]);hideLoading();
        const result=await performOCR(canvas,{psm,dpi:plan.dpi});controls(true);
        canvas.width=canvas.height=1;canvas=null;if(!result)return;
        words+=result.words?.length||0;
        const sectionText=tileText(result,plan.tiles[i],seen,plan);
        parts.push(plan.tiles.length===1?result.text:sectionText);
      }
      const text=parts.filter(Boolean).join('\n').trim();if(!text){showWarning('No text detected. Try Drawing labels for scattered text, or select a smaller area.');return;}
      if(sourceDocument===pdfDocRender&&sourcePage===currentPageIndex){recognised=seen;recognisedDocument=sourceDocument;recognisedPage=sourcePage;showResults();}
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
