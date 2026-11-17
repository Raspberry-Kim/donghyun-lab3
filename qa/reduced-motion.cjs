// 윈도우의 ‘애니메이션 효과’ 끔(prefers-reduced-motion: reduce)에서도 장면이 통상과 같이 움직이는지,
// 주소의 ?motion=reduce 로 동작을 줄였을 때와 화면 갱신 호출이 드물 때에도 새 상태를 계속 그리는지 본다.
// QA_URL이 없으면 빌드한 한 파일을 연다.
const {chromium}=require('/home/user/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),id=Number(require('../package.json').name.slice(-1));
const url=process.env.QA_URL||'file://'+path.join(root,'index.html');
const WIN='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chromium'});let count=0;const errors=[];
  const check=label=>{count++;console.log('PASS',label);};
  // 장면 캔버스에 그린 횟수를 센다. starve가 참이면 화면 갱신 호출을 1초에 한 번으로 늦춘다.
  const open=async(options,starve=false,query='')=>{
    const context=await browser.newContext({viewport:{width:1536,height:730},userAgent:WIN,deviceScaleFactor:1.25,...options});
    await context.addInitScript(starve=>{
      window.__draws=0;const original=CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage=function(...a){if(this.canvas.id==='arena')window.__draws++;return original.apply(this,a);};
      if(starve)window.requestAnimationFrame=f=>setTimeout(()=>f(performance.now()),1000);
    },starve);
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url+query);await p.waitForFunction(()=>!document.querySelector('#run').disabled,null,{timeout:40000});
    return {context,p};
  };
  const snap=p=>p.evaluate(()=>{const u=document.querySelector('#arena').toDataURL();let h=0;for(let i=0;i<u.length;i+=5)h=(h*31+u.charCodeAt(i))|0;return h;});
  // 실행 중 0.12초 간격으로 장면을 떠서 서로 다른 그림의 수와 초당 그린 횟수를 돌려준다.
  const watch=async(p,samples=30)=>{
    const seen=new Set([await snap(p)]);await p.locator('#run').click();
    const t0=Date.now(),d0=await p.evaluate(()=>__draws);let n=0;
    for(let i=0;i<samples;i++){await p.waitForTimeout(120);if(await p.locator('#halt').isDisabled())break;n++;seen.add(await snap(p));}
    const rate=((await p.evaluate(()=>__draws))-d0)/((Date.now()-t0)/1000);
    return {n,distinct:seen.size-1,rate};
  };
  const halt=async p=>{if(!(await p.locator('#halt').isDisabled()))await p.locator('#halt').click();await p.waitForFunction(()=>!document.querySelector('#run').disabled);};
  try{
    // 통상 조건의 그리기 빠르기를 기준으로 삼는다.
    let {context,p}=await open({});
    let r=await watch(p);assert(r.n>=20&&r.distinct>=r.n*.6,JSON.stringify(r));
    if(id===3)assert(r.rate>30,JSON.stringify(r));
    const ordinary=r.rate;await halt(p);await context.close();
    check(`ordinary motion: scene animates (${r.distinct}/${r.n} distinct, ${r.rate.toFixed(1)} draws/s)`);
    // 운영체제가 동작 줄이기를 알려도 장면은 통상과 같이 움직인다.
    ({context,p}=await open({reducedMotion:'reduce'}));
    assert.equal(await p.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
    r=await watch(p);assert(r.n>=20&&r.distinct>=r.n*.6&&r.rate>=ordinary*.6,JSON.stringify({r,ordinary}));
    check(`OS reduced motion: scene animates as usual (${r.distinct}/${r.n} distinct, ${r.rate.toFixed(1)} draws/s)`);
    await halt(p);
    await p.locator('#full').click();await p.waitForFunction(()=>document.querySelector('#dh-fullscreen')&&!document.querySelector('#dh-fullscreen').hidden);
    r=await watch(p);assert(r.n>=20&&r.distinct>=r.n*.6,JSON.stringify(r));await halt(p);
    await p.locator('#full-exit').click();await context.close();
    check(`OS reduced motion: fullscreen scene animates (${r.distinct}/${r.n} distinct)`);
    // 주소에 ?motion=reduce 를 붙이면 연속 애니메이션 없이 새 상태만 그린다.
    ({context,p}=await open({},false,'?motion=reduce'));
    r=await watch(p);assert(r.n>=20&&r.distinct>=r.n*.6&&r.rate<=ordinary*.6,JSON.stringify({r,ordinary}));
    check(`?motion=reduce: scene keeps updating with fewer redraws (${r.distinct}/${r.n} distinct, ${r.rate.toFixed(1)} draws/s)`);
    if(id===3){
      // 계산이 상태를 보내는 빠르기(초당 약 19번)를 넘지 않는다.
      assert(r.rate>8&&r.rate<26,JSON.stringify(r));
      // 전염 중인 사람의 색이 장면에 실제로 나타나고, 전염 중이 0명이면 사라진다.
      const pixels=()=>p.evaluate(()=>{const c=document.querySelector('#arena'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-226)<4&&Math.abs(d[i+1]-85)<4&&Math.abs(d[i+2]-58)<4)n++;const g=JSON.parse(render_game_to_text());return {n,I:g.state.counts.I,busy:g.busy};});
      const pairs=[];for(let i=0;i<40;i++){await p.waitForTimeout(150);const s=await pixels();if(!s.busy)break;pairs.push(s);}
      const withI=pairs.filter(s=>s.I>=3),none=pairs.filter(s=>s.I===0);
      assert(withI.length>0&&withI.every(s=>s.n>0),JSON.stringify(pairs.slice(0,8)));
      assert(none.every(s=>s.n===0),JSON.stringify(none.slice(0,4)));
      const big=pairs.reduce((a,b)=>b.I>a.I?b:a),small=pairs.find(s=>s.I>0&&s.I*3<=big.I);
      if(small)assert(big.n>small.n,JSON.stringify({big,small}));
      check(`?motion=reduce: infectious colour on the scene follows the counts while running (${pairs.length} samples, up to ${big.I} people)`);
    }
    await halt(p);await context.close();
    ({context,p}=await open({},true));
    r=await watch(p);assert(r.n>=20&&r.distinct>=r.n*.5,JSON.stringify(r));await halt(p);await context.close();
    check(`rare animation frames (1 per second): scene still follows new states (${r.distinct}/${r.n} distinct)`);
    assert.deepEqual(errors,[]);check('no page errors');
    console.log('PASS',count,'reduced-motion groups');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
