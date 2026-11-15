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
    await p.evaluate(()=>{window.fullscreenOriginalNodes=['run','slow','repeat10','halt','arena','chart'].map(id=>document.getElementById(id));});
    const before=await p.locator('#run,#slow,#repeat10,#halt').evaluateAll(a=>a.map(e=>({id:e.id,html:e.innerHTML,css:['fontSize','padding','backgroundColor','borderRadius'].map(k=>getComputedStyle(e)[k])})));
    await enter();
    assert.deepEqual(await p.locator('.dh-full-controls>button').evaluateAll(a=>a.map(e=>({id:e.id,html:e.innerHTML,css:['fontSize','padding','backgroundColor','borderRadius'].map(k=>getComputedStyle(e)[k])}))),before);
    assert.equal(await p.locator('#code').isVisible(),false);
    assert(await p.evaluate(()=>fullscreenOriginalNodes.every(e=>document.getElementById(e.id)===e)));
    check('original four controls, order, icons, desktop appearance and DOM identity');
    for(const [width,height] of [[1440,900],[1280,600],[390,844],[320,700],[844,390],[1440,900]]){
      await p.setViewportSize({width,height});await settled();
      const boxes=await p.evaluate(()=>['#arena','#chart','#full-exit','#run','#slow','#repeat10','#halt','.chart-legend'].map(selector=>{
        const r=document.querySelector(selector).getBoundingClientRect();
        return {selector,visible:r.width>0&&r.height>0,fit:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1};
      }));
      assert(boxes.every(x=>x.visible&&x.fit),JSON.stringify({width,height,boxes}));
      await p.screenshot({path:path.join(out,'full-'+width+'x'+height+'.png')});
    }
    check('scene, graph, legends and all controls fit six viewport transitions');
    await p.locator('#run').click();
    await p.waitForFunction(()=>!document.querySelector('#halt').disabled);
    await p.waitForFunction(()=>!/^0(?:\.00 s|일째 07:00)$/.test(document.querySelector('#clock').textContent),null,{timeout:60000});
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
    await p.locator('#theme').click();await enter();await p.screenshot({path:path.join(out,'dark.png')});await leave();await p.locator('#theme').click();
    for(const button of await p.locator('.tabs button[data-tab]').all()){await button.click();assert.equal(await button.getAttribute('aria-current'),'page');}
    await p.locator('.tabs button[data-tab="lab"]').click();
    check('theme and all document tabs after restoration');
    const download=p.waitForEvent('download');await p.locator('#save').click();const file=await download;const saved=path.join(out,'roundtrip.dh');await file.saveAs(saved);
    assert.equal(fs.readFileSync(saved,'utf8').replace(/^\uFEFF/,''),code);
    await p.locator('#open').setInputFiles(saved);assert.equal(await p.locator('#code').inputValue(),code);
    check('code file download and upload round trip');
    assert.deepEqual(errors,[]);check('no page errors');
    console.log('PASS',count,'fullscreen UI groups');
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
