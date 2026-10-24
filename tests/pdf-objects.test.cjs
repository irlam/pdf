const assert=require('assert/strict'),P=require('../assets/lib/pdf-lib.min.js'),O=require('../app/pdf-objects.js');
const name=P.PDFName.of;
function content(doc,page,source){page.node.set(name('Contents'),doc.context.register(doc.context.flateStream(source)));}
function textAndImages(doc,page){return O.analyse(doc,page).objects.filter(o=>o.type==='path').length;}
(async()=>{
 const d=await P.PDFDocument.create(),p=d.addPage([500,500]);
 content(d,p,'% f B and S in comments must survive\nq 1 0 0 rg 10 20 80 60 re f Q\n0 0 0 RG 1 w 5 5 m 100 100 l S\nBT /F1 12 Tf (keep \\( f S \\) text) Tj ET\n');
 const m=O.analyse(d,0);assert.equal(m.objects.length,2);assert.equal(m.objects.filter(o=>O.eligible(o)).length,1);O.apply(d,[{page:0,targets:[m.objects[0].key]}]);assert.equal(textAndImages(d,0),1);let source=P.decodePDFRawStream(d.context.lookup(p.node.Contents())).decode();assert.match(Buffer.from(source).toString('latin1'),/keep/);assert.match(Buffer.from(source).toString('latin1'),/5 5 m 100 100 l S/);
 assert.throws(()=>O.apply(d,[{page:0,targets:[m.objects[0].key]}]),/source changed/);
 const lex=O.operators('/N#20ame << /A [(f) <ff00> true] >> BDC (literal \\( S \\)) Tj EMC');assert.deepEqual(lex.map(o=>o.text),['BDC','Tj','EMC']);assert.equal(lex[0].args.length,2);
 const mult=await P.PDFDocument.create(),mp=mult.addPage([400,400]);
 mp.node.set(name('Contents'),mult.context.obj([mult.context.register(mult.context.stream('q 2 0 0 2 20 30 cm 1 0 0 RG 5 5 m\n')),mult.context.register(mult.context.stream('15 15 l S Q'))]));const multi=O.analyse(mult,0);assert.deepEqual(multi.objects[0].rect,{x:30,y:40,w:20,h:20});O.apply(mult,[{page:0,targets:[multi.objects[0].key]}]);assert.equal(O.analyse(mult,0).objects.length,0);
 const clipped=await P.PDFDocument.create(),cp=clipped.addPage([200,200]);content(clipped,cp,'q 0 0 10 10 re W n 1 0 0 rg 0 0 100 100 re f Q 0 0 20 20 re S');const cl=O.analyse(clipped,0);assert.equal(cl.objects[0].clips.length,1);O.apply(clipped,[{page:0,targets:[cl.objects[0].key]}]);const cc=Buffer.from(P.decodePDFRawStream(clipped.context.lookup(cp.node.Contents())).decode()).toString('latin1');assert.match(cc,/W n/);assert.match(cc,/20 20 re S/);
 // A shared nested form drawn twice on page 1 and once on page 2. Removing one invocation must leave the others byte-identical.
 const f=await P.PDFDocument.create(),a=f.addPage([500,500]),b=f.addPage([500,500]);
 const leaf=f.context.register(f.context.flateStream('1 0 0 rg 0 0 20 20 re f',{Type:'XObject',Subtype:'Form',BBox:[0,0,20,20],Matrix:[1,0,0,1,5,7]}));
 const innerResources=f.context.obj({XObject:{'Child Shape':leaf}});const form=f.context.register(f.context.flateStream('/Child#20Shape Do',{Type:'XObject',Subtype:'Form',BBox:[0,0,100,100],Resources:innerResources}));
 for(const page of [a,b])page.node.set(name('Resources'),f.context.obj({XObject:{Shared:form}}));
 content(f,a,'q 1 0 0 1 10 10 cm /Shared Do Q q 1 0 0 1 100 100 cm /Shared Do Q');content(f,b,'/Shared Do');
 const before=O.analyse(f,0),page2=O.analyse(f,1);assert.equal(before.objects.length,2);assert.equal(before.objects[0].rect.x,15);assert.equal(page2.objects.length,1);
 const originalLeaf=Buffer.from(P.decodePDFRawStream(f.context.lookup(leaf)).decode()).toString('latin1');
 O.apply(f,[{page:0,targets:[before.objects[0].key]}]);assert.equal(O.analyse(f,0).objects.length,1);assert.equal(O.analyse(f,0).objects[0].rect.x,105);assert.equal(O.analyse(f,1).objects.length,1);assert.equal(Buffer.from(P.decodePDFRawStream(f.context.lookup(leaf)).decode()).toString('latin1'),originalLeaf);
 const round=await P.PDFDocument.load(await f.save());assert.equal(O.analyse(round,0).objects.length,1);assert.equal(O.analyse(round,1).objects.length,1);
 const ann=await P.PDFDocument.create(),ap=ann.addPage([100,100]);const annotation=ann.context.register(ann.context.obj({Type:'Annot',Subtype:'Circle',Rect:[10,10,40,40],C:[1,0,0]})),link=ann.context.register(ann.context.obj({Type:'Annot',Subtype:'Link',Rect:[40,40,50,50]})),widget=ann.context.register(ann.context.obj({Type:'Annot',Subtype:'Widget',Rect:[50,50,60,60]}));
 ap.node.set(name('Annots'),ann.context.obj([annotation,link,widget]));const am=O.analyse(ann,0);assert.equal(am.objects.length,1);O.apply(ann,[{page:0,targets:[am.objects[0].key]}]);assert.equal(ap.node.Annots().size(),2,'links and form fields protected');
 // Annotation fingerprints survive copied-page object renumbering, including appearance/page references.
 const ac=await P.PDFDocument.create(),acp=ac.addPage([100,100]);const appearance=ac.context.register(ac.context.flateStream('1 0 0 RG 10 10 20 20 re S',{Type:'XObject',Subtype:'Form',BBox:[0,0,100,100]}));
 acp.node.set(name('Annots'),ac.context.obj([ac.context.register(ac.context.obj({Type:'Annot',Subtype:'Square',Rect:[10,10,30,30],P:acp.ref,AP:{N:appearance}}))]));const ak=O.analyse(ac,0).objects[0].key;
 const target=await P.PDFDocument.create();target.addPage([10,10]);const [copiedAnnotationPage]=await target.copyPages(ac,[0]);target.addPage(copiedAnnotationPage);assert.equal(O.analyse(target,1).objects[0].key,ak);O.apply(target,[{page:1,targets:[ak]}]);assert.equal(O.analyse(target,1).objects.length,0);
 const inline=await P.PDFDocument.create(),ip=inline.addPage([100,100]);content(inline,ip,'1 0 0 rg 10 10 10 10 re f BI /W 1 /H 1 ID xx EI');const im=O.analyse(inline,0);assert.equal(im.objects.length,0);assert.match(im.warnings.join(' '),/Inline images/);
 const scanned=await P.PDFDocument.create(),sp=scanned.addPage([20,20]);content(scanned,sp,'q 20 0 0 20 0 0 cm /Image Do Q');assert.equal(O.analyse(scanned,0).objects.length,0);
 const layered=await P.PDFDocument.create(),lp=layered.addPage([100,100]);content(layered,lp,'/OC /Hidden BDC 1 0 0 rg 0 0 20 20 re f EMC 0 1 0 rg 30 30 20 20 re f');const lm=O.analyse(layered,0);assert.equal(lm.objects.length,1);assert.match(lm.warnings.join(' '),/Layered content/);
 const copied=await P.PDFDocument.create();const [copyPage]=await copied.copyPages(mult,[0]);copied.addPage(copyPage);assert.equal(O.analyse(copied,0).objects.length,0);
 console.log('PASS: PDF content lexer, exact paint removal, preserved text/clips/other paths, split streams and transforms, stale targets rejected, per-invocation copies of nested/shared escaped-name Forms, annotations with links/widgets protected, save/reopen, unsupported inline-image stream and scanned-page handling.');
})().catch(e=>{console.error(e);process.exitCode=1;});
