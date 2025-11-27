/* /app/addons-draw.js
   Adds Box, Line, Arrow, Dimension tools + scale (auto + calibrate).
   Safe boot: waits until the editor is ready (no window.* requirement).
   Dimension labels: red & larger (overlay + baked PDF). */
(function boot(){
  // Wait until core globals exist (index.html defines these in earlier <script>s)
  const ready =
    typeof el !== 'undefined' &&
    typeof drawItem === 'function' &&
    typeof applyEditsToPdf === 'function' &&
    typeof cssToPdf === 'function' &&
    typeof cssRectToPdf === 'function' &&
    typeof normalizeCssRect === 'function';

  if (!ready) { return setTimeout(boot, 50); } // try again shortly

  /* ----------------------- Small utilities ----------------------- */
  const PT_TO_MM = 25.4/72;
  const OUR_TYPES = new Set(['box','line','arrow','dimension']);
  const has = (v)=>typeof v!=='undefined' && v!==null;

  function labelWrap(text, node){
    const l = document.createElement('label'); l.append(text+' ');
    l.appendChild(node); return l;
  }
  function hexRgb(hex){
    const h = (hex||'#000000').replace('#',''); const n = parseInt(h,16);
    const r = (h.length===3)?((n>>8)&0xF)*17:(n>>16)&0xFF;
    const g = (h.length===3)?((n>>4)&0xF)*17:(n>>8)&0xFF;
    const b = (h.length===3)?(n&0xF)*17:(n&0xFF);
    return PDFLib.rgb(r/255,g/255,b/255);
  }

  // ===== Dimension label style =====
  const DIM_LABEL_COLOR = '#ef4444';   // bright red for visibility on white drawings
  const DIM_LABEL_PX    = 16;          // overlay font size (canvas pixels)
  const DIM_LABEL_PT    = 14;          // PDF font size (points)

  /* ----------------------- Inject tools into UI ----------------------- */
  const addTool = (value, label) => {
    if ([...el.tool.options].some(o => o.value === value)) return;
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    el.tool.appendChild(opt);
  };
  addTool('box',        'Box (filled)');
  addTool('line',       'Line');
  addTool('arrow',      'Arrow');
  addTool('dimension',  'Dimension (measure)');

  // Stroke width input
  let strokeWidth = document.getElementById('strokeWidth');
  if (!strokeWidth){
    strokeWidth = Object.assign(document.createElement('input'), {
      id:'strokeWidth', type:'number', min:1, max:20, value:2, title:'Stroke width (px)'
    });
    strokeWidth.style.width = '72px';
    el.tool.closest('.bar').appendChild(labelWrap('Stroke', strokeWidth));
  }
  // Dashed
  let strokeDashed = document.getElementById('strokeDashed');
  if (!strokeDashed){
    strokeDashed = Object.assign(document.createElement('input'), { id:'strokeDashed', type:'checkbox' });
    el.tool.closest('.bar').appendChild(labelWrap('Dashed', strokeDashed));
  }
  // Units + Calibrate/Auto buttons (go in bar2)
  let unitSel = document.getElementById('units');
  if (!unitSel){
    unitSel = document.createElement('select'); unitSel.id='units';
    ['mm','cm','m','in','ft'].forEach(u => {
      const o=document.createElement('option'); o.value=u; o.textContent=u; unitSel.appendChild(o);
    });
    unitSel.value='mm';
    el.snap.closest('.bar2').appendChild(labelWrap('Units', unitSel));

    const btnCal = document.createElement('button'); btnCal.id='calibrate'; btnCal.textContent='Calibrate';
    const btnAuto = document.createElement('button'); btnAuto.id='autoScale'; btnAuto.textContent='Auto Scale';
    el.snap.closest('.bar2').appendChild(btnCal);
    el.snap.closest('.bar2').appendChild(btnAuto);
  }

  /* ----------------------- Scale state & helpers ----------------------- */
  const scale = { ratio: 100, units: 'mm' }; // default 1:100 in mm
  function convertToMm(value, unit){
    switch(unit){
      case 'mm': return value;
      case 'cm': return value*10;
      case 'm':  return value*1000;
      case 'in': return value*25.4;
      case 'ft': return value*304.8;
      default:   return value;
    }
  }
  function formatLengthFromPdfPts(distPt){
    const mmOnDrawing = distPt * PT_TO_MM;
    const realMm = mmOnDrawing * scale.ratio;
    const u = scale.units;
    let out = realMm;
    if (u==='cm') out = realMm/10;
    if (u==='m')  out = realMm/1000;
    if (u==='in') out = realMm/25.4;
    if (u==='ft') out = realMm/304.8;
    const prec = (u==='mm')?1:(u==='cm')?2:(u==='m')?3:2;
    return `${out.toFixed(prec)} ${u}`;
  }

  async function autoDetectScale(pageIdx){
    if (typeof pdfDocRender === 'undefined' || !pdfDocRender) {
      alert('Load a PDF first');
      return null;
    }
    const page = await pdfDocRender.getPage((pageIdx ?? currentPageIndex)+1);
    const tc = await page.getTextContent();
    const found = [];
    for (const it of tc.items){
      const s = (it.str||'').trim();
      // common title-block patterns: "Scale 1:100", "SCALE 1 / 50", "1:200"
      const m = s.match(/(?:scale|sc)\s*[:=]?\s*1\s*[:/]\s*(\d{1,4})/i) || s.match(/\b1\s*[:/]\s*(\d{1,4})\b/);
      if (m){ found.push(parseInt(m[1],10)); }
    }
    if (found.length){
      const r = Math.min(...found);
      scale.ratio = r;
      unitSel.value = scale.units;
      alert(`Detected scale 1:${r}`);
      return r;
    }
    alert('No scale pattern found in title block.');
    return null;
  }

  let calibrating = false, calibStartCss = null;
  function beginCalibrate(){
    if (typeof pdfDocRender === 'undefined' || !pdfDocRender) {
      alert('Load a PDF first');
      return;
    }
    calibrating = true; calibStartCss=null;
    alert('Calibration: click two points on the drawing that are a known real distance apart.');
  }
  function finishCalibrate(p1Css, p2Css){
    const p1 = cssToPdf(p1Css), p2 = cssToPdf(p2Css);
    const distPt = Math.hypot(p2.x-p1.x, p2.y-p1.y);
    const distMmDrawing = distPt * PT_TO_MM;
    const ru = unitSel.value;
    const realDistStr = prompt(`Enter real distance between the two points (in ${ru}):`, '1000');
    if (!realDistStr) { calibrating=false; return; }
    const real = parseFloat(realDistStr);
    if (!isFinite(real)||real<=0){ alert('Invalid number'); calibrating=false; return; }
    const realInMm = convertToMm(real, ru);
    scale.ratio = realInMm / distMmDrawing;
    scale.units = ru;
    alert(`Calibrated: 1 drawing mm = ${scale.ratio.toFixed(4)} ${ru}`);
    calibrating=false;
  }

  document.getElementById('autoScale').addEventListener('click', ()=>autoDetectScale());
  document.getElementById('calibrate').addEventListener('click', ()=>beginCalibrate());
  unitSel.addEventListener('change', ()=>{ scale.units = unitSel.value; });

  /* ----------------------- New staged item creators ----------------------- */
  function makeBox(r){
    return {
      id: nextId++, type:'box', page: currentPageIndex, rectCss: r, rot:0,
      stroke: el.textColor.value, fill: el.paintColor.value,
      width: parseInt(strokeWidth.value||'2',10), dashed: !!strokeDashed.checked
    };
  }
  function makeLine(r, a, b){ // endpoints relative to rect
    const rel = (p)=>({ x:p.x - r.x, y:p.y - r.y });
    return {
      id: nextId++, type:'line', page: currentPageIndex, rectCss: r, rot:0,
      a: rel(a), b: rel(b),
      stroke: el.textColor.value, width: parseInt(strokeWidth.value||'2',10), dashed: !!strokeDashed.checked
    };
  }
  function makeArrow(r, a, b){ const it=makeLine(r,a,b); it.type='arrow'; return it; }
  function makeDimension(r, a, b){ const it=makeLine(r,a,b); it.type='dimension'; return it; }

  /* ----------------------- Extend overlay drawing ----------------------- */
  const _drawItem = drawItem;
  window.drawItem = function(it, selected){
    if (it.type==='box'){
      const rd = toDev(it.rectCss);
      overlayCtx.save();
      overlayCtx.fillStyle = it.fill || 'rgba(0,0,0,0)';
      overlayCtx.fillRect(rd.x, rd.y, rd.w, rd.h);
      if (it.width>0){
        overlayCtx.lineWidth = it.width*dpr();
        if (it.dashed) overlayCtx.setLineDash([8*dpr(), 6*dpr()]);
        overlayCtx.strokeStyle = it.stroke || '#000';
        overlayCtx.strokeRect(rd.x, rd.y, rd.w, rd.h);
      }
      overlayCtx.restore();
      if (selected){
        overlayCtx.lineWidth = 2*dpr();
        overlayCtx.strokeStyle = "rgba(59,130,246,0.95)";
        overlayCtx.strokeRect(rd.x, rd.y, rd.w, rd.h);
      }
      return;
    }

    if (it.type==='line' || it.type==='arrow' || it.type==='dimension'){
      const rd = toDev(it.rectCss);
      const a = { x: rd.x + it.a.x*dpr(), y: rd.y + it.a.y*dpr() };
      const b = { x: rd.x + it.b.x*dpr(), y: rd.y + it.b.y*dpr() };
      overlayCtx.save();
      overlayCtx.lineWidth = Math.max(1, (it.width||2)*dpr());
      if (it.dashed) overlayCtx.setLineDash([8*dpr(), 6*dpr()]);
      overlayCtx.strokeStyle = it.stroke || '#00f';
      overlayCtx.beginPath(); overlayCtx.moveTo(a.x, a.y); overlayCtx.lineTo(b.x, b.y); overlayCtx.stroke();

      if (it.type!=='line'){ // arrow heads / dimension ticks + label
        const drawArrowHead = (from,to)=>{
          const ang = Math.atan2(to.y-from.y, to.x-from.x);
          const L = 10*dpr();
          overlayCtx.beginPath();
          overlayCtx.moveTo(to.x, to.y);
          overlayCtx.lineTo(to.x - L*Math.cos(ang - Math.PI/6), to.y - L*Math.sin(ang - Math.PI/6));
          overlayCtx.moveTo(to.x, to.y);
          overlayCtx.lineTo(to.x - L*Math.cos(ang + Math.PI/6), to.y - L*Math.sin(ang + Math.PI/6));
          overlayCtx.stroke();
        };
        if (it.type==='arrow'){ drawArrowHead(a,b); }
        if (it.type==='dimension'){
          // ticks
          const d = Math.hypot(b.x-a.x, b.y-a.y);
          const nx = (b.y-a.y)/d, ny = -(b.x-a.x)/d; // unit normal
          const tick = 6*dpr();
          const tickAt = (p)=>{
            overlayCtx.beginPath();
            overlayCtx.moveTo(p.x - nx*tick, p.y - ny*tick);
            overlayCtx.lineTo(p.x + nx*tick, p.y + ny*tick);
            overlayCtx.stroke();
          };
          tickAt(a); tickAt(b);
          // label based on calibrated scale (RED + larger)
          const aPdf = cssToPdf({ x: it.rectCss.x + it.a.x, y: it.rectCss.y + it.a.y });
          const bPdf = cssToPdf({ x: it.rectCss.x + it.b.x, y: it.rectCss.y + it.b.y });
          const distPt = Math.hypot(bPdf.x-aPdf.x, bPdf.y-aPdf.y);
          const label = formatLengthFromPdfPts(distPt);
          overlayCtx.fillStyle = DIM_LABEL_COLOR;
          overlayCtx.font = `${DIM_LABEL_PX*dpr()}px system-ui, Arial, sans-serif`;
          overlayCtx.textAlign='center'; overlayCtx.textBaseline='bottom';
          const mid = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
          overlayCtx.fillText(label, mid.x, mid.y - 8*dpr());
        }
      }
      overlayCtx.restore();

      if (selected){
        overlayCtx.lineWidth = 1*dpr();
        overlayCtx.setLineDash([4*dpr(),3*dpr()]);
        overlayCtx.strokeStyle = "rgba(59,130,246,0.8)";
        overlayCtx.strokeRect(rd.x, rd.y, rd.w, rd.h);
      }
      return;
    }

    // Fallback for other types
    return _drawItem(it, selected);
  };

  /* ----------------------- Creation (mouse) for new tools ----------------------- */
  let extDragging = false, extStartCss = null;

  el.scroller.addEventListener('mousedown', (ev) => {
    // Calibration clicks override everything
    if (calibrating){
      const rect = el.pdfCanvas.getBoundingClientRect();
      const css = { x: ev.clientX-rect.left, y: ev.clientY-rect.top };
      if (!calibStartCss) { calibStartCss = css; }
      else { finishCalibrate(calibStartCss, css); }
      return;
    }

    const tool = el.tool.value;
    if (!OUR_TYPES.has(tool)) return;

    const rect = el.pdfCanvas.getBoundingClientRect();
    const over = ev.clientX>=rect.left && ev.clientX<=rect.right && ev.clientY>=rect.top && ev.clientY<=rect.bottom;
    if (!over) return;

    extDragging = true;
    extStartCss = { x: ev.clientX-rect.left, y: ev.clientY-rect.top };

    // Draw a quick preview rubber
    const css = extStartCss;
    overlayCtx.clearRect(0,0,el.overlay.width, el.overlay.height);
    if (typeof drawGrid === 'function') drawGrid();
    overlayCtx.lineWidth = 2*dpr();
    overlayCtx.setLineDash([6*dpr(),4*dpr()]);
    overlayCtx.strokeStyle = "rgba(59,130,246,0.9)";
    if (tool==='box'){
      const rd = toDev({x:css.x, y:css.y, w:1, h:1});
      overlayCtx.strokeRect(rd.x,rd.y,rd.w,rd.h);
    } else {
      overlayCtx.beginPath();
      overlayCtx.moveTo(css.x*dpr(), css.y*dpr());
      overlayCtx.lineTo(css.x*dpr(), css.y*dpr());
      overlayCtx.stroke();
    }
  });

  window.addEventListener('mousemove', (ev) => {
    if (!extDragging) return;
    const rect = el.pdfCanvas.getBoundingClientRect();
    const css = { x: Math.max(0, Math.min(rect.width,  ev.clientX-rect.left)),
                  y: Math.max(0, Math.min(rect.height, ev.clientY-rect.top)) };

    overlayCtx.clearRect(0,0,el.overlay.width, el.overlay.height);
    if (typeof drawGrid === 'function') drawGrid();
    overlayCtx.lineWidth = 2*dpr();
    overlayCtx.setLineDash([6*dpr(),4*dpr()]);
    overlayCtx.strokeStyle = "rgba(59,130,246,0.9)";

    const tool = el.tool.value;
    if (tool==='box'){
      const r = normalizeCssRect(extStartCss, css);
      const rd = toDev(r);
      overlayCtx.strokeRect(rd.x,rd.y,rd.w,rd.h);
      overlayCtx.fillStyle = "rgba(59,130,246,0.12)";
      overlayCtx.fillRect(rd.x,rd.y,rd.w,rd.h);
    } else {
      overlayCtx.beginPath();
      overlayCtx.moveTo(extStartCss.x*dpr(), extStartCss.y*dpr());
      overlayCtx.lineTo(css.x*dpr(), css.y*dpr());
      overlayCtx.stroke();
    }
  });

  window.addEventListener('mouseup', (ev) => {
    if (!extDragging) return;
    const rect = el.pdfCanvas.getBoundingClientRect();
    const end = { x: Math.max(0, Math.min(rect.width,  ev.clientX-rect.left)),
                  y: Math.max(0, Math.min(rect.height, ev.clientY-rect.top)) };
    const tool = el.tool.value;

    if (tool==='box'){
      let r = normalizeCssRect(extStartCss, end);
      if (settings.snap) r = snapRect(r);
      pushHistory(); const it = makeBox(r); edits.push(it); selectedIds=[it.id];
    } else {
      const r = normalizeCssRect(extStartCss, end);
      const a = extStartCss, b = end;
      pushHistory();
      let it = (tool==='line') ? makeLine(r,a,b) :
               (tool==='arrow') ? makeArrow(r,a,b) :
               makeDimension(r,a,b);
      edits.push(it); selectedIds=[it.id];
    }
    extDragging=false; extStartCss=null;
    // quick redraw of overlay items on current page
    overlayCtx.clearRect(0,0,el.overlay.width, el.overlay.height);
    if (typeof drawGrid === 'function') drawGrid();
    for (const it of edits){ if (it.page===currentPageIndex) window.drawItem(it, selectedIds.includes(it.id)); }
  });

  /* ----------------------- Extend Apply: burn our items, then call original ----------------------- */
  const _apply = applyEditsToPdf; // keep original
  window.applyEditsToPdf = async function(){
    if (typeof pdfDocWriter === 'undefined' || !pdfDocWriter) return;

    // 1) Take our items out and draw them into the PDF
    const ours = edits.filter(it => OUR_TYPES.has(it.type));
    if (ours.length){
      for (const it of ours){
        const page = pdfDocWriter.getPage(it.page);

        if (it.type==='box'){
          const r = cssRectToPdf(it.rectCss);
          // fill
          if (it.fill){
            page.drawRectangle({ x:r.x, y:r.y, width:r.w, height:r.h, color: hexRgb(it.fill) });
          }
          // stroke
          if ((it.width||0)>0){
            const path = `M ${r.x} ${r.y} h ${r.w} v ${r.h} h ${-r.w} Z`;
            page.drawSvgPath(path, {
              borderColor: hexRgb(it.stroke||'#000000'),
              borderWidth: it.width||1,
              dashArray: it.dashed ? [8,6] : undefined
            });
          }
          continue;
        }

        if (it.type==='line' || it.type==='arrow' || it.type==='dimension'){
          const aCss = { x: it.rectCss.x + it.a.x, y: it.rectCss.y + it.a.y };
          const bCss = { x: it.rectCss.x + it.b.x, y: it.rectCss.y + it.b.y };
          const a = cssToPdf(aCss), b = cssToPdf(bCss);
          const d = Math.hypot(b.x-a.x, b.y-a.y);

          // base line
          const p = `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
          page.drawSvgPath(p, {
            borderColor: hexRgb(it.stroke||'#000000'),
            borderWidth: it.width||1,
            dashArray: it.dashed ? [8,6] : undefined
          });

          if (it.type==='arrow'){
            const L = 10; // points
            const ang = Math.atan2(b.y-a.y, b.x-a.x);
            const x1 = b.x - L*Math.cos(ang - Math.PI/6), y1 = b.y - L*Math.sin(ang - Math.PI/6);
            const x2 = b.x - L*Math.cos(ang + Math.PI/6), y2 = b.y - L*Math.sin(ang + Math.PI/6);
            page.drawSvgPath(`M ${b.x} ${b.y} L ${x1} ${y1} M ${b.x} ${b.y} L ${x2} ${y2}`, {
              borderColor: hexRgb(it.stroke||'#000000'),
              borderWidth: it.width||1
            });
          }

          if (it.type==='dimension'){
            // ticks
            const nx = (b.y-a.y)/d, ny = -(b.x-a.x)/d; // unit normal
            const tick = 4;
            const tickPath = `M ${a.x - nx*tick} ${a.y - ny*tick} L ${a.x + nx*tick} ${a.y + ny*tick}
                              M ${b.x - nx*tick} ${b.y - ny*tick} L ${b.x + nx*tick} ${b.y + ny*tick}`;
            page.drawSvgPath(tickPath, { borderColor: hexRgb(it.stroke||'#000000'), borderWidth: it.width||1 });

            // label (RED + bigger + centered)
            const font  = await pdfDocWriter.embedFont(PDFLib.StandardFonts.Helvetica);
            const label = formatLengthFromPdfPts(d);
            const mid   = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
            const size  = DIM_LABEL_PT;
            const width = font.widthOfTextAtSize(label, size);
            page.drawText(label, {
              x: mid.x - width/2,
              y: mid.y + 8,
              size,
              font,
              color: hexRgb(DIM_LABEL_COLOR)
            });
          }
          continue;
        }
      }
    }

    // 2) Remove our items from 'edits' so the original handler won’t drop them
    if (ours.length){
      window.edits = edits.filter(it => !OUR_TYPES.has(it.type));
    }

    // 3) Call original apply to handle text/image/redact and do save+reload
    await _apply();
  };

  // Done!
})();
