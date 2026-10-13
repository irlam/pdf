const {chromium}=require('playwright');
const fs=require('fs'),http=require('http'),assert=require('assert/strict');
const path=require('path'),os=require('os');
const root=path.resolve(__dirname,'..');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-studio-test-'));
let server,browser;
(async()=>{
 server=http.createServer((req,res)=>{try{const path=root+decodeURIComponent(req.url.split('?')[0]);res.setHeader('Content-Type',path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(path));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({...(process.env.PDF_STUDIO_BROWSER_EXECUTABLE?{executablePath:process.env.PDF_STUDIO_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});const ctx=await browser.newContext({viewport:{width:1500,height:1000}}),p=await ctx.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.route('https://unpkg.com/**',r=>r.abort());
 await p.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 const bytes=await p.evaluate(async()=>{const d=await PDFLib.PDFDocument.create();const font=await d.embedFont(PDFLib.StandardFonts.Helvetica);const a=d.addPage([600,700]);a.drawText('SECRET_ACCOUNT_123',{x:90,y:590,size:18,font});const b=d.addPage([420,600]);b.drawText('PRESERVE_PAGE_TWO',{x:40,y:550,size:18,font});return Array.from(await d.save());});
 await p.locator('#file').setInputFiles({name:'review.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)});
 await p.waitForFunction(()=>pageCount===2&&document.querySelectorAll('.thumbnail').length===2&&!document.querySelector('#loadingIndicator').classList.contains('visible'));
 const draw=async(tool,color,a,b)=>{await p.selectOption('#tool',tool);if(color)await p.locator('#strokeColor').fill(color);const r=await p.locator('#pdfCanvas').boundingBox();await p.mouse.move(r.x+a[0],r.y+a[1]);await p.mouse.down();await p.mouse.move(r.x+b[0],r.y+b[1],{steps:8});await p.mouse.up();};
 await draw('line','#ff0000',[100,170],[250,210]);await draw('arrow','#00aa00',[100,250],[250,290]);
 assert.deepEqual(await p.evaluate(()=>edits.map(x=>x.type)),['line','arrow']);
 const before=await p.evaluate(()=>{const i=edits[0];return cssToPdf({x:i.rectCss.x+i.a.x,y:i.rectCss.y+i.a.y},i.page);});
 await p.click('#zoomIn');await p.waitForFunction(()=>Math.round(zoom*100)===112);await p.waitForTimeout(250);
 const after=await p.evaluate(()=>{const i=edits[0];return cssToPdf({x:i.rectCss.x+i.a.x,y:i.rectCss.y+i.a.y},i.page);});assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<.001);
 await p.click('#undo');const undoPoint=await p.evaluate(()=>{const i=edits[0];return cssToPdf({x:i.rectCss.x+i.a.x,y:i.rectCss.y+i.a.y},i.page);});assert.ok(Math.hypot(before.x-undoPoint.x,before.y-undoPoint.y)<.001);await p.click('#redo');
 await p.click('#zoomReset');await p.waitForTimeout(250);
 await draw('highlight','#ffff00',[310,170],[420,200]);await draw('pen','#3366ff',[100,330],[230,360]);await draw('ellipse','#cc00cc',[310,240],[420,300]);await draw('cloud','#ff6600',[100,420],[240,480]);
 await p.selectOption('#tool','callout');await p.locator('#commentText').fill('Check the opening dimensions before installation.');const r=await p.locator('#pdfCanvas').boundingBox();await p.mouse.click(r.x+280,r.y+360);
 await p.selectOption('#tool','stamp');await p.selectOption('#stampPreset','APPROVED');await draw('stamp','#008800',[280,480],[420,520]);
 await p.selectOption('#tool','area');await p.locator('#measurementScale').fill('100');await p.selectOption('#measurementUnits','m');
 for(const [x,y] of [[100,550],[230,550],[230,650],[100,650]])await p.mouse.click(r.x+x,r.y+y);
 await p.getByRole('button',{name:'Finish measurement',exact:true}).click();
 await p.selectOption('#tool','signature');await p.getByRole('button',{name:'Create / replace signature'}).click();const sig=await p.locator('.signature-pad').boundingBox();await p.mouse.move(sig.x+40,sig.y+70);await p.mouse.down();await p.mouse.move(sig.x+200,sig.y+100,{steps:10});await p.mouse.up();await p.getByRole('button',{name:'Save signature',exact:true}).click();await draw('signature',null,[280,580],[440,630]);
 assert.deepEqual(await p.evaluate(()=>edits.map(x=>x.type)),['line','arrow','highlight','pen','ellipse','cloud','callout','stamp','area','signature']);
 // Mixed style changes must undo in one step.
 await p.selectOption('#tool','select');await p.evaluate(()=>{selectedIds=[edits[0].id,edits[4].id];drawOverlay();});await p.locator('#strokeColor').fill('#0000ff');await p.click('#updateDrawingSelection');await p.click('#undo');
 assert.deepEqual(await p.evaluate(()=>[edits[0].stroke,edits[4].stroke]),['#ff0000','#cc00cc']);
 // A malformed upload must preserve the current document and annotations.
 const beforeBad=await p.evaluate(()=>edits.length);await p.locator('#file').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a pdf')});await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>edits.length),beforeBad);assert.equal(await p.locator('.document-name').textContent(),'review.pdf');
 // Navigate to a differently sized page and add a mark.
 await p.locator('.thumbnail[data-page="1"]').click();await p.waitForFunction(()=>currentPageIndex===1);await draw('line','#990000',[70,100],[170,130]);
 // Duplicate preserves page contents and editable marks; deletion and moves remap stages.
 await p.click('#pageDuplicate');await p.waitForFunction(()=>pageCount===3&&!document.querySelector('#loadingIndicator').classList.contains('visible'));
 assert.equal(await p.evaluate(()=>edits.filter(x=>x.page===2).length),1);
 await p.click('#pageDelete');await p.waitForFunction(()=>pageCount===2&&!document.querySelector('#loadingIndicator').classList.contains('visible'));
 assert.equal(await p.evaluate(()=>edits.some(x=>x.page>1)),false);
 await p.click('#pageUp');await p.waitForFunction(()=>currentPageIndex===0&&!document.querySelector('#loadingIndicator').classList.contains('visible'));assert.equal(await p.evaluate(()=>edits.filter(x=>x.page===0).length),1);await p.click('#pageDown');await p.waitForFunction(()=>currentPageIndex===1&&!document.querySelector('#loadingIndicator').classList.contains('visible'));await p.click('#pageInsertBefore');await p.waitForFunction(()=>pageCount===3&&!document.querySelector('#loadingIndicator').classList.contains('visible'));await p.click('#pageDelete');await p.waitForFunction(()=>pageCount===2&&!document.querySelector('#loadingIndicator').classList.contains('visible'));await p.locator('.thumbnail[data-page="0"]').click();await p.waitForTimeout(200);
 await p.getByRole('button',{name:'Save draft',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.draft-status').textContent.startsWith('Draft saved'));
 const stageCount=await p.evaluate(()=>edits.length);await p.reload();await p.waitForFunction(()=>!document.querySelector('.document-actions button').hidden);await p.getByRole('button',{name:'Restore draft',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.draft-status').textContent.includes('Draft restored'));
 assert.equal(await p.evaluate(()=>edits.length),stageCount);assert.equal(await p.evaluate(()=>edits.find(x=>x.type==='signature').imageUrl.startsWith('data:')),true);
 // Mask the secret using canonical PDF coordinates, so resizing does not affect coverage.
 await p.evaluate(()=>{const v=pageViewports[0];const a=v.viewport.convertToViewportPoint(80,620),b=v.viewport.convertToViewportPoint(320,570);edits.push({id:nextId++,type:'text',page:0,rectCss:normalizeCssRect({x:a[0]/v.pixelRatio+5,y:a[1]/v.pixelRatio+5},{x:b[0]/v.pixelRatio-5,y:b[1]/v.pixelRatio-5}),text:'STAGED_SECRET_456',fontFamily:'Helvetica',fontSize:12,color:'#000000',cover:'#ffffff',rot:0});edits.push({id:nextId++,type:'redact',page:0,rectCss:normalizeCssRect({x:a[0]/v.pixelRatio,y:a[1]/v.pixelRatio},{x:b[0]/v.pixelRatio,y:b[1]/v.pixelRatio}),rot:0,color:'#000000'});drawOverlay();});
 await p.screenshot({path:path.join(output,'desktop.png'),animations:'disabled'});
 const downloadPromise=p.waitForEvent('download');await p.click('#download');const download=await downloadPromise;await download.saveAs(path.join(output,'export.pdf'));await p.waitForFunction(()=>!document.querySelector('#loadingIndicator').classList.contains('visible'));
 const exportedText=await p.evaluate(async()=>{const pages=[];for(let i=1;i<=pdfDocRender.numPages;i++)pages.push((await (await pdfDocRender.getPage(i)).getTextContent()).items.map(x=>x.str).join(' '));return pages;});assert.equal(exportedText[0],'');assert.match(exportedText[1],/PRESERVE_PAGE_TWO/);
 await p.waitForTimeout(2600);await p.getByRole('button',{name:'Restore draft',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.draft-status').textContent.includes('Draft restored'));
 assert.equal(await p.evaluate(()=>edits.length),stageCount+2,'pre-apply editable draft must survive export');
 // Phone and tablet panels must remain on screen and tools available.
 await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'Properties',exact:true}).click();await p.selectOption('#tool','arrow');assert.equal(await p.locator('#strokeColor').isVisible(),true);await p.screenshot({path:path.join(output,'mobile.png'),animations:'disabled'});
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal page overflow');
 // A separate crop-box/rotation fixture verifies redaction in non-default viewports.
 await p.setViewportSize({width:1500,height:1000});
 const rotated=await p.evaluate(async()=>{const d=await PDFLib.PDFDocument.create();const p=d.addPage([600,700]);p.setCropBox(20,30,560,650);p.setRotation(PDFLib.degrees(90));p.drawText('ROTATED_SECRET',{x:100,y:550,size:18});return Array.from(await d.save());});
 await p.locator('#file').setInputFiles({name:'rotated.pdf',mimeType:'application/pdf',buffer:Buffer.from(rotated)});
 await p.waitForFunction(()=>pageCount===1&&!document.querySelector('#loadingIndicator').classList.contains('visible'));
 await p.evaluate(()=>{const v=pageViewports[0],points=[[80,580],[320,580],[320,520],[80,520]].map(p=>v.viewport.convertToViewportPoint(...p));const xs=points.map(p=>p[0]/v.pixelRatio),ys=points.map(p=>p[1]/v.pixelRatio);edits.push({id:nextId++,type:'redact',page:0,rectCss:{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)},color:'#000',rot:0});drawOverlay();});
 const rotatedDownload=p.waitForEvent('download');await p.click('#download');await (await rotatedDownload).saveAs(path.join(output,'rotated-redaction.pdf'));
 assert.deepEqual(await p.evaluate(async()=>{const p=pdfDocWriter.getPage(0),t=await (await pdfDocRender.getPage(1)).getTextContent();return {rotation:p.getRotation().angle,crop:p.getCropBox(),text:t.items.map(x=>x.str).join(' ')};}),{rotation:90,crop:{x:20,y:30,width:560,height:650},text:''});
 await p.locator('summary').filter({hasText:'Apply / server versions'}).click();await p.getByRole('button',{name:'Clear draft',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.draft-status').textContent==='Browser draft cleared');assert.equal(await p.getByRole('button',{name:'Restore draft',exact:true}).isVisible(),false);
 assert.deepEqual(errors,[]);console.log('PASS: markup, signatures, comments, undo across zoom, invalid uploads, page insert/duplicate/delete/reorder, draft recovery/clearing, secure redaction of source and staged text, rotated crop-box redaction, PDF export, mobile controls and no page errors.');
 console.log('Rendered screenshots and exported PDF:',output);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.close();});
