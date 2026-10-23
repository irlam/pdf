const {chromium}=require('playwright');const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');const root=path.resolve(__dirname,'..');let server,browser;
(async()=>{
 server=http.createServer((req,res)=>{try{const f=path.join(root,req.url.split('?')[0]);res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(f));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({...(process.env.PDF_STUDIO_BROWSER_EXECUTABLE?{executablePath:process.env.PDF_STUDIO_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.route('https://unpkg.com/**',r=>r.abort());await p.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 const bytes=await p.evaluate(async()=>{const doc=await PDFLib.PDFDocument.create();doc.addPage([600,800]);return Array.from(await doc.save());});await p.locator('#file').setInputFiles({name:'line-style.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)});await p.waitForFunction(()=>viewport&&!document.querySelector('#loadingIndicator').classList.contains('visible'));
 const calls=await p.evaluate(()=>{
  const results=[],stroke=overlayCtx.stroke.bind(overlayCtx),rect=overlayCtx.strokeRect.bind(overlayCtx);let recorded=[];overlayCtx.stroke=(...a)=>{recorded.push(overlayCtx.getLineDash());stroke(...a);};overlayCtx.strokeRect=(...a)=>{recorded.push(overlayCtx.getLineDash());rect(...a);};
  for(const type of ['line','arrow','dimension','box'])for(const dashed of [false,true]){
   const item={id:1,type,page:0,rectCss:{x:80,y:120,w:200,h:80},a:{x:0,y:0},b:{x:200,y:80},width:2,stroke:'#000000',fill:'#ffffff',dashed};
   overlayCtx.setLineDash([3,2]);recorded=[];drawItem(item,true);results.push({type,dashed,strokes:recorded.slice(),after:overlayCtx.getLineDash()});
  }
  overlayCtx.stroke=stroke;overlayCtx.strokeRect=rect;
  edits=[{id:nextId++,type:'line',page:0,rectCss:{x:80,y:120,w:240,h:0},a:{x:0,y:0},b:{x:240,y:0},width:3,stroke:'#000000',dashed:true}];selectedIds=[edits[0].id];drawOverlay();return results;
 });
 for(const result of calls){assert.deepEqual(result.strokes[0],result.dashed?[8,6]:[],result.type+' shaft style');assert.deepEqual(result.after,[3,2],result.type+' selection must not leak canvas state');if(['arrow','dimension'].includes(result.type))assert.deepEqual(result.strokes[1],[],'heads/ticks stay solid');}
 await p.getByRole('button',{name:'Properties',exact:true}).click();await p.selectOption('#tool','select');await p.locator('#strokeDashed').uncheck();await p.locator('#updateDrawingSelection').click();assert.equal(await p.evaluate(()=>edits[0].dashed),false);assert.deepEqual(await p.evaluate(()=>overlayCtx.getLineDash()),[],'redraw leaves a solid default');
 await p.click('#undo');assert.equal(await p.evaluate(()=>edits[0].dashed),true);await p.click('#redo');assert.equal(await p.evaluate(()=>edits[0].dashed),false);
 // Verify actual checkbox state is captured for newly drawn solid and dashed lines.
 await p.selectOption('#tool','line');for(const dashed of [false,true]){await p.locator('#strokeDashed').setChecked(dashed);const c=await p.locator('#pdfCanvas').boundingBox();await p.mouse.move(c.x+70,c.y+230+(dashed?80:0));await p.mouse.down();await p.mouse.move(c.x+270,c.y+230+(dashed?80:0),{steps:5});await p.mouse.up();assert.equal(await p.evaluate(()=>edits.at(-1).dashed),dashed);}
 const download=p.waitForEvent('download');await p.click('#download');await download;await p.waitForFunction(()=>!document.querySelector('#loadingIndicator').classList.contains('visible'));assert.deepEqual(errors,[]);
 console.log('PASS: solid/dashed line, arrow, dimension and box rendering under inherited dash state; selection isolation; solid heads/ticks; checkbox → new/existing drawing; undo/redo and PDF export.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.close();});
