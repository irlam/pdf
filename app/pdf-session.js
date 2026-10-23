/* Same-tab PDF handoff. Document bytes stay in this browser's IndexedDB. */
(() => {
  'use strict';
  const LIMIT=100*1024*1024;
  let dbPromise, adapter, ready=Promise.resolve(), pending=Promise.resolve(), navigating=false, currentName='';
  let key;
  try { key=sessionStorage.getItem('pdf-session-key');if(!key){key=crypto.randomUUID();sessionStorage.setItem('pdf-session-key',key);} } catch {}
  function db(){
    if(!key)return Promise.reject(new Error('Browser storage is unavailable. Allow storage to carry PDFs between tools.'));
    return dbPromise ||= new Promise((resolve,reject)=>{const r=indexedDB.open('pdf-current-document',1);r.onupgradeneeded=()=>r.result.createObjectStore('documents');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  }
  async function transaction(mode,run){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('documents',mode),r=run(tx.objectStore('documents'));tx.oncomplete=()=>resolve(r?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('PDF storage failed.'));});}
  async function read(){await pending;return transaction('readonly',s=>s.get(key));}
  function display(name){currentName=name||'';const label=document.getElementById('currentPdfName');if(label){label.textContent=name?'Current PDF: '+name:'No current PDF';label.title=label.textContent;} }
  function save(bytes,name=currentName||'document.pdf'){
    const copy=new Uint8Array(bytes).slice();
    if(copy.byteLength>LIMIT)return Promise.reject(new Error('This PDF is over the 100 MB handoff limit. Download it before switching tools.'));
    pending=pending.catch(()=>{}).then(()=>transaction('readwrite',s=>s.put({bytes:copy,name,date:Date.now()},key))).then(()=>display(name));return pending;
  }
  async function close(){await pending.catch(()=>{});await transaction('readwrite',s=>s.delete(key));adapter?.discard?.();location.reload();}
  function report(error){console.error(error);alert(error.message||'Unable to keep the current PDF. Stay on this page and download a copy.');}
  function controls(){
    const button=document.createElement('button');button.type='button';button.textContent='Close current PDF';button.onclick=()=>close().catch(report);
    const menu=document.querySelector('.document-menu-content');if(menu){menu.append(button);return;}
    const bar=document.createElement('div');bar.className='current-pdf';const name=document.createElement('span');name.id='currentPdfName';bar.append(name,button);
    const wrap=document.querySelector('.wrap');if(wrap)wrap.prepend(bar);else document.querySelector('.topnav')?.after(bar);
    const style=document.createElement('style');style.textContent='.current-pdf{display:flex;align-items:center;gap:12px;justify-content:space-between;margin:10px 0;color:#94a3b8;font:12px system-ui}.current-pdf span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.current-pdf button{flex-shrink:0;height:auto;min-height:28px;line-height:1.2;padding:5px 8px;font-size:11px}';document.head.append(style);
  }
  function connect(value={}){
    adapter=value;controls();ready=(async()=>{const record=await read();if(record){display(record.name);if(adapter.load&&!adapter.hasDocument?.())await adapter.load(record);}})();
    ready.catch(e=>{console.warn('PDF handoff unavailable:',e);display('');});return ready;
  }
  function file(record){return new File([record.bytes],record.name,{type:'application/pdf'});}
  async function validate(f){const bytes=new Uint8Array(await f.arrayBuffer());if(window.PDFLib)await PDFLib.PDFDocument.load(bytes);else if(window.pdfjsLib){const doc=await pdfjsLib.getDocument({data:bytes.slice()}).promise;await doc.destroy();}return bytes;}
  function connectFiles(ids){
    const inputs=ids.map(id=>document.getElementById(id));
    const populate=(f,skip)=>{for(const input of inputs){if(input===skip)continue;const transfer=new DataTransfer();transfer.items.add(f);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}};
    let restoring=false,loading=Promise.resolve();
    for(const input of inputs)input.addEventListener('change',()=>{if(restoring)return;const f=input.files?.[0];if(!f)return;loading=(async()=>{const bytes=await validate(f);await save(bytes,f.name);restoring=true;try{populate(f,input);}finally{restoring=false;}})();loading.catch(report);});
    return connect({hasDocument:()=>inputs.some(input=>input.files.length),load:async record=>{restoring=true;try{populate(file(record));}finally{restoring=false;}},read:async()=>{await loading;return null;}});
  }
  document.addEventListener('click',async event=>{
    const link=event.target.closest('a[href]');if(!link||!link.closest('.topnav')||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.target==='_blank'||link.download)return;
    const url=new URL(link.href,location.href);if(url.origin!==location.origin||url.pathname===location.pathname)return;
    event.preventDefault();if(navigating)return;navigating=true;link.setAttribute('aria-busy','true');
    try{await ready.catch(()=>{});await pending.catch(()=>{});const record=await adapter?.read?.();if(record)await save(record.bytes,record.name);location.assign(url.href);}catch(e){report(e);navigating=false;link.removeAttribute('aria-busy');}
  });
  window.PdfSession={connect,connectFiles,save,read,file,get name(){return currentName;}};
})();
