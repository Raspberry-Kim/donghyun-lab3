// 아이폰 사파리(WebKit) 조건의 전체화면: 장면이 화면을 채우는 크기인지, 나머지는 스크롤로 닿는지 본다.
// QA_URL이 없으면 빌드한 한 파일을 연다. 실제 기기 검사를 대신하지는 않는다.
const {webkit,devices}=require('/home/user/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),id=Number(require('../package.json').name.slice(-1));
const url=process.env.QA_URL||'file://'+path.join(root,'index.html');
const out=process.env.QA_SHOTS||'/tmp/fullscreen-phone-lab'+id;fs.mkdirSync(out,{recursive:true});
const phones=['iPhone 15','iPhone 15 landscape','iPhone SE','iPhone 15 Pro Max','iPhone 15 Pro Max landscape'];
(async()=>{
  const browser=await webkit.launch();let count=0;const errors=[];
  try{
    for(const name of phones){
      const context=await browser.newContext({...devices[name]}),p=await context.newPage();
      p.on('pageerror',e=>errors.push(name+': '+e.message));
      await p.goto(url);await p.waitForFunction(()=>!document.querySelector('#run').disabled,null,{timeout:40000});
      const home=await p.evaluate(()=>{const a=document.querySelector('.arena-wrap');return {style:a.getAttribute('style'),parent:a.parentElement.className};});
      await p.locator('#full').click();
      await p.waitForFunction(()=>!document.querySelector('#dh-fullscreen').hidden);await p.waitForTimeout(300);
      const m=await p.evaluate(()=>{
        const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {s,x:r.left,y:r.top,w:r.width,h:r.height,r:r.right,b:r.bottom};};
        const fixed=['#arena','#full-exit','#theme','#run','#slow','#repeat10','#halt'].map(box);
        const o=document.querySelector('#dh-fullscreen');
        return {vw:innerWidth,vh:innerHeight,fixed,visuals:box('.dh-full-visuals'),overflowX:o.scrollWidth-innerWidth,mode:getComputedStyle(o).getPropertyValue('--dh-full-fit').trim()};
      });
      const landscape=m.vw>m.vh,arena=m.fixed[0];
      assert(m.fixed.every(b=>b.w>0&&b.h>0&&b.x>=-1&&b.r<=m.vw+1&&b.y>=-1&&b.b<=m.vh+1),JSON.stringify({name,m}));
      assert.equal(m.mode,landscape?'scene':'visuals',name);
      // 세로: 장면이 화면 너비를 거의 채운다. 가로: 장면이 화면 높이의 6할 이상이다.
      if(landscape)assert(arena.h>=m.vh*.6,JSON.stringify({name,arena,vh:m.vh}));
      else assert(arena.w>=m.vw*.88||arena.h>=m.visuals.h-2,JSON.stringify({name,arena,vw:m.vw}));
      // 고정된 버튼끼리 겹치지 않고, 스크롤 영역과도 겹치지 않는다.
      const buttons=m.fixed.slice(1);
      for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i],b=buttons[j];assert(a.r<=b.x+1||b.r<=a.x+1||a.b<=b.y+1||b.b<=a.y+1,JSON.stringify({name,a,b}));}
      assert(buttons.every(b=>b.b<=m.visuals.y+1||b.y>=m.visuals.b-1),JSON.stringify({name,buttons,visuals:m.visuals}));
      assert(m.overflowX<=1,JSON.stringify({name,overflowX:m.overflowX}));
      // 지표·그래프·범례·설명은 스크롤로 닿는다.
      for(const s of ['.dh-full-meters','#chart','.chart-legend','.dh-full-caption']){
        const r=await p.evaluate(s=>{const e=document.querySelector(s);e.scrollIntoView({block:'start'});const r=e.getBoundingClientRect(),v=document.querySelector('.dh-full-visuals').getBoundingClientRect();return {s,w:r.width,h:r.height,ok:r.left>=-1&&r.right<=innerWidth+1&&r.top>=v.top-1&&r.top<v.bottom-20};},s);
        assert(r.w>0&&r.h>0&&r.ok,JSON.stringify({name,r}));
      }
      await p.evaluate(()=>{for(const e of document.querySelectorAll('.dh-full-visuals,.dh-full-scene,.dh-full-graph'))e.scrollTop=0;});
      // 실행하면 큰 장면이 실제로 바뀐다.
      const snap=()=>p.evaluate(()=>{const u=document.querySelector('#arena').toDataURL();let h=0;for(let i=0;i<u.length;i+=5)h=(h*31+u.charCodeAt(i))|0;return h;});
      const seen=new Set([await snap()]);await p.locator('#run').click();
      for(let i=0;i<12;i++){await p.waitForTimeout(150);seen.add(await snap());}
      assert(seen.size>=5,JSON.stringify({name,distinct:seen.size}));
      await p.screenshot({path:path.join(out,name.replace(/ /g,'-')+'.png')});
      if(!(await p.locator('#halt').isDisabled()))await p.locator('#halt').click();
      await p.waitForFunction(()=>!document.querySelector('#run').disabled);
      await p.locator('#full-exit').click();await p.waitForTimeout(200);
      assert.equal(await p.locator('#dh-fullscreen').isVisible(),false);
      assert.deepEqual(await p.evaluate(()=>{const a=document.querySelector('.arena-wrap');return {style:a.getAttribute('style'),parent:a.parentElement.className};}),home);
      count++;console.log('PASS',name,`${m.vw}×${m.vh} · scene ${Math.round(arena.w)}×${Math.round(arena.h)} · ${seen.size-1} distinct frames`);
      await context.close();
    }
    assert.deepEqual(errors,[]);console.log('PASS no page errors');
    console.log('PASS',count,'phone fullscreen layouts');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
