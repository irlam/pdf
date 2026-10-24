/* Lossless removal of path painting operations. Text, images and clipping remain intact.
 * Each Form invocation is edited through its own copy, never a shared resource.
 */
(function(root){
  'use strict';
  const P=root.PDFLib||(typeof require==='function'?require('../assets/lib/pdf-lib.min.js'):null);
  const name=s=>P.PDFName.of(s),operandName=s=>name(String(s).slice(1).replace(/#([0-9a-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)))),identity=[1,0,0,1,0,0],white=c=>c&&Math.min(...c)>.98;
  const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  const point=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
  const bounds=points=>({x:Math.min(...points.map(p=>p[0])),y:Math.min(...points.map(p=>p[1])),w:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),h:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))});
  const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(36);};
  const bytes=s=>Uint8Array.from(s,c=>c.charCodeAt(0));
  const binary=data=>{let s='';for(let i=0;i<data.length;i+=16384)s+=String.fromCharCode(...data.subarray(i,i+16384));return s;};
  function contents(context,value){
    const object=context.lookup(value);if(!object)return '';
    if(object instanceof P.PDFArray)return object.asArray().map(ref=>contents(context,ref)).join('');
    const data=object instanceof P.PDFRawStream?P.decodePDFRawStream(object).decode():object.getUnencodedContents?.();
    if(!data)throw Error('Unsupported PDF content stream.');if(data.length>24*1024*1024)throw Error('This content stream is too large to inspect safely.');return binary(data);
  }
  // Preserve byte offsets. Strings, names, arrays and dictionaries are indivisible operands.
  function operators(source){
    let i=0,count=0;const result=[],length=source.length,space=c=>c===0||c===9||c===10||c===12||c===13||c===32;
    const delimiter=c=>space(c)||'()<>[]{}/%'.includes(String.fromCharCode(c));
    function skip(){while(i<length){if(space(source.charCodeAt(i)))i++;else if(source[i]==='%'){while(i<length&&!/[\r\n]/.test(source[i]))i++;}else break;}}
    function token(depth=0){
      if(depth>64)throw Error('PDF operand nesting is too deep.');skip();const start=i,c=source[i++];
      if(c==='('){let level=1;while(i<length&&level){const q=source[i++];if(q==='\\'){if(source[i]==='\r'&&source[i+1]==='\n')i+=2;else i++;}else if(q==='(')level++;else if(q===')')level--;}if(level)throw Error('Unterminated PDF string.');}
      else if(c==='['||(c==='<'&&source[i]==='<')){const close=c==='['?']':'>>';if(c==='<')i++;while(true){skip();if(i>=length)throw Error('Unterminated PDF operand.');if(source.slice(i,i+close.length)===close){i+=close.length;break;}token(depth+1);}}
      else if(c==='<'){while(i<length&&source[i]!=='>')i++;if(i===length)throw Error('Unterminated PDF hex string.');i++;}
      else if(c==='/'){while(i<length&&!delimiter(source.charCodeAt(i)))i++;}
      else{while(i<length&&!delimiter(source.charCodeAt(i)))i++;if(')]>{}'.includes(c))throw Error('Invalid PDF content token.');}
      const text=source.slice(start,i);return {start,end:i,text,value:/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)?Number(text):text};
    }
    let operands=[];
    while(i<length){skip();if(i===length)break;if(++count>1500000)throw Error('Too many PDF content tokens.');const t=token();
      if(typeof t.value==='number'||/^[/(\[<]/.test(t.text)||['true','false','null'].includes(t.text))operands.push(t);
      else{if(t.text==='BI')throw Error('Inline images: vector selection is unavailable in this content stream.');result.push({...t,args:operands});operands=[];}
    }
    if(operands.length)throw Error('Incomplete PDF content stream.');return result;
  }
  const grey=g=>[g,g,g],rgb=(c,m,y,k)=>[1-Math.min(1,c+k),1-Math.min(1,m+k),1-Math.min(1,y+k)];
  const coloured=c=>c&&Math.max(...c)-Math.min(...c)>.035;
  const normalState=()=>({matrix:identity.slice(),stroke:[0,0,0],fill:[0,0,0],width:1,strokeSpace:'DeviceGray',fillSpace:'DeviceGray',clips:[],strokeAlpha:1,fillAlpha:1});
  const copy=s=>({...s,matrix:s.matrix.slice(),clips:s.clips.slice()});
  const lookup=(ctx,dict,key)=>dict instanceof P.PDFDict?ctx.lookup(dict.get(name(key))):null;
  function analyse(doc,pageIndex){
    const context=doc.context,page=doc.getPage(pageIndex),warnings=[],objects=[];let total=0;
    const resources=page.node.Resources(),nodes=[];
    function inspect(source,res,id,inherited,depth=0){
      if(depth>12){warnings.push('A deeply nested drawing was skipped.');return null;}
      const node={source,resources:res,id,children:[],objects:[],digest:hash(source)};nodes.push(node);
      let ops;try{ops=operators(source);}catch(e){warnings.push(e.message);return node;}
      let state=copy(inherited),stack=[],commands=[],points=[],current=null,start=null,clipRule=null,textDepth=0,marked=[],protectedDepth=0;
      const add=(op,...coords)=>{commands.push([op,...coords]);for(let i=0;i<coords.length;i+=2)points.push([coords[i],coords[i+1]]);};
      const transform=(x,y)=>point(state.matrix,x,y);
      for(const op of ops){
        if(++total>1000000)throw Error('The page is too complex to inspect safely.');
        const v=op.args.map(a=>a.value),nums=n=>v.length===n&&v.every(Number.isFinite),o=op.text;
        if(o==='BMC'||o==='BDC'){const protectedLayer=o==='BDC'&&v[0]==='/OC';marked.push(protectedLayer);if(protectedLayer){protectedDepth++;warnings.push('Layered content is protected; only separate unlayered shapes can be selected.');}continue;}
        if(o==='EMC'){if(marked.pop())protectedDepth--;continue;}
        if(o==='q'){stack.push(copy(state));continue;}if(o==='Q'){if(!stack.length)throw Error('Unbalanced PDF graphics state.');state=stack.pop();continue;}
        if(o==='cm'&&nums(6)){state.matrix=multiply(state.matrix,v);continue;}
        if(o==='w'&&nums(1)){state.width=v[0];continue;}
        if(o==='BT'){textDepth++;continue;}if(o==='ET'){textDepth--;continue;}
        if(o==='RG'&&nums(3)){state.stroke=v;state.strokeSpace='DeviceRGB';continue;}if(o==='rg'&&nums(3)){state.fill=v;state.fillSpace='DeviceRGB';continue;}
        if(o==='G'&&nums(1)){state.stroke=grey(v[0]);state.strokeSpace='DeviceGray';continue;}if(o==='g'&&nums(1)){state.fill=grey(v[0]);state.fillSpace='DeviceGray';continue;}
        if(o==='K'&&nums(4)){state.stroke=rgb(...v);state.strokeSpace='DeviceCMYK';continue;}if(o==='k'&&nums(4)){state.fill=rgb(...v);state.fillSpace='DeviceCMYK';continue;}
        if(['CS','cs'].includes(o)){const side=o==='CS'?'stroke':'fill';state[side+'Space']=String(v[0]).slice(1);state[side]=null;continue;}
        if(['SC','SCN','sc','scn'].includes(o)){const side=o===o.toUpperCase()?'stroke':'fill',space=state[side+'Space'];state[side]=space==='DeviceRGB'&&nums(3)?v:space==='DeviceGray'&&nums(1)?grey(v[0]):space==='DeviceCMYK'&&nums(4)?rgb(...v):null;continue;}
        if(o==='gs'){
          const gs=lookup(context,lookup(context,res,'ExtGState'),operandName(v[0]).decodeText());
          for(const [key,prop] of [['CA','strokeAlpha'],['ca','fillAlpha'],['LW','width']]){const value=lookup(context,gs,key);if(value instanceof P.PDFNumber)state[prop]=value.asNumber();}continue;
        }
        if(o==='Do'){
          if(protectedDepth)continue;
          const resourceName=operandName(v[0]),xo=lookup(context,lookup(context,res,'XObject'),resourceName.decodeText());
          if(xo instanceof P.PDFRawStream||xo instanceof P.PDFContentStream){
            if(String(xo.dict.get(name('Subtype')))==='/Form'){
              if(xo.dict.has(name('OC'))){warnings.push('Layered content is protected; only separate unlayered shapes can be selected.');continue;}
              const next=copy(state),matrix=lookup(context,xo.dict,'Matrix');if(matrix instanceof P.PDFArray)next.matrix=multiply(next.matrix,matrix.asArray().map(n=>context.lookup(n).asNumber()));
              const bbox=lookup(context,xo.dict,'BBox');if(bbox instanceof P.PDFArray){const [x0,y0,x1,y1]=bbox.asArray().map(n=>context.lookup(n).asNumber()),p=[point(next.matrix,x0,y0),point(next.matrix,x1,y0),point(next.matrix,x1,y1),point(next.matrix,x0,y1)];next.clips.push({commands:[['M',...p[0]],['L',...p[1]],['L',...p[2]],['L',...p[3]],['Z']],rule:'nonzero'});}
              const before=objects.length;try{const child=inspect(contents(context,xo),lookup(context,xo.dict,'Resources')||res,id+'/form'+op.start,next,depth+1);if(child)node.children.push({node:child,stream:xo,operand:op.args[0]});}catch(e){objects.length=before;warnings.push('A nested drawing was skipped: '+e.message);}
            }
          }continue;
        }
        if(o==='m'&&nums(2)){current=transform(...v);start=current;add('M',...current);continue;}
        if(o==='l'&&nums(2)){current=transform(...v);add('L',...current);continue;}
        if(o==='c'&&nums(6)){const a=transform(v[0],v[1]),b=transform(v[2],v[3]),c=transform(v[4],v[5]);add('C',...a,...b,...c);current=c;continue;}
        if(o==='v'&&nums(4)&&current){const b=transform(v[0],v[1]),c=transform(v[2],v[3]);add('C',...current,...b,...c);current=c;continue;}
        if(o==='y'&&nums(4)){const a=transform(v[0],v[1]),c=transform(v[2],v[3]);add('C',...a,...c,...c);current=c;continue;}
        if(o==='h'){add('Z');current=start;continue;}
        if(o==='re'&&nums(4)){const [x,y,w,h]=v,a=transform(x,y),b=transform(x+w,y),c=transform(x+w,y+h),d=transform(x,y+h);add('M',...a);add('L',...b);add('L',...c);add('L',...d);add('Z');start=current=a;continue;}
        if(o==='W'||o==='W*'){clipRule=o==='W*'?'evenodd':'nonzero';continue;}
        if(['S','s','f','F','f*','B','B*','b','b*','n'].includes(o)){
          if(['s','b','b*'].includes(o))add('Z');
          if(o!=='n'&&points.length&&!textDepth&&!protectedDepth){
            const stroke=['S','s','B','B*','b','b*'].includes(o)&&state.strokeAlpha>0,fill=!['S','s'].includes(o)&&state.fillAlpha>0;
            if(stroke||fill){const item={key:id+'/paint'+op.start+'@'+node.digest,node,op,commands,rect:bounds(points),clips:state.clips.slice(),stroke:stroke?state.stroke:null,fill:fill?state.fill:null,hasStroke:stroke,hasFill:fill,width:Math.abs(state.width)*Math.max(Math.hypot(state.matrix[0],state.matrix[1]),Math.hypot(state.matrix[2],state.matrix[3])),rule:o.includes('*')?'evenodd':'nonzero',type:'path',ends:[points[0],current||points.at(-1)]};objects.push(item);node.objects.push(item);}
          }
          if(clipRule)state.clips.push({commands,rule:clipRule});commands=[];points=[];current=start=null;clipRule=null;
        }
      }
      return node;
    }
    let tree;try{tree=inspect(contents(context,page.node.Contents()),resources,'page',normalState());}catch(e){warnings.push(e.message);objects.length=0;tree=null;}
    const annotationTypes=new Set(['Text','FreeText','Line','Square','Circle','Polygon','PolyLine','Highlight','Underline','Squiggly','StrikeOut','Stamp','Caret','Ink','Redact']);
    const annots=lookup(context,page.node,'Annots');
    if(annots instanceof P.PDFArray)annots.asArray().forEach((ref,index)=>{
      const dict=context.lookup(ref);if(!(dict instanceof P.PDFDict))return;
      const subtype=String(dict.get(name('Subtype'))).slice(1),r=lookup(context,dict,'Rect'),flags=lookup(context,dict,'F');
      if(!annotationTypes.has(subtype)||!(r instanceof P.PDFArray)||((flags?.asNumber?.()||0)&35))return;
      const values=r.asArray().map(v=>context.lookup(v).asNumber()),[x0,y0,x1,y1]=values;
      const color=lookup(context,dict,'C'),c=color instanceof P.PDFArray?color.asArray().map(n=>context.lookup(n).asNumber()):null;
      objects.push({key:'annotation'+index+'@'+hash(dict.toString().replace(/\b\d+\s+\d+\s+R\b/g,'ref')),type:'annotation',subtype,rect:{x:Math.min(x0,x1),y:Math.min(y0,y1),w:Math.abs(x1-x0),h:Math.abs(y1-y0)},color:c?.length===3?c:null,ref,index,dict});
    });
    return {objects,tree,warnings:[...new Set(warnings)],pageIndex};
  }
  function eligible(item,filter='coloured'){
    if(item.type==='annotation')return filter!=='fills'&&filter!=='outlines';
    if(filter==='annotations')return false;
    if(filter==='fills')return item.hasFill&&!white(item.fill);
    if(filter==='outlines')return item.hasStroke;
    return filter==='all'||coloured(item.stroke)||coloured(item.fill);
  }
  function connected(seed,objects){
    if(seed.type!=='path'||(!coloured(seed.fill)&&!coloured(seed.stroke)))return [seed];const result=[seed],keys=new Set([seed.key]),colour=x=>JSON.stringify([x.hasFill,x.hasStroke,x.fill,x.stroke]);
    const same=objects.filter(x=>x.type==='path'&&colour(x)===colour(seed));
    for(let i=0;i<result.length;i++)for(const next of same){
      if(keys.has(next.key))continue;const current=result[i],a=current.rect,b=next.rect;
      // Stroked fragments join at their endpoints; filled pieces must touch, not merely overlap.
      const close=current.hasStroke&&!current.hasFill?current.ends.some(p=>next.ends.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<=Math.max(.75,current.width*1.2))):
        Math.max(a.x,b.x)<=Math.min(a.x+a.w,b.x+b.w)+.55&&Math.max(a.y,b.y)<=Math.min(a.y+a.h,b.y+b.h)+.55&&
        (Math.abs(a.x+a.w-b.x)<.55||Math.abs(b.x+b.w-a.x)<.55||Math.abs(a.y+a.h-b.y)<.55||Math.abs(b.y+b.h-a.y)<.55);
      if(close){keys.add(next.key);result.push(next);}
    }
    return result;
  }
  function apply(doc,removals){
    const byPage=new Map();for(const removal of removals){if(!byPage.has(removal.page))byPage.set(removal.page,new Set());for(const key of removal.targets)byPage.get(removal.page).add(key);}
    for(const [pageIndex,keys] of byPage){
      const model=analyse(doc,pageIndex),found=new Set(model.objects.map(o=>o.key));for(const key of keys)if(!found.has(key))throw Error('The PDF source changed. Undo this removal and select the object again.');
      const context=doc.context,page=doc.getPage(pageIndex);
      function rewrite(node){
        if(!node)return null;const patches=[];let res=node.resources,changedResources=false;
        for(const object of node.objects)if(keys.has(object.key))patches.push({start:object.op.start,end:object.op.end,text:'n'});
        for(const child of node.children){
          const replacement=rewrite(child.node);if(!replacement)continue;
          if(!changedResources){res=res?res.clone(context):P.PDFDict.withContext(context);const x=lookup(context,res,'XObject');res.set(name('XObject'),x?x.clone(context):P.PDFDict.withContext(context));changedResources=true;}
          const xObjects=lookup(context,res,'XObject');let serial=1,newName;do{newName=name('RemovedObjectForm'+serial++);}while(xObjects.has(newName));
          const dict=child.stream.dict.clone(context);for(const key of ['Length','Filter','DecodeParms'])dict.delete(name(key));
          dict.set(name('Resources'),replacement.resources||res);const stream=context.flateStream(bytes(replacement.source));for(const [key,value] of dict.entries())stream.dict.set(key,value);
          xObjects.set(newName,context.register(stream));patches.push({start:child.operand.start,end:child.operand.end,text:newName.toString()});
        }
        if(!patches.length)return null;patches.sort((a,b)=>b.start-a.start);let source=node.source;for(const p of patches)source=source.slice(0,p.start)+p.text+source.slice(p.end);return {source,resources:res};
      }
      const edited=rewrite(model.tree);if(edited){page.node.set(name('Contents'),context.register(context.flateStream(bytes(edited.source))));if(edited.resources)page.node.set(name('Resources'),edited.resources);}
      const annotations=model.objects.filter(o=>o.type==='annotation'&&keys.has(o.key));if(annotations.length){
        const deleted=new Set(annotations.map(o=>o.ref.toString()));for(const o of annotations){const popup=o.dict.get(name('Popup'));if(popup)deleted.add(popup.toString());}
        const original=lookup(context,page.node,'Annots');page.node.set(name('Annots'),context.obj(original.asArray().filter(ref=>!deleted.has(ref.toString()))));
      }
    }
  }
  const api={analyse,apply,operators,eligible,connected,coloured,multiply};
  if(typeof module!=='undefined')module.exports=api;else root.PdfObjects=api;
})(typeof window!=='undefined'?window:globalThis);
