/* Quick choices complement the native picker without changing its behaviour. */
(() => {
  const colours=[['Black','#000000'],['Grey','#808080'],['White','#ffffff'],['Red','#ff0000'],['Orange','#ff8800'],['Yellow','#ffff00'],['Green','#008000'],['Blue','#2563eb'],['Purple','#8000ff'],['Pink','#ff66aa']];
  const labels={strokeColor:'Drawing colour',boxFillColor:'Box fill',textColor:'Text colour',paintColor:'Cover colour',redactColor:'Redaction colour'};
  const palettes=[],anchors=new Map();
  for(const input of document.querySelectorAll('#sidebar input[type="color"]')){
    const label=input.closest('label');if(!label)continue;
    const name=labels[input.id]||'Colour';
    const palette=document.createElement('div');palette.className='colour-presets';palette.dataset.colourFor=input.id;
    palette.setAttribute('role','group');palette.setAttribute('aria-label',name+' presets');
    const caption=document.createElement('span');caption.className='colour-presets-title';caption.textContent=name+' presets';palette.append(caption);
    const swatches=document.createElement('div');swatches.className='colour-swatches';palette.append(swatches);
    for(const [colour,value] of colours){
      const button=document.createElement('button');button.type='button';button.className='colour-swatch';button.style.setProperty('--swatch-colour',value);button.dataset.colour=value;
      button.title=colour;button.setAttribute('aria-label',name+': '+colour);button.setAttribute('aria-pressed','false');
      button.addEventListener('click',()=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));sync();});
      swatches.append(button);
    }
    function sync(){for(const button of swatches.children)button.setAttribute('aria-pressed',String(input.value.toLowerCase()===button.dataset.colour));}
    input.addEventListener('input',sync);input.addEventListener('change',sync);sync();
    const anchor=label.closest('.sidebar-row')||label;const previous=anchors.get(anchor)||anchor;previous.after(palette);anchors.set(anchor,palette);
    palettes.push({palette,label});
  }
  // A fill palette follows its field when tools hide controls dynamically.
  function syncVisibility(){for(const {palette,label} of palettes){const hidden=!!label.closest('[hidden]');if(palette.hidden!==hidden)palette.hidden=hidden;}}
  syncVisibility();new MutationObserver(syncVisibility).observe(document.getElementById('sidebar'),{subtree:true,attributes:true,attributeFilter:['hidden']});
})();
