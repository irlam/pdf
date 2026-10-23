/* Professional workspace: client-side drafts, markup and page management.
   Classic script intentionally shares the existing editor's lexical state. */
(function studio(){
  'use strict';
  // Share scale state even when an older drawing add-on is cached.
  window.pdfDrawingScale ||= { ratio: 100, units: 'mm' };
  const $ = id => document.getElementById(id);
  const TYPES = new Set(['highlight','pen','ellipse','cloud','callout','stamp','signature','area','perimeter']);
  const DRAW_TYPES = new Set(['box','line','arrow','dimension',...TYPES]);
  let fileName = 'Untitled PDF', dirty = false, saving = false, saveAgain = false;
  let saveTimer, dbPromise, thumbGeneration = 0, lastCommentId = null, lastState = '';
  const stateSignature=()=>JSON.stringify({edits,rotations:pageRotDelta,scale:window.pdfDrawingScale});
  let gesture = null, polygon = [], polygonPage = null, polygonTool = null, busy = false;
  const MAX_DRAFT_BYTES = 100 * 1024 * 1024;
  const node = (tag, attrs={}, text='') => {
    const n=document.createElement(tag); Object.assign(n,attrs); if(text)n.textContent=text; return n;
  };
  const button = (text, fn, attrs={}) => { const b=node('button',{type:'button',...attrs},text); b.addEventListener('click',fn); return b; };
  const section = (title,id) => {const s=node('section',{className:'sidebar-section',id});s.append(node('h4',{},title));return s;};
  const sidebar=$('sidebar'), viewer=document.querySelector('.viewer-area');
  sidebar.classList.add('collapsed');
  sidebar.querySelectorAll('h4').forEach(h=>h.textContent=h.textContent.replace(/^[^A-Za-z]+/u,''));
  const toolbar=document.querySelector('.top-toolbar'), status=document.querySelector('.status-bar');
  const pages=node('aside',{className:'pages-panel',id:'pagesPanel'});
  pages.setAttribute('aria-label','Document pages');
  const pagesHeading=node('h2',{className:'panel-heading'},'Pages');
  const closePages=button('×',()=>togglePages(),{className:'panel-close',title:'Close pages'});closePages.setAttribute('aria-label','Close pages');pagesHeading.append(closePages);pages.append(pagesHeading);
  const pageButtons=node('div',{className:'page-action-row'});
  pageButtons.append(button('Previous',()=>navigate(-1)),button('Next',()=>navigate(1)));
  pages.append(pageButtons);
  const thumbs=node('div',{id:'pageThumbnails'});pages.append(thumbs);
  document.querySelector('.main-layout').prepend(pages);
  const pageSection=el.pageInsertBefore.closest('.sidebar-section');
  pages.append(pageSection);
  pageSection.querySelector('h4').textContent='Organise pages';
  const rotateRow=node('div',{className:'page-action-row'});rotateRow.append(el.pageRotL,el.pageRotR);pages.append(rotateRow);
  const propsHeading=node('h2',{className:'panel-heading'},'Properties');
  propsHeading.append(button('Close',()=>{if(innerWidth>900)sidebar.classList.add('collapsed');else sidebar.classList.remove('open');syncPanelButtons();if(pdfDocRender)renderPage(currentPageIndex,true).catch(showFailure);},{className:'properties-toggle'}));sidebar.prepend(propsHeading);
  const fileInput=el.file;fileInput.classList.add('file-input');fileInput.hidden=true;
  toolbar.replaceChildren();
  toolbar.append(button('Open PDF',()=>fileInput.click()),fileInput);
  const docInfo=node('div',{className:'document-info'});
  const documentName=node('div',{className:'document-name'},fileName);
  const draftStatus=node('div',{className:'draft-status',role:'status'},'No document open');docInfo.append(documentName,draftStatus);toolbar.append(docInfo);
  const docActions=node('div',{className:'document-actions'});
  const pagesToggle=button('Pages',togglePages,{'aria-controls':'pagesPanel'});
  const propertiesToggle=button('Properties',toggleProperties,{className:'properties-toggle','aria-controls':'sidebar'});
  const focusToggle=button('Focus PDF',toggleFocus,{'aria-pressed':'false',title:'Hide panels and the tool row for a larger document view'});
  pagesToggle.setAttribute('aria-controls','pagesPanel');propertiesToggle.setAttribute('aria-controls','sidebar');focusToggle.setAttribute('aria-pressed','false');
  docActions.append(pagesToggle,propertiesToggle,focusToggle);
  const restoreButton=button('Restore draft',()=>{draftMenu.open=false;restoreDraft();});
  const saveDraftButton=button('Save draft',()=>{draftMenu.open=false;saveDraft(true);});
  const clearDraftButton=button('Clear draft',clearDraft);
  const draftMenu=node('details',{className:'document-menu'}),draftSummary=node('summary',{},'Drafts');
  const draftActions=node('div',{className:'document-menu-content'});draftActions.append(restoreButton,saveDraftButton);draftMenu.append(draftSummary,draftActions);
  docActions.append(draftMenu,el.download);toolbar.append(docActions);
  el.download.textContent='Download PDF';
  const empty=node('div',{className:'empty-state',id:'editorEmpty'});
  empty.append(node('div',{className:'empty-icon'},'▤'),node('h1',{},'Your document. Your workspace.'),node('p',{},'Open a PDF to edit, review, sign and measure. Recoverable drafts stay in this browser.'),button('Choose a PDF',()=>fileInput.click()));
  $('viewerShell').append(empty);el.pageLayer.hidden=true;
  const zoomControls=node('div',{className:'page-action-row'});zoomControls.style.margin='0';zoomControls.append(el.zoomOut,el.zoomPct,el.zoomIn,el.zoomReset,el.pageInfo);
  el.zoomReset.textContent='Fit width';
  el.zoomReset.onclick=()=>{fitMode='width';if(pdfDocRender)renderPage(currentPageIndex,true).catch(showFailure);};
  const fitPageButton=button('Fit page',()=>{fitMode='page';if(pdfDocRender)renderPage(currentPageIndex,true).catch(showFailure);});zoomControls.append(fitPageButton);
  const shortcuts=node('details',{className:'keyboard-help'});shortcuts.append(node('summary',{},'Shortcuts'));
  const shortcutList=node('div',{className:'keyboard-help-content'});while(status.firstChild)shortcutList.append(status.firstChild);shortcuts.append(shortcutList);
  status.append(shortcuts,zoomControls);
  const instruction=node('div',{className:'tool-instruction'});status.prepend(instruction);
  const toolLabels={highlight:'Highlight',pen:'Freehand pen',ellipse:'Ellipse',cloud:'Revision cloud',callout:'Comment / callout',stamp:'Stamp',signature:'Signature',area:'Measure area',perimeter:'Measure perimeter'};
  for(const [value,label] of Object.entries(toolLabels))el.tool.append(node('option',{value},label));
  const strip=node('div',{className:'tool-strip',role:'toolbar'});strip.setAttribute('aria-label','Editing tools');
  const quick=['select','editText','line','arrow','highlight','pen','callout'];
  for(const value of quick){
    const option=[...el.tool.options].find(o=>o.value===value);
    const b=button(value==='editText'?'Text':value==='select'?'Select':value==='pen'?'Pen':value==='callout'?'Comment':option.textContent,()=>chooseTool(value));
    b.dataset.tool=value;b.setAttribute('aria-pressed','false');strip.append(b);
  }
  const moreTools=node('select',{className:'more-tools','aria-label':'All editing tools'});
  moreTools.setAttribute('aria-label','All editing tools');
  moreTools.append(node('option',{value:''},'More tools…'));
  for(const option of el.tool.options)moreTools.append(node('option',{value:option.value},option.textContent));
  moreTools.addEventListener('change',()=>{if(moreTools.value)chooseTool(moreTools.value);});strip.append(moreTools);
  const historyGroup=node('span',{className:'page-action-row'});historyGroup.style.margin='0';historyGroup.append(el.undo,el.redo);strip.append(historyGroup);
  toolbar.after(strip);
  el.tool.closest('.sidebar-section').querySelector('h4').textContent='Active tool';
  const redactInfo=node('p',{className:'muted'},'Secure redaction rebuilds affected pages as images. Covered content is removed; text on those pages is no longer searchable. Apply only when ready.');redactInfo.style.fontSize='12px';$('redactSettings').append(redactInfo);
  const markProps=section('Markup','markupSettings');
  markProps.append(node('label',{},'Opacity'));
  const opacity=node('input',{type:'range',min:'0.1',max:'1',step:'0.05',value:'0.3',id:'markupOpacity'});opacity.setAttribute('aria-label','Highlight opacity');markProps.append(opacity);
  const stampSelect=node('select',{id:'stampPreset'});stampSelect.setAttribute('aria-label','Stamp preset');
  ['APPROVED','REVIEWED','DRAFT','CONFIDENTIAL','REJECTED','CUSTOM'].forEach(value=>stampSelect.append(node('option',{value},value)));
  const stampText=node('input',{type:'text',id:'stampText',placeholder:'Custom stamp text',maxLength:80});
  markProps.append(stampSelect,stampText,button('Save custom stamp',()=>{const text=stampText.value.trim();if(!text)return;try{localStorage.setItem('pdf-studio-stamp',text);stampSelect.value='CUSTOM';showSuccess('Custom stamp saved.');}catch{showWarning('This browser cannot save stamps.');}}));
  const signatureButton=button('Create / replace signature',openSignature);markProps.append(signatureButton);
  const finishButton=button('Finish measurement',finishPolygon);markProps.append(finishButton);
  sidebar.insertBefore(markProps,$('textSettings'));
  const measureProps=section('Measurement scale','measurementSettings');
  measureProps.append(node('p',{className:'muted'},'Set the scale for each new measurement. Verify against a known dimension.'));
  const scaleRatio=node('input',{type:'number',value:'100',min:'0.001',max:'1000000',step:'any',id:'measurementScale'});scaleRatio.setAttribute('aria-label','Drawing scale denominator');
  const ratioLabel=node('label',{},'Scale 1 :');ratioLabel.append(scaleRatio);measureProps.append(ratioLabel);
  const measureUnits=node('select',{id:'measurementUnits'});measureUnits.setAttribute('aria-label','Measurement units');['m','mm','cm','ft','in'].forEach(value=>measureUnits.append(node('option',{value},value)));measureProps.append(measureUnits);
  scaleRatio.value=window.pdfDrawingScale.ratio;measureUnits.value=window.pdfDrawingScale.units;
  const syncScale=()=>{const ratio=Number(scaleRatio.value);if(Number.isFinite(ratio)&&ratio>0){window.pdfDrawingScale.ratio=ratio;window.pdfDrawingScale.units=measureUnits.value;$('units').value=measureUnits.value;drawOverlay();markDirty();}};
  scaleRatio.addEventListener('change',syncScale);measureUnits.addEventListener('change',syncScale);
  window.addEventListener('pdf-scale-change',()=>{scaleRatio.value=window.pdfDrawingScale.ratio;measureUnits.value=window.pdfDrawingScale.units;drawOverlay();markDirty();});
  measureProps.append($('calibrate'),$('autoScale'));$('units').closest('label').hidden=true;
  const calibrateButton=button('Calibrate from selected line',()=>{
    const it=edits.find(it=>selectedIds.includes(it.id)&&it.page===currentPageIndex&&['line','arrow','dimension'].includes(it.type));
    if(!it)return showWarning('Select an existing line or dimension first.');
    const a=cssToPdf({x:it.rectCss.x+it.a.x,y:it.rectCss.y+it.a.y},it.page),b=cssToPdf({x:it.rectCss.x+it.b.x,y:it.rectCss.y+it.b.y},it.page);
    const distance=Number(prompt(`Known length in ${measureUnits.value}:`));const units={m:1000,mm:1,cm:10,ft:304.8,in:25.4};
    if(!(distance>0)||Math.hypot(a.x-b.x,a.y-b.y)<.01)return showWarning('Enter a positive distance for a non-zero line.');
    scaleRatio.value=(distance*units[measureUnits.value]/(Math.hypot(a.x-b.x,a.y-b.y)*25.4/72)).toFixed(4);syncScale();showSuccess('Measurement scale calibrated.');
  });measureProps.append(calibrateButton);sidebar.insertBefore(measureProps,$('textSettings'));
  const comments=section('Comments / callouts','commentSettings');
  const commentText=node('textarea',{id:'commentText',placeholder:'Write a comment, then click the page to place it.',maxLength:1000});commentText.setAttribute('aria-label','Comment text');
  comments.append(commentText,button('Update selected comment',()=>{const selected=edits.filter(it=>it.type==='callout'&&it.page===currentPageIndex&&selectedIds.includes(it.id));if(!selected.length)return showWarning('Select a callout first.');if(!commentText.value.trim())return;pushHistory();selected.forEach(it=>it.text=commentText.value.trim());drawOverlay();markDirty();}));
  const commentList=node('div',{className:'comment-list'});comments.append(commentList);sidebar.insertBefore(comments,$('textSettings'));
  const saveSection=el.save.closest('.sidebar-section');saveSection.querySelector('h4').textContent='Apply / server versions';el.apply.textContent='Apply annotations to PDF';
  saveSection.append(clearDraftButton,node('p',{className:'muted'},'Applying embeds annotations permanently. The pre-apply draft retains the original document, including content later redacted. Clear that draft when it is no longer needed.'));
  for(const source of [el.snap.closest('.sidebar-section'),el.rotL.closest('.sidebar-section'),el.duplicate.closest('.sidebar-section'),saveSection]){
    const detail=node('details',{className:'sidebar-section'}),summary=node('summary',{},source.querySelector('h4').textContent);
    detail.append(summary);source.querySelector('h4').remove();while(source.firstChild)detail.append(source.firstChild);source.replaceWith(detail);
  }
  try{stampText.value=localStorage.getItem('pdf-studio-stamp')||'';}catch{}

  let focusPanels=null;
  function syncPanelButtons(){pagesToggle.setAttribute('aria-expanded',String(innerWidth>600?!pages.classList.contains('collapsed'):pages.classList.contains('open')));propertiesToggle.setAttribute('aria-expanded',String(innerWidth>900?!sidebar.classList.contains('collapsed'):sidebar.classList.contains('open')));}
  function toggleFocus(){
    if(!focusPanels){focusPanels={pages:pages.className,sidebar:sidebar.className};pages.classList.add('collapsed');sidebar.classList.add('collapsed');pages.classList.remove('open');sidebar.classList.remove('open');document.body.classList.add('pdf-focus');focusToggle.textContent='Exit focus';focusToggle.setAttribute('aria-pressed','true');}
    else{pages.className=focusPanels.pages;sidebar.className=focusPanels.sidebar;focusPanels=null;document.body.classList.remove('pdf-focus');focusToggle.textContent='Focus PDF';focusToggle.setAttribute('aria-pressed','false');}
    syncPanelButtons();if(pdfDocRender)renderPage(currentPageIndex,true).catch(showFailure);
  }
  function showProperties(){if(innerWidth>900)sidebar.classList.remove('collapsed');else{sidebar.classList.remove('collapsed');sidebar.classList.add('open');pages.classList.remove('open');}syncPanelButtons();if(pdfDocRender)renderPage(currentPageIndex,true).catch(showFailure);}
  function togglePages(){if(focusPanels)toggleFocus();if(innerWidth>600)pages.classList.toggle('collapsed');else{pages.classList.remove('collapsed');pages.classList.toggle('open');sidebar.classList.remove('open');}syncPanelButtons();if(pdfDocRender)renderPage(currentPageIndex,true).catch(showFailure);}
  function toggleProperties(){if(focusPanels)toggleFocus();if(innerWidth>900)sidebar.classList.toggle('collapsed');else{sidebar.classList.remove('collapsed');sidebar.classList.toggle('open');pages.classList.remove('open');}syncPanelButtons();if(pdfDocRender)renderPage(currentPageIndex,true).catch(showFailure);}
  syncPanelButtons();window.addEventListener('resize',syncPanelButtons);
  function chooseTool(value){cancelGesture();el.tool.value=value;el.tool.dispatchEvent(new Event('change'));if(!['select','pen'].includes(value))showProperties();}
  function syncTools(){
    const tool=el.tool.value;
    moreTools.value=quick.includes(tool)?'':tool;
    strip.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool)));
    const selection=edits.filter(it=>it.page===currentPageIndex&&selectedIds.includes(it.id));
    $('drawingSettings').hidden=!DRAW_TYPES.has(tool)&&!(tool==='select'&&selection.some(it=>DRAW_TYPES.has(it.type))); $('boxFillSetting').hidden=!['box','select'].includes(tool);
    markProps.hidden=!['highlight','stamp','signature','area','perimeter'].includes(tool);
    opacity.hidden=tool!=='highlight';markProps.querySelector('label').hidden=tool!=='highlight';stampSelect.hidden=stampText.hidden=tool!=='stamp';
    markProps.querySelectorAll('button')[0].hidden=tool!=='stamp';signatureButton.hidden=tool!=='signature';finishButton.hidden=!['area','perimeter'].includes(tool);
    measureProps.hidden=!['area','perimeter','dimension'].includes(tool)&&!(tool==='select'&&selection.some(it=>['line','arrow','dimension'].includes(it.type)));comments.hidden=tool!=='callout'&&!(tool==='select'&&edits.some(it=>it.type==='callout'));
    instruction.textContent={area:'Click polygon corners, then Finish measurement. Escape cancels.',perimeter:'Click path points, then Finish measurement. Escape cancels.',callout:'Write a comment in Properties, then click to place.',signature:'Create or reuse a signature, then drag to place.',redact:'Draw over content to remove. Redaction takes effect when applied.'}[tool]||'Select an object to move or resize. Shift selects multiple objects.';
    el.scroller.style.cursor=tool==='select'?'default':'crosshair';
  }
  el.tool.addEventListener('change',()=>{cancelGesture();syncTools();});syncTools();

  function navigate(delta){if(!pdfDocRender||busy)return;cancelGesture();currentPageIndex=clamp(currentPageIndex+delta,0,pageCount-1);selectedIds=[];renderPage(currentPageIndex,true).catch(showFailure);}
  const render=renderPage;
  let renderChain=Promise.resolve();
  renderPage=function(index,reset=false){
    renderChain=renderChain.catch(()=>{}).then(async()=>{await render(index,reset);empty.hidden=!!pdfDocWriter;el.pageLayer.hidden=!pdfDocWriter;syncThumbSelection();});return renderChain;
  };
  const originalLoad=loadBoth;
  loadBoth=async function(bytes){await originalLoad(bytes);await refreshThumbnails();empty.hidden=true;};
  const originalOverlay=drawOverlay;
  drawOverlay=function(){originalOverlay();drawMeasurementLabels();refreshComments();syncTools();};
  function syncThumbSelection(){thumbs.querySelectorAll('[data-page]').forEach(b=>b.setAttribute('aria-current',String(Number(b.dataset.page)===currentPageIndex)));}
  async function refreshThumbnails(){
    const generation=++thumbGeneration;thumbs.replaceChildren();if(!pdfDocRender)return;
    const doc=pdfDocRender;
    for(let i=0;i<doc.numPages;i++){
      const b=button(`Page ${i+1}`,async()=>{if(busy)return;cancelGesture();currentPageIndex=i;selectedIds=[];await renderPage(i,true);if(innerWidth<600)pages.classList.remove('open');});
      b.dataset.page=i;b.draggable=true;b.setAttribute('aria-label',`Page ${i+1}, drag to reorder`);b.className='thumbnail';
      const c=node('canvas');const label=node('span',{},`Page ${i+1}`);b.replaceChildren(c,label);thumbs.append(b);
      b.addEventListener('dragstart',e=>e.dataTransfer.setData('application/x-pdf-page',String(i)));
      b.addEventListener('dragover',e=>{if(!e.dataTransfer.types.includes('application/x-pdf-page'))return;e.preventDefault();b.classList.add('drag-over');});
      b.addEventListener('dragleave',()=>b.classList.remove('drag-over'));
      b.addEventListener('drop',e=>{if(!e.dataTransfer.types.includes('application/x-pdf-page'))return;e.preventDefault();e.stopPropagation();b.classList.remove('drag-over');const from=Number(e.dataTransfer.getData('application/x-pdf-page'));if(Number.isInteger(from)&&from>=0&&from<pageCount)pageOperation('move',from,i);});
      // Render thumbnails sequentially to avoid a burst of full-page work.
      const p=await doc.getPage(i+1);if(generation!==thumbGeneration)return;
      const vp=p.getViewport({scale:120/p.getViewport({scale:1}).width,rotation:(p.rotate+(pageRotDelta[i]||0))%360});
      c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
      if(generation!==thumbGeneration)return;
    }
    syncThumbSelection();
  }
  function refreshComments(){
    commentList.replaceChildren();const list=edits.filter(it=>it.type==='callout');
    for(const it of list){const b=button(`${it.number}. ${it.text}`,async()=>{currentPageIndex=it.page;selectedIds=[it.id];await renderPage(it.page,true);commentText.value=it.text;showProperties();});b.className='comment-card';b.append(node('small',{},`Page ${it.page+1}`));commentList.append(b);}
    if(!list.length)commentList.append(node('p',{className:'muted'},'No staged comments.'));
    const selected=edits.find(it=>it.type==='callout'&&selectedIds.includes(it.id));
    if(selected&&lastCommentId!==selected.id){commentText.value=selected.text;lastCommentId=selected.id;}if(!selected)lastCommentId=null;
  }

  /* IndexedDB stores the unflattened document plus editable annotations. */
  function draftDb(){
    if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('pdf-studio',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return dbPromise;
  }
  async function draftGet(){const db=await draftDb();return new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get('latest');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function draftPut(value){const db=await draftDb();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(value,'latest');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async function clearDraft(){if(saving||busy)return showWarning('Wait for the current operation to finish.');if(!confirm('Clear the saved browser draft? This removes its original document and editable annotations from this browser.'))return;clearTimeout(saveTimer);try{const db=await draftDb();await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').delete('latest');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});restoreButton.hidden=true;dirty=false;lastState=stateSignature();draftStatus.textContent='Browser draft cleared';showSuccess('Saved browser draft cleared.');}catch(e){showFailure(e);}}
  const blobData=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
  async function portableEdits(){
    const result=deepClone(edits);
    for(const it of result)if(it.imageUrl&&it.imageUrl.startsWith('blob:'))it.imageUrl=await blobData(await (await fetch(it.imageUrl)).blob());
    return result;
  }
  async function saveDraft(manual=false){
    if(!pdfDocWriter||busy)return;if(saving){saveAgain=true;return;}saving=true;const savingState=stateSignature();draftStatus.textContent='Saving draft…';
    try{
      // Writer save is non-destructive: staged annotations stay editable.
      const bytes=await pdfDocWriter.save();if(bytes.byteLength>MAX_DRAFT_BYTES)throw Error('Document exceeds the 100 MB draft limit. Download a copy instead.');
      const views={};for(const [i,v] of Object.entries(pageViewports))views[i]={scale:v.viewport.scale,rotation:v.viewport.rotation,pixelRatio:v.pixelRatio};
      const draft={version:1,name:fileName,bytes,scale:{...window.pdfDrawingScale},edits:await portableEdits(),views,rotations:[...pageRotDelta],page:currentPageIndex,nextId,settings:{...settings},font:customFontBytes?Array.from(customFontBytes):null,date:Date.now()};
      await draftPut(draft);dirty=stateSignature()!==savingState;if(dirty)saveAgain=true;draftStatus.textContent=`Draft saved ${new Date(draft.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;if(manual)showSuccess('Editable draft saved in this browser.');
    }catch(e){dirty=true;draftStatus.textContent='Draft not saved — download a copy';if(manual)showError(e.message||'Draft storage unavailable.');}
    finally{saving=false;if(saveAgain){saveAgain=false;scheduleSave();}}
  }
  function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveDraft(),1000);}
  function markDirty(){if(!pdfDocWriter)return;dirty=true;draftStatus.textContent='Unsaved changes';scheduleSave();refreshComments();}
  async function restoreDraft(){
    try{
      const draft=await draftGet();if(!draft)return showWarning('No saved draft in this browser.');
      if(pdfDocWriter&&!confirm('Replace the current document with the saved draft?'))return;
      busy=true;clearTimeout(saveTimer);showLoading('Restoring editable draft…');
      edits=[];pageViewports={};currentPageIndex=draft.page||0;await loadBoth(draft.bytes);
      edits=draft.edits;nextId=draft.nextId||1;settings={...settings,...draft.settings};pageRotDelta=draft.rotations||new Array(pageCount).fill(0);
      for(const [i,v] of Object.entries(draft.views||{})){const p=await pdfDocRender.getPage(Number(i)+1);pageViewports[i]={viewport:p.getViewport({scale:v.scale,rotation:v.rotation}),pixelRatio:v.pixelRatio};}
      if(draft.scale){Object.assign(window.pdfDrawingScale,draft.scale);scaleRatio.value=draft.scale.ratio;measureUnits.value=draft.scale.units;$('units').value=draft.scale.units;}
      customFontBytes=draft.font?new Uint8Array(draft.font):null;customFontEmbedded=null;undoStack=[];redoStack=[];selectedIds=[];fileName=draft.name;documentName.textContent=fileName;
      el.snap.checked=settings.snap;el.showGrid.checked=settings.showGrid;el.gridSize.value=settings.grid;
      await renderPage(currentPageIndex,true);await refreshThumbnails();dirty=false;lastState=stateSignature();draftStatus.textContent='Draft restored — annotations editable';
    }catch(e){showFailure(e);}finally{busy=false;hideLoading();}
  }
  draftGet().then(d=>{restoreButton.hidden=!d;if(d&&!pdfDocWriter)draftStatus.textContent=`Draft available: ${d.name}`;}).catch(()=>{draftStatus.textContent='Browser draft storage unavailable';});
  const openFile=handlePdfFile;
  let openingDocument=Promise.resolve();
  handlePdfFile=function(file,{sessionRestore=false}={}){
    openingDocument=(async()=>{
    if(!file||busy)return;
    if(pdfDocWriter&&dirty){await saveDraft();if(dirty&&!confirm('Current draft could not be saved. Open another document anyway?'))return;}
    clearTimeout(saveTimer);cancelGesture();const opened=await openFile(file);
    if(opened&&pdfDocWriter){fileName=file.name;documentName.textContent=fileName;if(sessionRestore){dirty=false;clearTimeout(saveTimer);lastState=stateSignature();}else{markDirty();restoreButton.hidden=false;}try{await PdfSession.save(await pdfDocWriter.save(),fileName);}catch(e){showWarning(e.message);}}
    })();return openingDocument;
  };
  window.addEventListener('mouseup',()=>{if(pdfDocWriter&&!busy&&stateSignature()!==lastState){lastState=stateSignature();markDirty();}});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  window.addEventListener('keydown',e=>{
    if(isTyping())return;
    if((e.ctrlKey||e.metaKey)&&['z','y','s'].includes(e.key.toLowerCase())){e.preventDefault();if(e.key.toLowerCase()==='s')saveDraft(true);else if(e.key.toLowerCase()==='y'||e.shiftKey)redo();else undo();markDirty();}
    if(e.key==='Escape'){cancelGesture();pages.classList.remove('open');sidebar.classList.remove('open');}
    if(e.key==='Enter'&&polygon.length)finishPolygon();
  });

  /* Page operations preserve unflattened annotations and remap page indexes. */
  async function pageOperation(action,from=currentPageIndex,to=0){
    if(!pdfDocWriter||busy)return;busy=true;cancelGesture();showLoading('Updating pages…');
    const oldDoc=pdfDocWriter,oldCount=oldDoc.getPageCount();
    try{
      const order=Array.from({length:oldCount},(_,i)=>i);
      if(action==='delete'){if(oldCount===1)return;order.splice(from,1);}
      if(action==='move'){const [p]=order.splice(from,1);order.splice(clamp(to,0,oldCount-1),0,p);}
      if(action==='duplicate')order.splice(from+1,0,from);
      if(action==='insert')order.splice(to,0,-1);
      const out=await PDFLib.PDFDocument.create();
      for(const index of order){if(index<0){const source=oldDoc.getPage(from);const size=source.getSize();out.addPage([size.width,size.height]);}else{const [p]=await out.copyPages(oldDoc,[index]);out.addPage(p);}}
      const nextEdits=[],views={},rotations=[];
      order.forEach((old,index)=>{
        rotations[index]=old<0?0:pageRotDelta[old]||0;if(pageViewports[old])views[index]=pageViewports[old];
        for(const it of edits.filter(it=>it.page===old)){const clone=deepClone(it);clone.page=index;if(action==='duplicate'&&index===from+1)clone.id=nextId++;nextEdits.push(clone);}
      });
      const bytes=await out.save();edits=[];pageViewports={};currentPageIndex=action==='move'?to:clamp(from,0,order.length-1);
      await loadBoth(bytes);edits=nextEdits;pageViewports=views;pageRotDelta=rotations;undoStack=[];redoStack=[];selectedIds=[];
      await renderPage(currentPageIndex,true);await refreshThumbnails();markDirty();
    }catch(e){showFailure(e);}finally{busy=false;hideLoading();scheduleSave();}
  }
  el.pageInsertBefore.onclick=()=>pageOperation('insert',currentPageIndex,currentPageIndex);
  el.pageInsertAfter.onclick=()=>pageOperation('insert',currentPageIndex,currentPageIndex+1);
  el.pageDuplicate.onclick=()=>pageOperation('duplicate');el.pageDelete.onclick=()=>pageOperation('delete');
  el.pageUp.onclick=()=>pageOperation('move',currentPageIndex,clamp(currentPageIndex-1,0,pageCount-1));
  el.pageDown.onclick=()=>pageOperation('move',currentPageIndex,clamp(currentPageIndex+1,0,pageCount-1));
  for(const b of [el.pageRotL,el.pageRotR])b.addEventListener('click',()=>{renderChain.then(refreshThumbnails).catch(showFailure);markDirty();});

  /* Markup paths use normalised points so selection resizing remains useful. */
  function cssPoint(e){const r=el.pdfCanvas.getBoundingClientRect();return {x:clamp(e.clientX-r.left,0,r.width),y:clamp(e.clientY-r.top,0,r.height)};}
  function onPage(e){const r=el.pdfCanvas.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;}
  function absolutePoints(it){const r=it.rectCss;return (it.points||[]).map(p=>({x:r.x+p.x*r.w,y:r.y+p.y*r.h}));}
  function normalisePoints(points){const xs=points.map(p=>p.x),ys=points.map(p=>p.y);const r={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(1,Math.max(...xs)-Math.min(...xs)),h:Math.max(1,Math.max(...ys)-Math.min(...ys))};return {rectCss:r,points:points.map(p=>({x:(p.x-r.x)/r.w,y:(p.y-r.y)/r.h}))};}
  function style(){const w=Number($('strokeWidth').value);return {stroke:$('strokeColor').value,width:Number.isFinite(w)&&w>0?clamp(w,1,20):2,dashed:$('strokeDashed').checked,opacity:Number(opacity.value),rot:0};}
  function addItem(it){pushHistory();it.id=nextId++;it.page=currentPageIndex;edits.push(it);selectedIds=[it.id];drawOverlay();markDirty();}
  function cancelGesture(){gesture=null;polygon=[];polygonPage=null;polygonTool=null;if(pdfDocRender)drawOverlay();}
  el.overlay.addEventListener('pointerdown',e=>{
    const tool=el.tool.value;if(!TYPES.has(tool)||!pdfDocWriter||busy||e.button!==0||!onPage(e))return;
    e.preventDefault();e.stopImmediatePropagation();el.overlay.setPointerCapture(e.pointerId);
    const p=cssPoint(e);
    if(['area','perimeter'].includes(tool)){
      if(polygonPage!==currentPageIndex||polygonTool!==tool){polygon=[];polygonPage=currentPageIndex;polygonTool=tool;}
      polygon.push(p);drawOverlay();drawPolygonPreview();return;
    }
    if(tool==='callout'){
      const text=commentText.value.trim();if(!text){showProperties();commentText.focus();return showWarning('Write the comment before placing it.');}
      const number=Math.max(0,...edits.filter(it=>it.type==='callout').map(it=>it.number||0))+1;
      addItem({type:'callout',text,number,rectCss:{x:p.x,y:p.y,w:Math.min(240,el.pdfCanvas.clientWidth-p.x),h:Math.min(96,el.pdfCanvas.clientHeight-p.y)},...style()});return;
    }
    gesture={tool,start:p,points:[p],pointer:e.pointerId};
  },true);
  el.overlay.addEventListener('pointermove',e=>{
    if(!gesture||gesture.pointer!==e.pointerId)return;e.preventDefault();const p=cssPoint(e);if(gesture.tool==='pen'&&Math.hypot(p.x-gesture.points.at(-1).x,p.y-gesture.points.at(-1).y)>1)gesture.points.push(p);
    drawOverlay();const it={type:gesture.tool,rectCss:normalizeCssRect(gesture.start,p),...style()};if(gesture.tool==='pen')Object.assign(it,normalisePoints(gesture.points));if(['stamp','signature'].includes(it.type))it.type='cloud';drawItem(it,false);
  },true);
  el.overlay.addEventListener('pointerup',e=>{
    if(!gesture||gesture.pointer!==e.pointerId)return;e.preventDefault();const g=gesture;gesture=null;const p=cssPoint(e);
    let r=normalizeCssRect(g.start,p);if(r.w<3&&r.h<3)r={x:p.x,y:p.y,w:180,h:g.tool==='stamp'?48:70};
    r.w=Math.max(1,r.w);r.h=Math.max(1,r.h);
    const it={type:g.tool,rectCss:r,...style()};if(g.tool==='pen'){g.points.push(p);Object.assign(it,normalisePoints(g.points));}
    if(g.tool==='stamp'){it.text=stampSelect.value==='CUSTOM'?stampText.value.trim():stampSelect.value;if(!it.text)return showWarning('Enter custom stamp text.');}
    if(g.tool==='signature'){try{it.imageUrl=localStorage.getItem('pdf-studio-signature');}catch{}if(!it.imageUrl){openSignature();return;}it.type='signature';}
    addItem(it);
  },true);
  el.overlay.addEventListener('pointercancel',cancelGesture);
  function drawPolygonPreview(){if(!polygon.length)return;overlayCtx.save();overlayCtx.strokeStyle=$('strokeColor').value;overlayCtx.fillStyle=$('strokeColor').value;overlayCtx.lineWidth=2*dpr();overlayCtx.beginPath();polygon.forEach((p,i)=>{if(i)overlayCtx.lineTo(p.x*dpr(),p.y*dpr());else overlayCtx.moveTo(p.x*dpr(),p.y*dpr());});overlayCtx.stroke();for(const p of polygon){overlayCtx.beginPath();overlayCtx.arc(p.x*dpr(),p.y*dpr(),3*dpr(),0,Math.PI*2);overlayCtx.fill();}overlayCtx.restore();}
  function finishPolygon(){
    const type=polygonTool;if(!type)return;const minimum=type==='area'?3:2;if(polygon.length<minimum)return showWarning(`Add at least ${minimum} points.`);
    const scale=Number(scaleRatio.value);if(!Number.isFinite(scale)||scale<=0)return showWarning('Set a positive drawing scale.');
    const points=[...polygon];polygon=[];polygonTool=null;polygonPage=null;addItem({type,...normalisePoints(points),...style(),scale,units:measureUnits.value});
  }
  function measurement(it){
    const points=absolutePoints(it).map(p=>cssToPdf(p,it.page));const units={m:1000,mm:1,cm:10,ft:304.8,in:25.4};const factor=25.4/72*it.scale/(units[it.units]||1000);
    let value=0;if(it.type==='area'){for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];value+=a.x*b.y-b.x*a.y;}value=Math.abs(value)/2*factor*factor;}else for(let i=1;i<points.length;i++)value+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y)*factor;
    return `${value.toFixed(2)} ${it.units}${it.type==='area'?'²':''}`;
  }
  function measurementLabels(pageIndex){
    const view=pageViewports[pageIndex];if(!view)return [];
    const pageW=view.viewport.width/view.pixelRatio,pageH=view.viewport.height/view.pixelRatio;
    const placed=[],labels=[];
    const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
    for(const it of edits.filter(it=>it.page===pageIndex&&['area','perimeter'].includes(it.type))){
      const r=it.rectCss,text=`${it.type==='area'?'Area':'Perimeter'}: ${measurement(it)}`;
      overlayCtx.save();overlayCtx.font='600 13px sans-serif';const width=overlayCtx.measureText(text).width+20;overlayCtx.restore();
      const w=Math.min(pageW-8,width),h=28;
      const corners=[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}].map(p=>rotatedPoint(p,it));
      const left=Math.min(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y)),right=Math.max(...corners.map(p=>p.x)),bottom=Math.max(...corners.map(p=>p.y));
      // Reserve space for the rotation circle and all eight resize handles,
      // even when unselected, so selecting an item does not move its badge.
      const handles=[{x:r.x+r.w/2-18,y:r.y-38,w:36,h:36},...handlePoints(r).map(p=>({x:p.x-8,y:p.y-8,w:16,h:16}))];
      const candidates=[{x:left,y:top-44-h},{x:left,y:bottom+12},{x:right+12,y:top},{x:left-w-12,y:top},{x:left+12,y:top+12}];
      // Try a few extra rows to keep nearby measurement badges apart.
      for(let i=1;i<=4;i++)candidates.push({x:left,y:bottom+12+i*(h+6)},{x:left,y:top-44-h-i*(h+6)});
      const boxes=candidates.map(p=>({x:clamp(p.x,4,Math.max(4,pageW-w-4)),y:clamp(p.y,4,Math.max(4,pageH-h-4)),w,h}));
      const box=boxes.find(b=>![...handles,...placed].some(o=>overlaps(b,o)))||boxes[0];
      placed.push(box);labels.push({it,text,...box});
    }
    return labels;
  }
  function drawMeasurementLabels(){
    if(!viewport)return;
    overlayCtx.save();overlayCtx.setTransform(1,0,0,1,0,0);overlayCtx.setLineDash([]);overlayCtx.globalAlpha=1;
    for(const label of measurementLabels(currentPageIndex)){
      const {x,y,w,h,it,text}=label,ratio=dpr();
      overlayCtx.fillStyle='#ffffff';overlayCtx.fillRect(x*ratio,y*ratio,w*ratio,h*ratio);
      overlayCtx.strokeStyle=it.stroke||'#2563eb';overlayCtx.lineWidth=ratio;overlayCtx.strokeRect(x*ratio,y*ratio,w*ratio,h*ratio);
      overlayCtx.fillStyle='#0f172a';overlayCtx.font=`600 ${13*ratio}px sans-serif`;overlayCtx.textBaseline='middle';overlayCtx.textAlign='left';
      overlayCtx.fillText(text,(x+10)*ratio,(y+h/2)*ratio,Math.max(1,(w-20)*ratio));
    }
    overlayCtx.restore();
  }
  async function exportMeasurementLabel(it,page){
    const label=measurementLabels(it.page).find(label=>label.it===it);if(!label)return;
    const {x,y,w,h,text}=label;
    const corners=[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}].map(p=>cssToPdf(p,it.page));
    page.drawSvgPath(svgPath(corners,true),{color:PDFLib.rgb(1,1,1),borderColor:hexToRgb(it.stroke||'#2563eb'),borderWidth:.7});
    const font=await pdfDocWriter.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const factor=Math.hypot(corners[1].x-corners[0].x,corners[1].y-corners[0].y)/w;
    const size=Math.min(13*factor,(w-20)*factor/font.widthOfTextAtSize(text,1));
    const position=cssToPdf({x:x+10,y:y+18.5},it.page),angle=Math.atan2(corners[1].y-corners[0].y,corners[1].x-corners[0].x)*180/Math.PI;
    page.drawText(text,{x:position.x,y:position.y,size,font,color:hexToRgb('#0f172a'),rotate:PDFLib.degrees(angle)});
  }
  function cloudPoints(r){const points=[];const sides=[[r.x,r.y,r.x+r.w,r.y],[r.x+r.w,r.y,r.x+r.w,r.y+r.h],[r.x+r.w,r.y+r.h,r.x,r.y+r.h],[r.x,r.y+r.h,r.x,r.y]];
    for(const [x1,y1,x2,y2] of sides){const length=Math.hypot(x2-x1,y2-y1),count=Math.max(1,Math.ceil(length/20)),dx=(x2-x1)/count,dy=(y2-y1)/count,nx=dy/Math.max(length/count,1),ny=-dx/Math.max(length/count,1);for(let i=0;i<count;i++)for(let j=0;j<8;j++){const t=j/8;points.push({x:x1+dx*(i+t)+nx*5*Math.sin(Math.PI*t),y:y1+dy*(i+t)+ny*5*Math.sin(Math.PI*t)});}}
    return points;
  }
  function wrapText(text,width,measure){const lines=[];for(const paragraph of text.split('\n')){let line='';for(const word of paragraph.split(/\s+/)){for(const chunk of word.match(/.{1,30}/g)||['']){const next=line?line+' '+chunk:chunk;if(line&&measure(next)>width){lines.push(line);line=chunk;}else line=next;}}lines.push(line);}return lines;}
  const baseDrawItem=drawItem;
  drawItem=function(it,selected){
    if(!TYPES.has(it.type))return baseDrawItem(it,selected);
    const r=it.rectCss,rd=toDev(r);overlayCtx.save();const cx=rd.x+rd.w/2,cy=rd.y+rd.h/2;overlayCtx.translate(cx,cy);overlayCtx.rotate(rad(it.rot||0));overlayCtx.translate(-cx,-cy);
    overlayCtx.strokeStyle=it.stroke||'#2563eb';overlayCtx.fillStyle=it.stroke||'#2563eb';overlayCtx.lineWidth=(it.width||2)*dpr();overlayCtx.setLineDash(it.dashed?[8*dpr(),6*dpr()]:[]);
    if(it.type==='highlight'){overlayCtx.globalAlpha=it.opacity||.3;overlayCtx.fillRect(rd.x,rd.y,rd.w,rd.h);}
    if(it.type==='ellipse'){overlayCtx.beginPath();overlayCtx.ellipse(cx,cy,Math.max(.5,rd.w/2),Math.max(.5,rd.h/2),0,0,Math.PI*2);overlayCtx.stroke();}
    if(['pen','cloud','area','perimeter'].includes(it.type)){const pts=it.type==='cloud'?cloudPoints(r):absolutePoints(it);overlayCtx.beginPath();pts.forEach((p,i)=>{if(i)overlayCtx.lineTo(p.x*dpr(),p.y*dpr());else overlayCtx.moveTo(p.x*dpr(),p.y*dpr());});if(['cloud','area'].includes(it.type))overlayCtx.closePath();if(it.type==='area'){overlayCtx.save();overlayCtx.globalAlpha=.12;overlayCtx.fill();overlayCtx.restore();}overlayCtx.stroke();}
    if(it.type==='stamp'){overlayCtx.strokeRect(rd.x,rd.y,rd.w,rd.h);overlayCtx.font=`700 ${Math.max(12,Math.min(28,rd.h*.45))}px sans-serif`;overlayCtx.textAlign='center';overlayCtx.textBaseline='middle';overlayCtx.fillText(it.text,cx,cy,Math.max(1,rd.w-12));}
    if(it.type==='callout'){overlayCtx.fillStyle='#ffffff';overlayCtx.fillRect(rd.x,rd.y,rd.w,rd.h);overlayCtx.strokeRect(rd.x,rd.y,rd.w,rd.h);overlayCtx.fillStyle=it.stroke;overlayCtx.font=`600 ${12*dpr()}px sans-serif`;overlayCtx.textBaseline='top';const lines=wrapText(`${it.number}. ${it.text}`,Math.max(20,rd.w-16*dpr()),t=>overlayCtx.measureText(t).width);lines.slice(0,Math.max(1,Math.floor((rd.h-12*dpr())/(16*dpr())))).forEach((line,i)=>overlayCtx.fillText(line,rd.x+8*dpr(),rd.y+(6+i*16)*dpr(),rd.w-16*dpr()));}
    if(it.type==='signature'){const img=getImg(it.imageUrl);if(img&&img.complete)overlayCtx.drawImage(img,rd.x,rd.y,rd.w,rd.h);}
    overlayCtx.restore();if(selected){overlayCtx.save();overlayCtx.strokeStyle='#60a5fa';overlayCtx.lineWidth=dpr();overlayCtx.setLineDash([4*dpr(),3*dpr()]);overlayCtx.strokeRect(rd.x,rd.y,rd.w,rd.h);overlayCtx.restore();drawHandles(rd);drawRotateHandle(rd);}
  };
  // One history entry covers mixed selections across all drawing tools.
  const oldStyleButton=$('updateDrawingSelection');
  const styleButton=oldStyleButton.cloneNode(true);oldStyleButton.replaceWith(styleButton);
  styleButton.addEventListener('click',()=>{
    const list=edits.filter(it=>DRAW_TYPES.has(it.type)&&it.page===currentPageIndex&&selectedIds.includes(it.id));
    if(!list.length){$('drawingStyleStatus').textContent='Select a drawing on this page first.';return;}
    pushHistory();for(const it of list){Object.assign(it,{stroke:$('strokeColor').value,width:style().width,dashed:style().dashed});if(it.type==='box')it.fill=$('boxFillColor').value;}
    drawOverlay();$('drawingStyleStatus').textContent=`${list.length} drawing(s) updated.`;markDirty();
  });

  function openSignature(){
    const dialog=node('dialog');dialog.append(node('h2',{},'Your signature'),node('p',{},'Draw below. Save it to reuse in this browser, then drag on your document to place it.'));
    const canvas=node('canvas',{className:'signature-pad',width:900,height:320});dialog.append(canvas);const c=canvas.getContext('2d');c.strokeStyle='#111827';c.lineWidth=4;c.lineCap='round';let down=false,hasInk=false;
    const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};};
    canvas.addEventListener('pointerdown',e=>{e.preventDefault();down=true;canvas.setPointerCapture(e.pointerId);const p=point(e);c.beginPath();c.moveTo(p.x,p.y);});
    canvas.addEventListener('pointermove',e=>{if(!down)return;const p=point(e);c.lineTo(p.x,p.y);c.stroke();hasInk=true;});canvas.addEventListener('pointerup',()=>down=false);canvas.addEventListener('pointercancel',()=>down=false);
    const actions=node('div',{className:'dialog-actions'});actions.append(button('Clear',()=>{c.clearRect(0,0,900,320);hasInk=false;}),button('Cancel',()=>dialog.close()),button('Save signature',()=>{if(!hasInk)return;try{localStorage.setItem('pdf-studio-signature',canvas.toDataURL('image/png'));dialog.close();showSuccess('Signature saved. Drag on the page to place it.');}catch{showError('Signature could not be saved in this browser.');}},{className:'btn-primary'}));dialog.append(actions);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  }

  /* Export marks as vectors; remove original content on redacted pages. */
  function rotatedPoint(p,it){if(!it.rot)return p;const r=it.rectCss,c={x:r.x+r.w/2,y:r.y+r.h/2},a=rad(it.rot);return {x:c.x+(p.x-c.x)*Math.cos(a)-(p.y-c.y)*Math.sin(a),y:c.y+(p.x-c.x)*Math.sin(a)+(p.y-c.y)*Math.cos(a)};}
  function pdfPoints(points,it){return points.map(p=>cssToPdf(rotatedPoint(p,it),it.page));}
  // pdf-lib's SVG renderer uses y-down coordinates. Negate PDF y explicitly.
  function svgPath(points,closed=false){return points.map((p,i)=>`${i?'L':'M'} ${p.x} ${-p.y}`).join(' ')+(closed?' Z':'');}
  async function exportMarkup(it){
    const page=pdfDocWriter.getPage(it.page),r=it.rectCss,color=hexToRgb(it.stroke||'#2563eb');
    const opts={borderColor:color,borderWidth:it.width||2,dashArray:it.dashed?[8,6]:undefined};
    if(['pen','cloud','area','perimeter'].includes(it.type)){
      const points=pdfPoints(it.type==='cloud'?cloudPoints(r):absolutePoints(it),it);page.drawSvgPath(svgPath(points,['cloud','area'].includes(it.type)),{...opts,...(it.type==='area'?{color,opacity:.12}:{} )});
      if(['area','perimeter'].includes(it.type))await exportMeasurementLabel(it,page);return;
    }
    const corners=pdfPoints([{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}],it);
    if(it.type==='highlight'){page.drawSvgPath(svgPath(corners,true),{color,opacity:it.opacity||.3});return;}
    if(it.type==='ellipse'){const points=[];for(let i=0;i<64;i++){const a=i/64*Math.PI*2;points.push({x:r.x+r.w/2+Math.cos(a)*r.w/2,y:r.y+r.h/2+Math.sin(a)*r.h/2});}page.drawSvgPath(svgPath(pdfPoints(points,it),true),opts);return;}
    if(it.type==='signature'){
      const image=await pdfDocWriter.embedPng(await (await fetch(it.imageUrl)).arrayBuffer());const width=Math.hypot(corners[1].x-corners[0].x,corners[1].y-corners[0].y),height=Math.hypot(corners[3].x-corners[0].x,corners[3].y-corners[0].y);const angle=Math.atan2(corners[1].y-corners[0].y,corners[1].x-corners[0].x)*180/Math.PI;page.drawImage(image,{x:corners[3].x,y:corners[3].y,width,height,rotate:PDFLib.degrees(angle)});return;
    }
    if(it.type==='callout'||it.type==='stamp'){
      page.drawSvgPath(svgPath(corners,true),{...opts,...(it.type==='callout'?{color:PDFLib.rgb(1,1,1)}:{})});
      const font=await pdfDocWriter.embedFont(it.type==='stamp'?PDFLib.StandardFonts.HelveticaBold:PDFLib.StandardFonts.Helvetica);
      const width=Math.hypot(corners[1].x-corners[0].x,corners[1].y-corners[0].y),height=Math.hypot(corners[3].x-corners[0].x,corners[3].y-corners[0].y);
      const ux=(corners[1].x-corners[0].x)/width,uy=(corners[1].y-corners[0].y)/width,dx=(corners[3].x-corners[0].x)/height,dy=(corners[3].y-corners[0].y)/height;
      const size=it.type==='stamp'?Math.max(10,Math.min(24,height*.45)):11,angle=Math.atan2(uy,ux)*180/Math.PI;
      const text=it.type==='callout'?`${it.number}. ${it.text}`:it.text;
      // Standard fonts cannot encode every Unicode character; preserve readable fallback.
      const safe=text.replace(/[^\x20-\x7e\n\u00a0-\u00ff]/g,'?');const lines=wrapText(safe,Math.max(20,width-12),t=>font.widthOfTextAtSize(t,size));
      for(let i=0;i<Math.min(lines.length,Math.max(1,Math.floor((height-8)/(size+3))));i++){
        const x=it.type==='stamp'?(width-font.widthOfTextAtSize(lines[i],size))/2:6,y=it.type==='stamp'?height/2+size/3:6+size+i*(size+3);
        page.drawText(lines[i],{x:corners[0].x+ux*x+dx*y,y:corners[0].y+uy*x+dy*y,size,font,color,rotate:PDFLib.degrees(angle)});
      }
    }
  }
  async function secureRedactions(redactions){
    if(!redactions.length)return;
    const source=pdfDocWriter,clean=await PDFLib.PDFDocument.create();
    const bytes=await source.save();const renderer=await pdfjsLib.getDocument({data:bytes.slice()}).promise;
    try{
      for(let i=0;i<source.getPageCount();i++){
        const masks=redactions.filter(it=>it.page===i),original=source.getPage(i);
        if(!masks.length){const [copy]=await clean.copyPages(source,[i]);clean.addPage(copy);continue;}
        showLoading(`Securely redacting page ${i+1}…`);
        const p=await renderer.getPage(i+1),base=p.getViewport({scale:1,rotation:0});
        const scale=Math.min(2.1,Math.sqrt(16000000/(base.width*base.height)));const vp=p.getViewport({scale,rotation:0});
        const canvas=node('canvas',{width:Math.ceil(vp.width),height:Math.ceil(vp.height)}),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
        await p.render({canvasContext:ctx,viewport:vp}).promise;
        for(const it of masks){const r=it.rectCss;const points=(it.pdfCorners||pdfPoints([{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}],it)).map(q=>vp.convertToViewportPoint(q.x,q.y));ctx.fillStyle=it.color||'#000';ctx.strokeStyle=it.color||'#000';ctx.lineWidth=3;ctx.beginPath();points.forEach((q,j)=>{if(j)ctx.lineTo(...q);else ctx.moveTo(...q);});ctx.closePath();ctx.fill();ctx.stroke();}
        const png=await clean.embedPng(canvas.toDataURL('image/png'));const size=original.getSize();const out=clean.addPage([size.width,size.height]);out.drawImage(png,{x:base.viewBox[0],y:base.viewBox[1],width:base.width,height:base.height});const crop=original.getCropBox();out.setCropBox(crop.x,crop.y,crop.width,crop.height);out.setRotation(original.getRotation());canvas.width=canvas.height=1;
      }
      pdfDocWriter=clean;
    }finally{await renderer.destroy();}
  }
  const apply=applyEditsToPdf;
  applyEditsToPdf=async function(options={}){
    if(!pdfDocWriter||busy)return;busy=true;clearTimeout(saveTimer);
    // Save the pre-apply draft, so editable annotations can be recovered.
    busy=false;await saveDraft();busy=true;
    const backup=await pdfDocWriter.save(),staged=deepClone(edits),rotations=[...pageRotDelta],views={...pageViewports};
    try{
      showLoading('Applying annotations…');
      const redactions=edits.filter(it=>it.type==='redact').map(it=>{const r=it.rectCss;return {...it,pdfCorners:pdfPoints([{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}],it)};});
      for(const it of edits.filter(it=>TYPES.has(it.type)))await exportMarkup(it);
      edits=edits.filter(it=>!TYPES.has(it.type));
      await apply(options);
      // Flatten only after every staged annotation is applied, so a redaction
      // also removes staged text or images underneath it.
      if(redactions.length){await secureRedactions(redactions);await loadBoth(await pdfDocWriter.save());}
      undoStack=[];redoStack=[];dirty=false;lastState=stateSignature();draftStatus.textContent='Applied — editable draft available';await refreshThumbnails();
    }catch(e){pdfDocWriter=await PDFLib.PDFDocument.load(backup);edits=staged;pageRotDelta=rotations;pageViewports=views;drawOverlay();showFailure(e);throw e;}
    finally{busy=false;hideLoading();}
  };
  const download=el.download.onclick;
  el.download.onclick=async()=>{if(!pdfDocWriter||busy)return showWarning('Open a PDF first.');try{await download();draftStatus.textContent='PDF downloaded — editable draft available';}catch(e){showFailure(e);}};
  el.apply.onclick=async()=>{try{await applyEditsToPdf();}catch{}};
  const serverSave=el.save.onclick;el.save.onclick=async()=>{try{if(!pdfDocWriter)return showWarning('Open a PDF first.');await serverSave();}catch(e){showFailure(e);}};
  function showFailure(e){console.error(e);showError(e.message||'The operation could not be completed.');}
  PdfSession.connect({
    hasDocument:()=>!!pdfDocWriter||fileInput.files.length>0,
    load:record=>handlePdfFile(PdfSession.file(record),{sessionRestore:true}),
    discard:()=>{dirty=false;clearTimeout(saveTimer);},
    read:async()=>{
      await openingDocument;
      if(busy||saving)throw new Error('Wait for the current PDF operation to finish before switching tools.');
      if(!pdfDocWriter)return null;
      if(edits.length||pageRotDelta.some(Boolean))await applyEditsToPdf({confirm:false});
      const bytes=await pdfDocWriter.save();dirty=false;lastState=stateSignature();return {bytes,name:fileName};
    }
  });
  // Keep view-only controls from marking drafts dirty; actual state changes are sampled.
  setInterval(()=>{if(!pdfDocWriter||busy||saving)return;const state=stateSignature();if(state!==lastState){lastState=state;markDirty();}},1500);
})();
