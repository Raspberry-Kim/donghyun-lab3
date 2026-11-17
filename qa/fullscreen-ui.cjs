// Run against the built single-file page or QA_URL (split build / published page).
const {chromium}=require('/home/user/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),id=Number(require('../package.json').name.slice(-1));
const out=process.env.QA_SHOTS||'/tmp/fullscreen-lab'+id;
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chromium'});
  const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
  const p=await context.newPage(),errors=[];let count=0;
  const check=label=>{count++;console.log('PASS',label);};
  const settled=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const enter=async()=>{await p.locator('#full').click();await settled();assert.equal(await p.locator('#dh-fullscreen').isVisible(),true);};
  const leave=async()=>{await p.locator('#full-exit').click();await settled();assert.equal(await p.locator('.dh-head #run').count(),1);};
  try{
    p.on('pageerror',e=>errors.push(e.message));
    await p.goto(process.env.QA_URL||'http://127.0.0.1:'+(3170+id));
    await p.waitForFunction(()=>!document.querySelector('#run').disabled);
    const code=await p.locator('#code').inputValue(),example=await p.locator('#example').inputValue();
    await p.evaluate(()=>{window.fullscreenOriginalNodes=['run','slow','repeat10','halt','arena','chart','theme','example-note','result'].map(id=>document.getElementById(id));window.originalMeters=document.querySelector('.readouts,.meters');window.originalThemeHandler=document.querySelector('#theme').onclick;});
    const beforeTheme=await p.evaluate(()=>document.documentElement.dataset.theme);
    const before=await p.locator('#run,#slow,#repeat10,#halt').evaluateAll(a=>a.map(e=>({id:e.id,html:e.innerHTML,css:['fontSize','padding','borderRadius'].map(k=>getComputedStyle(e)[k])})));
    await enter();
    assert.deepEqual(await p.locator('.dh-full-controls>button').evaluateAll(a=>a.map(e=>({id:e.id,html:e.innerHTML,css:['fontSize','padding','borderRadius'].map(k=>getComputedStyle(e)[k])}))),before);
    assert.equal(await p.locator('#code').isVisible(),false);
    assert(await p.evaluate(()=>fullscreenOriginalNodes.every(e=>document.getElementById(e.id)===e)));
    check('original four controls, order, icons, desktop appearance and DOM identity');
    assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'light');
    assert.equal(await p.locator('#dh-fullscreen').getAttribute('data-backdrop'),null);
    assert.equal(await p.locator('#theme').getAttribute('aria-pressed'),'false');
    assert(await p.evaluate(()=>document.querySelector('.dh-full-meters').contains(originalMeters)));
    assert.equal(await p.locator('.dh-full-example').innerText(),await p.locator('#example option:checked').innerText());
    assert.equal(await p.locator('.dh-full-caption #example-note').count(),1);
    assert.equal(await p.locator('.dh-full-caption #result').count(),1);
    const positions=await p.evaluate(()=>{const m=originalMeters.getBoundingClientRect(),s=document.querySelector('#arena').getBoundingClientRect(),c=document.querySelector('#chart').getBoundingClientRect(),n=document.querySelector('.dh-full-caption').getBoundingClientRect();return m.left>s.right&&m.bottom<c.top&&n.top>=s.bottom;});
    assert(positions);
    const contentColors=()=>p.evaluate(()=>['.arena-wrap','#chart','.dh-full-caption','.dh-full-meters','.dh-full-controls','.dh-full-state','.dh-full-actions','.chart-legend','#run','#slow','#repeat10','#halt'].map(s=>{
      const e=document.querySelector(s),c=getComputedStyle(e);return [s,c.color,c.backgroundColor,c.borderColor];
    }));
    const lightColors=await contentColors();
    const lightChart=await p.locator('#chart').evaluate(e=>e.toDataURL());
    const lightBackground=await p.locator('#dh-fullscreen').evaluate(e=>getComputedStyle(e).backgroundColor);
    await p.locator('#theme').click();
    assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'dark');
    assert(await p.evaluate(()=>document.querySelector('#theme').onclick===originalThemeHandler));
    assert.equal(await p.locator('#theme').getAttribute('aria-pressed'),'true');
    assert.notEqual(await p.locator('#dh-fullscreen').evaluate(e=>getComputedStyle(e).backgroundColor),lightBackground);
    assert.notDeepEqual(await contentColors(),lightColors);
    assert.notEqual(await p.locator('#chart').evaluate(e=>e.toDataURL()),lightChart);
    assert(await p.evaluate(()=>['.dh-full-caption','.dh-full-meters','.dh-full-controls'].every(s=>getComputedStyle(document.querySelector(s)).backgroundColor===getComputedStyle(document.querySelector('#dh-fullscreen')).backgroundColor)));
    await p.screenshot({path:path.join(out,'theme-dark.png')});
    await p.locator('#theme').click();
    assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'light');
    assert.deepEqual(await contentColors(),lightColors);
    check('top-right meters, bottom-left example, light default and original full-content dark theme');
    for(const [width,height] of [[1440,900],[1280,600],[390,844],[320,700],[844,390],[1440,900]]){
      await p.setViewportSize({width,height});await settled();
      // Phones: the scene fills the column and the graph, legends and caption scroll below it.
      const phone=width<600||height<=500||(width<=780&&height>500);
      const always=['#arena','#full-exit','#theme','#run','#slow','#repeat10','#halt'],below=['#chart','.chart-legend','.dh-full-meters','.dh-full-caption'];
      const measure=list=>p.evaluate(list=>list.map(selector=>{
        const r=document.querySelector(selector).getBoundingClientRect();
        return {selector,visible:r.width>0&&r.height>0,fit:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1,box:[r.left,r.top,r.width,r.height].map(Math.round)};
      }),list);
      const boxes=await measure(phone?always:[...always,...below]);
      assert(boxes.every(x=>x.visible&&x.fit),JSON.stringify({width,height,boxes}));
      if(phone){
        const scene=boxes[0].box,[limit,host]=await p.evaluate(()=>{const o=document.querySelector('#dh-fullscreen'),m=getComputedStyle(o).getPropertyValue('--dh-full-fit').trim();return [document.querySelector(m==='scene'?'.dh-full-scene':'.dh-full-visuals').clientHeight,document.querySelector('.dh-full-arena').clientWidth];});
        // The scene takes the whole column width, or the whole visible height when that is the tighter limit.
        assert(scene[2]>=host-2||scene[3]>=limit-2,JSON.stringify({width,height,scene,limit,host}));
        assert(scene[2]>=Math.min(width,height*1.3)*.55,JSON.stringify({width,height,scene}));
        for(const selector of below){
          const r=await p.evaluate(selector=>{const e=document.querySelector(selector);e.scrollIntoView({block:'start'});const r=e.getBoundingClientRect(),v=document.querySelector('.dh-full-visuals').getBoundingClientRect();
            return {selector,visible:r.width>0&&r.height>0,reach:r.left>=-1&&r.right<=innerWidth+1&&r.top>=v.top-1&&r.top<v.bottom-20};},selector);
          assert(r.visible&&r.reach,JSON.stringify({width,height,r}));
        }
        // Scrolled parts never cover the fixed top row or the run controls.
        assert(await p.evaluate(()=>{const v=document.querySelector('.dh-full-visuals').getBoundingClientRect();return ['#full-exit','#run','#halt'].every(s=>{const r=document.querySelector(s).getBoundingClientRect();return r.bottom<=v.top+1||r.top>=v.bottom-1;})&&document.querySelector('#dh-fullscreen').scrollWidth<=innerWidth+1;}));
        await p.evaluate(()=>{for(const e of document.querySelectorAll('.dh-full-visuals,.dh-full-scene,.dh-full-graph'))e.scrollTop=0;});
      }
      await p.screenshot({path:path.join(out,'full-'+width+'x'+height+'.png')});
    }
    check('scene and controls fit six viewport transitions; on phones the scene is large and the rest scrolls');
    await p.evaluate(()=>{window.meterUpdates=0;new MutationObserver(()=>meterUpdates++).observe(originalMeters,{childList:true,subtree:true,characterData:true});});
    await p.locator('#run').click();
    await p.waitForFunction(()=>!document.querySelector('#halt').disabled);
    await p.waitForFunction(()=>!/^0(?:\.00 s|일째 07:00)$/.test(document.querySelector('#clock').textContent),null,{timeout:60000});
    assert(await p.evaluate(()=>meterUpdates>0));
    await p.screenshot({path:path.join(out,'running.png')});
    await p.locator('#slow').click();assert.equal(await p.locator('#slow').getAttribute('aria-pressed'),'true');
    await p.locator('#slow').click();assert.equal(await p.locator('#slow').getAttribute('aria-pressed'),'false');
    await leave();assert.equal(await p.locator('#halt').isDisabled(),false);
    await enter();await p.locator('#halt').click();
    await p.waitForFunction(()=>!document.querySelector('#run').disabled);
    check('run, advancing model time, slow toggle, transition while running and halt');
    assert.equal(await p.locator('#csv').isDisabled(),false);
    await leave();
    const csvWait=p.waitForEvent('download');await p.locator('#csv').click();const csv=await csvWait;await csv.saveAs(path.join(out,'observations.csv'));
    assert(fs.statSync(path.join(out,'observations.csv')).size>100);
    await enter();check('observations CSV download');
    await p.locator('#repeat10').click();assert.equal(await p.locator('#repeat10').getAttribute('aria-pressed'),'true');
    await p.locator('#repeat10').click();assert.equal(await p.locator('#repeat10').getAttribute('aria-pressed'),'false');
    await p.locator('#halt').click();await p.waitForFunction(()=>!document.querySelector('#run').disabled);
    check('repeat start and remaining-repeat cancellation');
    await p.keyboard.press('Escape');await settled();
    assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),beforeTheme);
    assert.equal(await p.locator('.edition #theme').count(),1);
    assert(await p.evaluate(()=>document.querySelector('.observation').contains(originalMeters)));
    assert.equal(await p.locator('#dh-fullscreen').isVisible(),false);
    assert.equal(await p.locator('#full').evaluate(e=>e===document.activeElement),true);
    assert.equal(await p.locator('#code').inputValue(),code);assert.equal(await p.locator('#example').inputValue(),example);
    check('Escape restores original code, example, controls and focus');
    // Browser-denied native fullscreen is deliberately staged; entry/exit still use real clicks.
    await p.evaluate(()=>{document.querySelector('#dh-fullscreen').requestFullscreen=()=>Promise.reject(new Error('QA denied'));});
    await enter();assert.equal(await p.evaluate(()=>!!document.fullscreenElement),false);
    await p.locator('#full-exit').focus();await p.keyboard.press('Shift+Tab');
    assert.equal(await p.evaluate(()=>document.activeElement.closest('#dh-fullscreen')!==null),true);
    await p.keyboard.press('Control+Enter');await p.waitForFunction(()=>!document.querySelector('#halt').disabled);
    await p.locator('#halt').click();await p.waitForFunction(()=>!document.querySelector('#run').disabled);
    assert.deepEqual(await p.evaluate(()=>['wheel','gesturestart'].map(type=>{const e=type==='wheel'?new WheelEvent(type,{ctrlKey:true,bubbles:true,cancelable:true}):new Event(type,{bubbles:true,cancelable:true});document.querySelector('#dh-fullscreen').dispatchEvent(e);return e.defaultPrevented;})),[true,true]);
    await leave();check('denied native API fallback, focus containment, keyboard run and gesture blocking');
    await p.locator('#theme').click();
    assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'dark');
    await p.mouse.move(0,0);await settled();
    const playgroundColors=await p.locator('.observation,#chart').evaluateAll(a=>a.map(e=>{const c=getComputedStyle(e);return [c.color,c.backgroundColor];}));
    const themeAttributes=await p.locator('#theme').evaluate(e=>['aria-label','title','aria-pressed'].map(a=>e.getAttribute(a)));
    await enter();
    assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'light');
    assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'light');
    await p.locator('#theme').click();await p.screenshot({path:path.join(out,'dark.png')});
    await leave();
    await p.mouse.move(0,0);await settled();
    assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'dark');
    assert.deepEqual(await p.locator('.observation,#chart').evaluateAll(a=>a.map(e=>{const c=getComputedStyle(e);return [c.color,c.backgroundColor];})),playgroundColors);
    assert.deepEqual(await p.locator('#theme').evaluate(e=>['aria-label','title','aria-pressed'].map(a=>e.getAttribute(a))),themeAttributes);
    await enter();assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'light');
    await p.keyboard.press('Escape');await settled();
    assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'dark');
    await p.locator('#theme').click();
    assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'light');
    for(const button of await p.locator('.tabs button[data-tab]').all()){await button.click();assert.equal(await button.getAttribute('aria-current'),'page');}
    await p.locator('.tabs button[data-tab="lab"]').click();
    check('theme and all document tabs after restoration');
    const download=p.waitForEvent('download');await p.locator('#save').click();const file=await download;const saved=path.join(out,'roundtrip.dh');await file.saveAs(saved);
    assert.equal(fs.readFileSync(saved,'utf8').replace(/^\uFEFF/,''),code);
    await p.locator('#open').setInputFiles(saved);
    await p.waitForFunction(()=>document.querySelector('#open').value==='');
    assert.equal(await p.locator('#code').inputValue(),code);
    check('code file download and upload round trip');
    await p.locator('#example').selectOption({index:1});const nextNote=await p.locator('#example-note').innerText();
    await enter();assert.equal(await p.locator('.dh-full-example').innerText(),await p.locator('#example option:checked').innerText());
    assert.equal(await p.locator('.dh-full-caption #example-note').innerText(),nextNote);await leave();
    await p.locator('#code').fill((await p.locator('#code').inputValue())+'\nㅋㅋ 전체화면 편집 검사');
    await enter();assert((await p.locator('.dh-full-example').innerText()).startsWith('직접 작성·편집한 코드'));await leave();
    check('changed example and edited-code title are accurate');
    if(id===3){
      await p.locator('#example').selectOption('rsv-window');
      const longNote=await p.locator('#example-note').innerText();
      await enter();assert.equal(await p.locator('.dh-full-caption #example-note').innerText(),longNote);
      assert(await p.locator('.dh-full-caption').evaluate(e=>e.scrollHeight>e.clientHeight));
      await p.locator('.dh-full-caption').focus();await p.keyboard.press('Control+End');
      await p.waitForFunction(()=>document.querySelector('.dh-full-caption').scrollTop>0);
      assert(await p.locator('.dh-full-caption').evaluate(e=>e.scrollTop>0));
      await leave();check('full village explanation preserved and keyboard-scrollable');
    }
    assert.deepEqual(errors,[]);check('no page errors');
    console.log('PASS',count,'fullscreen UI groups');
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
