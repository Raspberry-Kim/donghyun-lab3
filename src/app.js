const $=s=>document.querySelector(s),canvas=$('#arena'),ctx=canvas.getContext('2d'),chart=$('#chart'),cc=chart.getContext('2d');
const W=960,H=720,SKY=60;
let worker,ready=false,busy=false,state=null,people=null,series=[],allSeries=[],lastSource='',data=null,workerURL='',chartPeak=0,layout=null,paths=[],meadows=[],bg=null,bgKey='';
let contactTrails=[],sparks=[],ripples=[],lastDay=-1,archive=[],runIndex=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const S=0,E=1,I=2,R=3;
const palette={
  light:{paper:'#f3ecdc',meadow:['#d6e3bf','#e9dfc2','#cfe0d0','#eadcc0'],path:'#b7a98a',S:'#fbf6ea',Sline:'#a69578',E:'#f3c049',Eline:'#b98915',I:'#e2553a',Iline:'#9e3220',R:'#a9c7dc',Rline:'#6d93ad',V:'#3f9463',Q:'#7d6a52',contact:'#8f7b5a',spark:'#ff6a3d',text:'#6e6356',ink:'#26211c'},
  dark:{paper:'#1e1a16',meadow:['#28321f','#312a1d','#243229','#332c1c'],path:'#5a4f40',S:'#d9d0bf',Sline:'#8d816d',E:'#f0b53a',Eline:'#c88f12',I:'#ff6a4a',Iline:'#c13f28',R:'#7fa6c2',Rline:'#5c84a1',V:'#5ec18a',Q:'#bfa98a',contact:'#c9b797',spark:'#ff8a5c',text:'#a89c8c',ink:'#efe6d8'}
};
const theme=()=>palette[document.documentElement.dataset.theme==='dark'?'dark':'light'];
$('#theme').onclick=()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';$('#theme').setAttribute('aria-pressed',String(dark));bg=null;draw();drawChart();};
for(const ex of examples){const o=document.createElement('option');o.value=ex.id;o.textContent=ex.title;$('#example').append(o);}
function codeChanged(){const n=$('#code').value.split('\n').length;$('#line-count').textContent=n+'줄';$('#lines').textContent=Array.from({length:n},(_,i)=>i+1).join('\n');}
function selectExample(){
  const ex=examples.find(e=>e.id===$('#example').value);$('#code').value=ex.code;$('#example-note').textContent=ex.note;codeChanged();
  $('#welcome h3').textContent=ex.title.slice(5);
  $('#welcome p').textContent=ex.id==='blank'?'시작과 끝 사이에 나만의 마을 실험을 써 보자.':'첫 환자 한 명에서 마을 전체까지, 코드 한 번으로 지켜보자.';
}
selectExample();$('#example').onchange=selectExample;$('#code').oninput=codeChanged;$('#code').onscroll=()=>$('#lines').scrollTop=$('#code').scrollTop;
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('[data-tab]').forEach(x=>{x.classList.toggle('active',x===b);if(x===b)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current');});
  document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!=='tab-'+b.dataset.tab);
  if(b.dataset.tab==='lab'){draw();drawChart();}
});
function showReference(key){
  document.querySelectorAll('[data-reference]').forEach(b=>{const yes=b.dataset.reference===key;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes));});
  document.querySelectorAll('[data-reference-panel]').forEach(p=>p.hidden=p.dataset.referencePanel!==key);
}
document.querySelectorAll('[data-reference]').forEach(b=>b.onclick=()=>showReference(b.dataset.reference));
function openReference(hash){
  let id;try{id=decodeURIComponent(hash.slice(1));}catch{return false;}
  const target=document.getElementById(id),panel=target?.closest('[data-reference-panel]');if(!panel)return false;
  document.querySelector('[data-tab="science"]').click();showReference(panel.dataset.referencePanel);
  for(let n=target;n&&n!==panel.parentElement;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;
  requestAnimationFrame(()=>{target.scrollIntoView({block:'start'});if(target.hasAttribute('tabindex'))target.focus({preventScroll:true});});return true;
}
document.querySelectorAll('a[href^="#"]:not(#data-download)').forEach(a=>a.addEventListener('click',e=>{if(openReference(a.getAttribute('href'))){e.preventDefault();try{history.replaceState(null,'',a.getAttribute('href'));}catch{}}}));
addEventListener('hashchange',()=>openReference(location.hash));if(location.hash)openReference(location.hash);
$('.brand').onclick=e=>{e.preventDefault();document.querySelector('[data-tab="lab"]').click();window.scrollTo({top:0,behavior:'instant'});};
function controls(){for(const id of ['run','demo'])$('#'+id).disabled=!ready||busy;$('#halt').disabled=!busy;$('#code').readOnly=busy;$('#example').disabled=busy;}
function status(text,kind=''){$('#status').textContent=text;$('#status').dataset.kind=kind;}
function renderLog(rows){
  $('#log').replaceChildren(...rows.map(r=>{const li=document.createElement('li'),t=document.createElement('time');t.textContent=r.day.toFixed(1).padStart(5,' ')+'일';li.append(t,document.createTextNode(r.text));return li;}));
  $('#log').scrollTop=$('#log').scrollHeight;
}
const DAYNAMES=['목','금','토'];
function describe(s){
  if(!s||!s.pathogenName)return '출발 대기';
  if(!s.index)return s.pathogenName+' · 첫 환자를 기다리는 중';
  const c=s.counts;
  if(s.time===0)return `${s.pathogenName} · 첫 환자 ${s.index}번이 마을에 들어왔다`;
  if(c.E+c.I===0)return `${s.pathogenName} · 유행이 끝났다 · 누적 ${s.cum}명`;
  if(s.night)return `${s.pathogenName} · 밤, 기록이 없는 시간이 흐른다`;
  return `${s.pathogenName} · 전염 중 ${c.I}명 · 잠복 ${c.E}명 · 누적 ${s.cum}명`;
}
function receive(m){
  const now=performance.now();
  if(m.state)state=m.state;if(m.people)people=m.people;
  if(m.series?.length){series.push(...m.series);}
  if(m.type==='ready'){ready=true;status('마을 준비 완료');}
  if(m.type==='done'){busy=false;status('실험 완료');const c=state.counts;$('#result').textContent=state.index?`${state.day}일 동안 ${state.pathogenName} 유행을 지켜봤다. 누적 감염 ${state.cum}명(${(state.cum/469*100).toFixed(1)}%), 접종 ${c.V}명, 감수성자 ${c.S}명이 남았다.`:'시간이 흐르지 않았다. 명령 2·3·7로 병원체·첫 환자·기간을 정해 보자.';}
  if(m.type==='halted'){busy=false;status('중단됨');$('#result').textContent='오겡끼데스까. 실험을 멈췄다. 다시 실행하면 처음부터 시작한다.';}
  if(m.type==='error'){busy=false;status('실행 오류','error');$('#result').textContent=(m.line?m.line+'번 문장: ':'')+m.error;}
  if(state&&state.time===0&&lastDay!==0){if(series.length){archive.push(...series.map(x=>({run:runIndex,...x})));}runIndex++;series=[];chartPeak=0;sparks=[];ripples=[];contactTrails=[];}
  if(m.type==='done'||m.type==='halted'||m.type==='error'){allSeries=archive.concat(series.map(x=>({run:runIndex,...x})));}
  lastDay=state?.time??-1;
  if(m.contacts?.length&&!state?.night)contactTrails.push({at:now,pairs:m.contacts});
  if(contactTrails.length>6)contactTrails.splice(0,contactTrails.length-6);
  if(m.events?.length&&layout){for(const ev of m.events.slice(0,120))sparks.push({...ev,at:now});}
  if(sparks.length>400)sparks.splice(0,sparks.length-400);
  const c=state?.counts||{S:469,E:0,I:0,R:0,V:0,VI:0,Q:0};
  $('#m-s').innerHTML=c.S+' <small>명</small>';$('#m-e').innerHTML=c.E+' <small>명</small>';$('#m-i').innerHTML=c.I+' <small>명</small>';$('#m-r').innerHTML=c.R+' <small>명</small>';
  $('#m-v').innerHTML=c.V+' <small>명</small>';$('#m-v-note').textContent=c.V?`접종 · 면역 ${c.VI}명`:'접종';$('#m-q').innerHTML=c.Q+' <small>명</small>';
  $('#clock').textContent=(state?`${state.day}일째 ${state.clock}`:'0일째 07:00');$('#clock-note').textContent=state?.index?(state.night?`${DAYNAMES[state.recordDay]}요일 기록 · 밤, 접촉 기록 없음`:`${DAYNAMES[state.recordDay]}요일 기록 위를 지나는 중`):'모의 시간 · 밤은 건너뜀';$('.arena-wrap').classList.toggle('night',!!state?.night);$('#mode').textContent=describe(state);$('#cum-count').textContent='누적 감염 '+(state?.cum||0)+'명';
  $('#step-count').textContent=(m.steps||0).toLocaleString()+'문장';
  if(m.logs?.length)renderLog(m.logs);$('#csv').disabled=!allSeries.length||busy;controls();if(!busy){draw();drawChart();}
}
async function init(){
  try{
    const cfg=window.VILLAGE_CONFIG;
    if(window.EMBEDDED_VILLAGE){data=window.EMBEDDED_VILLAGE;workerURL=URL.createObjectURL(new Blob([window.EMBEDDED_WORKER],{type:'text/javascript'}));}
    else{
      const response=await fetch(cfg.data);if(!response.ok)throw Error('마을 데이터를 읽지 못했다.');data=await response.json();
      const codeResponse=await fetch(cfg.worker);if(!codeResponse.ok)throw Error('계산 실행기를 읽지 못했다.');
      workerURL=URL.createObjectURL(new Blob([await codeResponse.text()],{type:'text/javascript'}));
    }
    prepareScene(data);
    worker=new Worker(workerURL);worker.onmessage=e=>receive(e.data);worker.onerror=e=>{busy=false;status('실행 환경 오류','error');$('#result').textContent=e.message||'이 브라우저에서 계산 스레드를 열지 못했다.';controls();};
    worker.postMessage({type:'init',data});
    $('#data-download').href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
    draw();
  }catch(e){status('불러오기 오류','error');$('#result').textContent=e.message;}
}
/* 배치·길·풀밭: 그림을 위한 준비. 전파 계산과는 무관하다. */
function prepareScene(d){
  layout=d.layout;
  const bin=atob(d.packed),count=new Map();
  for(let i=0;i<bin.length;i+=3){const v=(bin.charCodeAt(i)<<16)|(bin.charCodeAt(i+1)<<8)|bin.charCodeAt(i+2),dist=v&63;if(dist<=4){const k=(v>>15&511)*512+(v>>6&511);count.set(k,(count.get(k)||0)+1);}}
  paths=[];for(const [k,n] of count)if(n>=6)paths.push([Math.floor(k/512),k%512,Math.min(1,n/60)]);
  // 풀밭: k-평균으로 모인 자리에 부드러운 원을 깐다
  const N=d.N,pts=[];for(let i=0;i<N;i++)pts.push([layout[i*2],layout[i*2+1]]);
  let centers=[];for(let k=0;k<9;k++)centers.push(pts[Math.floor(k*N/9)].slice());
  for(let it=0;it<12;it++){const sum=centers.map(()=>[0,0,0]);for(const p of pts){let b=0,bd=1e9;centers.forEach((c,i)=>{const dd=(c[0]-p[0])**2+(c[1]-p[1])**2;if(dd<bd){bd=dd;b=i;}});sum[b][0]+=p[0];sum[b][1]+=p[1];sum[b][2]++;}centers=centers.map((c,i)=>sum[i][2]?[sum[i][0]/sum[i][2],sum[i][1]/sum[i][2],sum[i][2]]:c);}
  meadows=centers.filter(c=>c[2]>12).map((c,i)=>({x:c[0],y:c[1],r:60+Math.sqrt(c[2])*9,tone:i%4}));bg=null;
}
function run(){
  if(!ready||busy)return;lastSource=$('#code').value;allSeries=[];archive=[];runIndex=0;series=[];chartPeak=0;sparks=[];ripples=[];contactTrails=[];drawChart();busy=true;$('#welcome').hidden=true;status('실험 중','running');$('#result').textContent='동현랭 명령을 실행하고 있다.';controls();
  worker.postMessage({type:'run',code:lastSource});
}
$('#run').onclick=run;$('#demo').onclick=run;$('#halt').onclick=()=>worker?.postMessage({type:'halt'});
$('#code').onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();run();}if(e.key==='Tab'&&!busy){e.preventDefault();const t=e.target,start=t.selectionStart;t.setRangeText('  ',start,t.selectionEnd,'end');codeChanged();}};
function download(name,text,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#save').onclick=()=>download('donghyunbil-experiment.dh',$('#code').value,'text/plain;charset=utf-8');
$('.file-label').tabIndex=0;$('.file-label').setAttribute('role','button');
$('.file-label').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#open').click();}};
$('#open').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;if(busy){$('#result').textContent='중단한 뒤 파일을 열 수 있다.';e.target.value='';return;}if(f.size>400000){$('#result').textContent='파일이 너무 크다. 400 KB 이하의 동현랭 코드를 열어라.';return;}const t=await f.text();if(t.length>100000){$('#result').textContent='코드는 100,000자까지다.';return;}$('#code').value=t;codeChanged();$('#result').textContent='코드를 불러왔다. 실행하면 새 실험으로 시작한다.';e.target.value='';};
$('#csv').onclick=()=>{
  if(!allSeries.length)return;const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  const meta=[['# model','동현빌 0.1 / 469 people / real 5-minute proximity log repeated over 3 recorded days / stochastic SEIR, hourly samples'],['# data','Kissler et al., BBC Pandemic Haslemere dataset; https://github.com/skissler/haslemere'],['# limitation','Nights and homes are not recorded; three days are repeated; not a forecast for any real place'],['# code',lastSource]],keys=Object.keys(allSeries[0]);
  download('donghyunbil-observations.csv','\ufeff'+meta.map(r=>r.map(esc).join(',')).join('\n')+'\n'+keys.join(',')+'\n'+allSeries.map(s=>keys.map(k=>esc(s[k])).join(',')).join('\n'),'text/csv;charset=utf-8');
};
function setup(c,context,h){
  const w=c.getBoundingClientRect().width;if(w<1)return false;const d=Math.min(devicePixelRatio||1,2);if(c.width!==Math.round(w*d)||c.height!==Math.round(h*d)){c.width=Math.round(w*d);c.height=Math.round(h*d);bg=null;}
  c.style.height=h+'px';context.setTransform(c.width/W,0,0,c.height/H,0,0);return true;
}
const mix=(a,b,t)=>a+(b-a)*t,clamp=(t,a=0,b=1)=>Math.max(a,Math.min(b,t)),smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
function px(i){return [layout[(i-1)*2],layout[(i-1)*2+1]];}
function buildBackground(){
  const p=theme(),key=document.documentElement.dataset.theme+':'+canvas.width;if(bg&&bgKey===key)return bg;
  const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;const g=c.getContext('2d');g.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
  g.fillStyle=p.paper;g.fillRect(0,0,W,H);
  for(const m of meadows){const grad=g.createRadialGradient(m.x,m.y,m.r*.2,m.x,m.y,m.r);grad.addColorStop(0,p.meadow[m.tone]);grad.addColorStop(1,p.paper+'00');g.fillStyle=grad;g.beginPath();g.arc(m.x,m.y,m.r,0,Math.PI*2);g.fill();}
  g.lineCap='round';
  for(const [a,b,wgt] of paths){const [x1,y1]=px(a),[x2,y2]=px(b);g.strokeStyle=p.path;g.globalAlpha=.18+.4*wgt;g.lineWidth=.8+1.6*wgt;g.setLineDash([3,5]);g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();}
  g.setLineDash([]);g.globalAlpha=1;bg=c;bgKey=key;return c;
}
function skyColors(frac,night){
  if(night)return ['#141a33','#2b2f57'];
  if(frac<.12)return ['#f3c6a5','#cfd9ec'];if(frac<.45)return ['#bfe0f5','#e8f1f7'];if(frac<.75)return ['#cde6f6','#f3efd9'];if(frac<.9)return ['#f6c089','#e7cde2'];return ['#5c5a8e','#c88a86'];
}
function drawSky(s,now){
  const p=theme(),night=!!s?.night,frac=s?clamp((s.time%288)/192):0,[c1,c2]=skyColors(frac,night);
  const grad=ctx.createLinearGradient(0,0,0,SKY);grad.addColorStop(0,c1);grad.addColorStop(1,c2);ctx.fillStyle=grad;ctx.fillRect(0,0,W,SKY);
  if(night){ctx.fillStyle='#fff';for(let i=0;i<26;i++){const x=(i*173+37)%W,y=(i*59+11)%(SKY-14)+4,tw=.6+.5*Math.sin(now/400+i);ctx.globalAlpha=.6*tw;ctx.fillRect(x,y,1.5,1.5);}ctx.globalAlpha=1;
    ctx.fillStyle='#f6ecc7';ctx.beginPath();ctx.arc(W/2+40,28,11,0,Math.PI*2);ctx.fill();ctx.fillStyle=c1;ctx.beginPath();ctx.arc(W/2+47,24,10,0,Math.PI*2);ctx.fill();}
  else{const x=300+frac*(W-600),y=SKY-4-Math.sin(frac*Math.PI)*34;const g=ctx.createRadialGradient(x,y,2,x,y,16);g.addColorStop(0,'#fff3b0');g.addColorStop(.5,'#f7c948');g.addColorStop(1,'#f7c94800');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,16,0,Math.PI*2);ctx.fill();}
  // 지평선
  ctx.fillStyle=p.paper;ctx.beginPath();ctx.moveTo(0,SKY);for(let x=0;x<=W;x+=40)ctx.lineTo(x,SKY+4*Math.sin(x/90+1.2));ctx.lineTo(W,SKY+8);ctx.lineTo(0,SKY+8);ctx.fill();
}
function draw(){
  const w=canvas.getBoundingClientRect().width;if(!setup(canvas,ctx,w*H/W))return;
  const p=theme(),now=performance.now(),s=state;
  ctx.drawImage(buildBackground(),0,0,canvas.width,canvas.height,0,0,W,H);
  ctx.save();ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
  drawSky(s,now);
  if(!layout){ctx.restore();return;}
  // 접촉선
  for(const tr of contactTrails){const age=(now-tr.at)/650;if(age>1)continue;ctx.strokeStyle=p.contact;ctx.globalAlpha=.45*(1-age);ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<tr.pairs.length;i+=2){const [x1,y1]=px(tr.pairs[i]),[x2,y2]=px(tr.pairs[i+1]);ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);}ctx.stroke();}
  ctx.globalAlpha=1;
  // 마을 사람들
  const pulse=.5+.5*Math.sin(now/260);
  for(let i=1;i<=469;i++){
    const code=people?people[i-1]:0,st=code&3,vac=code>>2&1,imm=code>>3&1,iso=code>>4&1,idx=code>>5&1,[x,y]=px(i);
    if(st===I){const r=11+4*pulse,g=ctx.createRadialGradient(x,y,2,x,y,r);g.addColorStop(0,p.I+'99');g.addColorStop(1,p.I+'00');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
    if(iso){ctx.strokeStyle=p.Q;ctx.lineWidth=1.2;ctx.setLineDash([2,2]);ctx.beginPath();ctx.roundRect(x-9,y-9,18,18,3);ctx.stroke();ctx.setLineDash([]);}
    ctx.beginPath();ctx.arc(x,y,st===I?5.6:5,0,Math.PI*2);ctx.fillStyle=st===S?p.S:st===E?p.E:st===I?p.I:p.R;ctx.fill();
    ctx.lineWidth=1.1;ctx.strokeStyle=st===S?p.Sline:st===E?p.Eline:st===I?p.Iline:p.Rline;ctx.stroke();
    ctx.fillStyle='#ffffff';ctx.globalAlpha=st===S?.9:.55;ctx.beginPath();ctx.arc(x-1.6,y-1.8,1.4,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    if(vac){ctx.strokeStyle=p.V;ctx.lineWidth=imm?1.8:1.2;if(!imm)ctx.setLineDash([2,2.2]);ctx.beginPath();ctx.arc(x,y,7.4,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    if(idx){ctx.fillStyle=p.ink;ctx.font='700 10px "Pretendard"';ctx.textAlign='center';ctx.fillText('첫 환자',x,y-13);ctx.beginPath();ctx.moveTo(x,y-10);ctx.lineTo(x-3,y-13);ctx.lineTo(x+3,y-13);ctx.closePath();ctx.fill();}
  }
  // 전파 불꽃과 물결
  const remain=[];
  for(const sp of sparks){const t=(now-sp.at)/(reduced?1:700);if(t>=1){ripples.push({x:px(sp.to)[0],y:px(sp.to)[1],at:now});continue;}remain.push(sp);
    const [x1,y1]=px(sp.from),[x2,y2]=px(sp.to),u=smooth(t),x=mix(x1,x2,u),y=mix(y1,y2,u)-Math.sin(u*Math.PI)*14;
    ctx.strokeStyle=p.spark;ctx.globalAlpha=.5;ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(x1,y1);ctx.quadraticCurveTo((x1+x2)/2,(y1+y2)/2-28,x,y);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle=p.spark;ctx.beginPath();ctx.arc(x,y,3.2,0,Math.PI*2);ctx.fill();}
  sparks=remain;
  const keep=[];for(const rp of ripples){const t=(now-rp.at)/700;if(t>=1)continue;keep.push(rp);ctx.strokeStyle=p.spark;ctx.globalAlpha=(1-t)*.8;ctx.lineWidth=2-t;ctx.beginPath();ctx.arc(rp.x,rp.y,6+t*16,0,Math.PI*2);ctx.stroke();}
  ripples=keep;ctx.globalAlpha=1;
  ctx.restore();
}
function niceMax(v){const steps=[10,20,30,50,80,120,160,240,320,400,469];return steps.find(x=>x>=v)||469;}
function drawChart(){
  const src=allSeries.length?allSeries:series;
  for(const s of src)chartPeak=Math.max(chartPeak,s.E+s.I,s.R,s.VI);
  const ymax=niceMax(Math.max(10,chartPeak*1.1));chart.dataset.yMax=String(ymax);
  const w=chart.getBoundingClientRect().width;if(w<1)return;const h=w<500?300:360,d=Math.min(devicePixelRatio||1,2);chart.width=Math.round(w*d);chart.height=Math.round(h*d);chart.style.height=h+'px';cc.setTransform(d,0,0,d,0,0);
  const p=theme(),dark=document.documentElement.dataset.theme==='dark',left=46,right=w-16,top=20,bottom=h-34;cc.clearRect(0,0,w,h);cc.fillStyle=dark?'#201d18':'#fbf7ef';cc.fillRect(0,0,w,h);cc.font='11px "Nanum Gothic Coding"';cc.textAlign='right';
  for(let i=0;i<=4;i++){const y=ymax*i/4,yy=bottom-y/ymax*(bottom-top);cc.strokeStyle=dark?'#c4b18b22':'#dacfb666';cc.lineWidth=1;cc.beginPath();cc.moveTo(left,yy);cc.lineTo(right,yy);cc.stroke();cc.fillStyle=dark?'#bdb19c':'#6e6356';cc.fillText(Math.round(y)+'',left-8,yy+4);}
  const lastT=src.length?src[src.length-1].t:0,span=Math.max(3,Math.ceil(Math.max(lastT,(state?.pending||0)/288+lastT)));
  const xs=t=>left+(right-left)*t/span,ys=v=>bottom-v/ymax*(bottom-top);
  const tickEvery=span<=7?1:span<=30?5:span<=90?10:span<=180?30:60;
  cc.textAlign='center';for(let t=0;t<=span;t+=tickEvery)cc.fillText(t+'일',xs(t),h-8);
  cc.save();cc.beginPath();cc.rect(left,top-2,right-left,bottom-top+4);cc.clip();
  const area=(key,base,color)=>{if(!src.length)return;cc.fillStyle=color;cc.globalAlpha=.85;cc.beginPath();cc.moveTo(xs(src[0].t),ys(base(src[0])));for(const s of src)cc.lineTo(xs(s.t),ys(base(s)+s[key]));for(let i=src.length-1;i>=0;i--)cc.lineTo(xs(src[i].t),ys(base(src[i])));cc.closePath();cc.fill();cc.globalAlpha=1;};
  area('I',()=>0,p.I);area('E',s=>s.I,p.E);
  const line=(key,color,dash)=>{if(!src.length)return;cc.strokeStyle=color;cc.lineWidth=2;cc.setLineDash(dash||[]);cc.beginPath();src.forEach((s,i)=>{const x=xs(s.t),y=ys(s[key]);if(i)cc.lineTo(x,y);else cc.moveTo(x,y);});cc.stroke();cc.setLineDash([]);};
  line('R',p.Rline);line('VI',p.V,[5,4]);
  cc.restore();
  $('#chart-scale').textContent=`Y축 0–${ymax}명 · 자동 범위 · X축 ${span}일 · 한 시간 간격 표본`;
}
window.render_game_to_text=()=>JSON.stringify({app:'동현빌',version:'0.1',busy,state:state?{day:state.day,clock:state.clock,night:state.night,counts:state.counts,cum:state.cum,pathogen:state.pathogenName,index:state.index}:null,coordinates:'960×720, x right, y down; sky strip 44px at top; 469 villagers at fixed positions'});
let ticking=false;function animate(){if(ticking)return;ticking=true;const frame=()=>{draw();if(busy&&!reduced)requestAnimationFrame(frame);else{ticking=false;draw();drawChart();}};requestAnimationFrame(frame);}
let chartTimer=0;const chartLoop=()=>{if(busy)drawChart();if(busy)chartTimer=setTimeout(chartLoop,500);};
$('#run').addEventListener('click',()=>{animate();clearTimeout(chartTimer);chartLoop();});$('#demo').addEventListener('click',()=>{animate();clearTimeout(chartTimer);chartLoop();});
new ResizeObserver(()=>{draw();drawChart();}).observe($('.observation'));document.fonts.ready.then(()=>{draw();drawChart();});
draw();drawChart();init();
