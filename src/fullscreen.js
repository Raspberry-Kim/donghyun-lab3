// Presentation only: move existing nodes; never reset the simulation or clone controls.
(()=>{
  const observation=document.querySelector('.observation');
  const arena=document.querySelector('.arena-wrap'), chart=document.querySelector('#chart');
  if(!observation||!arena||!chart)return;
  const entry=document.createElement('button');
  entry.id='full';entry.className='dh-btn dh-full-open';entry.type='button';
  entry.textContent='전체화면';entry.setAttribute('aria-haspopup','dialog');
  entry.setAttribute('aria-expanded','false');
  observation.firstElementChild.append(entry);
  const overlay=document.createElement('div');
  overlay.id='dh-fullscreen';overlay.className='dh-fullscreen';overlay.hidden=true;
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label','실험 전체화면');
  overlay.innerHTML='<div class="dh-full-top"><div class="dh-full-state"></div><div class="dh-full-actions"><button type="button" class="dh-btn" id="full-exit" aria-label="전체화면 종료">전체화면 종료 <kbd>Esc</kbd></button></div></div><div class="dh-full-visuals"><div class="dh-full-scene"><div class="dh-full-arena"></div><section class="dh-full-caption" tabindex="0" aria-label="현재 예제와 설명"><h2 class="dh-full-example"></h2></section></div><div class="dh-full-graph"><div class="dh-full-meters"></div><div class="dh-full-plot"></div></div></div><div class="dh-full-controls" role="group" aria-label="코드 실행 조작"></div>';
  document.body.append(overlay);
  const exit=overlay.querySelector('#full-exit'),controls=overlay.querySelector('.dh-full-controls');
  const arenaHost=overlay.querySelector('.dh-full-arena'),scene=overlay.querySelector('.dh-full-scene');
  const graph=overlay.querySelector('.dh-full-graph'),plot=overlay.querySelector('.dh-full-plot');
  const caption=overlay.querySelector('.dh-full-caption'),exampleTitle=overlay.querySelector('.dh-full-example');
  const themeButton=document.getElementById('theme'),exampleSelect=document.getElementById('example');
  const meters=observation.querySelector('.readouts,.meters'),note=document.getElementById('example-note');
  const title=document.querySelector('.signal-panel .section-bar,.chart-title');
  const legend=document.querySelector('.chart-legend'),sceneLegend=observation.querySelector('.legend');
  const buttons=['run','slow','repeat10','halt'].map(id=>document.getElementById(id));
  const moves=[],background=[];
  let active=false,hadNative=false,serial=0,scrollYBefore=0,focusBefore=null,themeBefore='light';
  function setTheme(value){
    if(document.documentElement.dataset.theme!==value)themeButton?.click();
    themeButton?.setAttribute('aria-pressed',String(value==='dark'));
  }
  function syncCaption(){
    const selected=exampleSelect?.selectedOptions[0];
    const code=document.getElementById('code').value;
    const original=typeof examples!=='undefined'?examples.find(e=>e.id===exampleSelect.value):null;
    const normalized=value=>value.split(/\r?\n/).map(line=>line.trim()).join('\n').trim();
    const same=original&&normalized(code)===normalized(original.code);
    exampleTitle.textContent=same?selected.textContent:'직접 작성·편집한 코드'+(selected?' · 참고 예제: '+selected.textContent:'');
    // Keep the original note and its qualifications intact, also for imported files.
    caption.scrollTop=0;
  }
  const focusBack=()=>{if(!active&&focusBefore?.isConnected)focusBefore.focus({preventScroll:true});};
  function move(node,destination,before=null){
    if(!node)return;
    const marker=document.createComment('fullscreen return');
    node.before(marker);moves.push([node,marker]);destination.insertBefore(node,before);
  }
  function fit(){
    if(!active)return;
    const ratio=Number(arena.dataset.fullRatio);
    const width=Math.max(1,Math.min(arenaHost.clientWidth,arenaHost.clientHeight*ratio));
    arena.style.width=width+'px';arena.style.height=width/ratio+'px';
    // Let the original renderers recalculate axes and their device-pixel backing store.
    window.dispatchEvent(new Event('resize'));
    if(typeof drawChart==='function')drawChart();
    if(typeof drawArena==='function')drawArena(performance.now());
    else if(typeof draw==='function')draw();
  }
  const oldArenaStyle=arena.getAttribute('style');
  const normalBox=arena.getBoundingClientRect();
  const [ratioWidth,ratioHeight=1]=getComputedStyle(arena).aspectRatio.split('/').map(Number);
  arena.dataset.fullRatio=String(ratioWidth/ratioHeight||normalBox.width/normalBox.height||1.333333333);
  function restore(){
    if(!active)return;
    active=false;serial++;
    setTheme(themeBefore);
    for(const [node,marker] of moves.splice(0)){marker.replaceWith(node);}
    if(oldArenaStyle===null)arena.removeAttribute('style');else arena.setAttribute('style',oldArenaStyle);
    for(const [node,inert] of background.splice(0))node.inert=inert;
    overlay.hidden=true;document.body.classList.remove('dh-presenting');
    entry.setAttribute('aria-expanded','false');
    window.scrollTo(0,scrollYBefore);
    focusBack();
    window.dispatchEvent(new Event('resize'));
    if(typeof drawChart==='function')drawChart();
    if(typeof drawArena==='function')drawArena(performance.now());
    else if(typeof draw==='function')draw();
  }
  function close(){
    restore();
    if(document.fullscreenElement===overlay)document.exitFullscreen?.().catch(()=>{}).finally(focusBack);
  }
  function open(){
    if(active)return;
    active=true;hadNative=false;const ticket=++serial;
    scrollYBefore=window.scrollY;focusBefore=document.activeElement;
    themeBefore=document.documentElement.dataset.theme||'light';
    overlay.hidden=false;document.body.classList.add('dh-presenting');
    entry.setAttribute('aria-expanded','true');
    move(arena,arenaHost);move(sceneLegend,scene,caption);
    move(meters,overlay.querySelector('.dh-full-meters'));
    move(title,graph,plot);move(chart,plot);move(legend,graph);
    move(note,caption);move(document.getElementById('result'),caption);
    move(document.getElementById('ext-panel'),caption);
    move(themeButton,overlay.querySelector('.dh-full-actions'),exit);
    syncCaption();setTheme('dark');
    move(document.getElementById('status'),overlay.querySelector('.dh-full-state'));
    buttons.forEach(button=>move(button,controls));
    for(const node of document.body.children)if(node!==overlay&&!['SCRIPT','STYLE'].includes(node.tagName)){
      background.push([node,node.inert]);node.inert=true;
    }
    exit.focus();fit();
    if(overlay.requestFullscreen){
      try{
        Promise.resolve(overlay.requestFullscreen()).then(()=>{
          if(!active||ticket!==serial){if(!active&&document.fullscreenElement===overlay)document.exitFullscreen?.().catch(()=>{}).finally(focusBack);return;}
          hadNative=document.fullscreenElement===overlay;fit();
        }).catch(()=>{/* The same presentation remains available when native fullscreen is denied. */});
      }catch{/* Older browsers may reject fullscreen synchronously. */}
    }
  }
  entry.addEventListener('click',open);exit.addEventListener('click',close);
  exampleSelect?.addEventListener('change',()=>{if(active)syncCaption();});
  document.addEventListener('fullscreenchange',()=>{
    if(document.fullscreenElement===overlay){hadNative=true;fit();}
    else if(active&&hadNative){restore();requestAnimationFrame(focusBack);}
    else if(!active)requestAnimationFrame(focusBack);
  });
  document.addEventListener('keydown',event=>{
    if(!active)return;
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();buttons[0].click();return;}
    if(event.key==='Tab'){
      const items=[...overlay.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')].filter(e=>e.getClientRects().length);
      const first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  },true);
  // Avoid browser gesture zoom within presentation. No simulation parameters are changed.
  overlay.addEventListener('wheel',e=>{if(e.ctrlKey)e.preventDefault();},{passive:false});
  for(const event of ['gesturestart','gesturechange','gestureend'])overlay.addEventListener(event,e=>e.preventDefault(),{passive:false});
  new ResizeObserver(fit).observe(arenaHost);
})();
