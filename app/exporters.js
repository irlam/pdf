/* /app/exporters.js */
(() => {
  const PT_TO_MM = 25.4/72;

  let pdfBytes=null, pdfDoc=null;

  document.getElementById('pdfFile').addEventListener('change', async (e)=>{
    const f=e.target.files?.[0]; if(!f) return;
    pdfBytes = new Uint8Array(await f.arrayBuffer());
    pdfDoc = await pdfjsLib.getDocument({data:pdfBytes}).promise;
    alert(`Loaded PDF with ${pdfDoc.numPages} page(s).`);
  });

  async function extractAllText(){
    if (!pdfDoc){ alert('Load a PDF first'); return []; }
    const rows = [];
    for (let i=1;i<=pdfDoc.numPages;i++){
      const page = await pdfDoc.getPage(i);
      const vp = page.getViewport({scale:1});
      const tc = await page.getTextContent();
      for (const it of tc.items){
        const t = it.transform, x=t[4], y=t[5], w=it.width, h=it.height;
        rows.push({ page:i, text:it.str, x, y, w, h });
      }
    }
    return rows;
  }

  function download(name, content, mime='text/plain'){
    const blob = new Blob([content], {type:mime});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  }

  document.getElementById('txtCsv').addEventListener('click', async ()=>{
    const rows = await extractAllText();
    const header = 'page,text,x,y,w,h\n';
    const csv = header + rows.map(r =>
      [r.page, csvq(r.text), r.x, r.y, r.w, r.h].join(',')
    ).join('\n');
    download('pdf_text.csv', csv, 'text/csv');
  });
  function csvq(s){ return `"${(s||'').replace(/"/g,'""')}"`; }

  document.getElementById('txtJson').addEventListener('click', async ()=>{
    const rows = await extractAllText();
    download('pdf_text.json', JSON.stringify(rows, null, 2), 'application/json');
  });

  /* ---- Overlay JSON → SVG/DXF ---- */
  let overlayData = null;
  document.getElementById('overlayJson').addEventListener('change', async (e)=>{
    const f=e.target.files?.[0]; if(!f) return;
    overlayData = JSON.parse(await f.text());
    alert(`Loaded overlay with ${overlayData.length} item(s).`);
  });

  document.getElementById('ovSvg').addEventListener('click', ()=>{
    if (!overlayData){ alert('Load overlay JSON'); return; }
    const svg = overlayToSvg(overlayData);
    download('overlay.svg', svg, 'image/svg+xml');
  });

  document.getElementById('ovDxf').addEventListener('click', ()=>{
    if (!overlayData){ alert('Load overlay JSON'); return; }
    const dxf = overlayToDxf(overlayData);
    download('overlay.dxf', dxf, 'application/dxf');
  });

  function overlayToSvg(items){
    const w=1000, h=1414; // arbitrary canvas for overlay-only export
    const lines = [];
    lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
    for (const it of items){
      if (it.type==='box' || it.type==='redact'){
        const r = it.rectCss; lines.push(
          `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${it.fill||it.color||'none'}" stroke="${it.stroke||'#000'}" stroke-width="${it.width||1}" ${it.dashed?'stroke-dasharray="8 6"':''}/>`
        );
      }
      if (it.type==='line' || it.type==='arrow' || it.type==='dimension'){
        const a = { x: it.rectCss.x + it.a.x, y: it.rectCss.y + it.a.y };
        const b = { x: it.rectCss.x + it.b.x, y: it.rectCss.y + it.b.y };
        lines.push(`<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" fill="none" stroke="${it.stroke||'#000'}" stroke-width="${it.width||1}" ${it.dashed?'stroke-dasharray="8 6"':''} />`);
      }
      if (it.type==='text'){
        const r = it.rectCss;
        lines.push(`<text x="${r.x+2}" y="${r.y+12}" font-size="${it.fontSize||12}" fill="${it.color||'#000'}">${escapeXml(it.text||'')}</text>`);
      }
      if (it.type==='image'){
        // images omitted in SVG overlay export
      }
    }
    lines.push(`</svg>`);
    return lines.join('\n');
  }
  function escapeXml(s){ return (s||'').replace(/[<>&"]/g, c=>({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c])); }

  function overlayToDxf(items){
    const L = [];
    // Very small DXF (R12) with LINE & LWPOLYLINE rectangles; TEXT simplified
    L.push("0\nSECTION\n2\nENTITIES");
    for (const it of items){
      if (it.type==='box' || it.type==='redact'){
        const r = it.rectCss;
        const pts = [[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]];
        L.push("0\nLWPOLYLINE\n8\n0\n90\n4\n70\n1");
        pts.forEach((p,i)=>{ L.push(`10\n${p[0]}\n20\n${p[1]}`); });
      }
      if (it.type==='line' || it.type==='arrow' || it.type==='dimension'){
        const a = { x: it.rectCss.x + it.a.x, y: it.rectCss.y + it.a.y };
        const b = { x: it.rectCss.x + it.b.x, y: it.rectCss.y + it.b.y };
        L.push(`0\nLINE\n8\n0\n10\n${a.x}\n20\n${a.y}\n11\n${b.x}\n21\n${b.y}`);
      }
      if (it.type==='text'){
        const r = it.rectCss, s = it.text||'';
        L.push(`0\nTEXT\n8\n0\n10\n${r.x+2}\n20\n${r.y+2}\n40\n${it.fontSize||12}\n1\n${s.replace(/\n/g,' ')}`);
      }
    }
    L.push("0\nENDSEC\n0\nEOF");
    return L.join('\n');
  }
})();
