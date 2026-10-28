// Haslemere 접촉 기록(Kissler 등, skissler/haslemere)을 동현빌의 데이터 파일로 바꾼다.
// 하는 일: (1) 5분 단위 거리 기록을 압축해 담는다. (2) 20 m 이내 접촉망으로 마을 배치를 계산한다.
// (3) 병원체별 전파 진폭 a를 이 접촉망 위의 평균 기본감염재생산수 R0가 문헌값이 되도록 보정한다.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.join(__dirname,'..'),raw=path.join(root,'data/raw');
const s1=fs.readFileSync(path.join(raw,'Kissler_DataS1.csv'),'utf8'),s2=fs.readFileSync(path.join(raw,'Kissler_DataS2.csv'),'utf8');
const sha=t=>crypto.createHash('sha256').update(t).digest('hex');
const rows=s1.trim().split('\n').map(l=>l.split(',').map(Number));
const times=s2.trim().split('\n').map(l=>{const i=l.indexOf(',');return [Number(l.slice(0,i)),l.slice(i+1)];});
const N=469,T=576;
for(const [t,a,b,d] of rows){
  if(!(t>=1&&t<=T&&a>=1&&a<=N&&b>=1&&b<=N&&a<b&&d>=0&&d<=50))throw Error('예상 밖의 기록: '+[t,a,b,d]);
}
if(times.length!==T||times[0][1]!=='Thu 12 Oct 2017 07:00:00'||times[T-1][1]!=='Sat 14 Oct 2017 22:55:00')throw Error('시간표가 다르다');
// 1) 압축: 시간 단계별 (a,b,d) 3바이트. a,b는 1~469 (9비트), d는 0~50 (6비트).
const byT=Array.from({length:T},()=>[]);
for(const r of rows)byT[r[0]-1].push(r);
const offsets=[0];const bytes=[];
for(const list of byT){
  list.sort((x,y)=>x[1]-y[1]||x[2]-y[2]);
  for(const [,a,b,d] of list){const v=(a<<15)|(b<<6)|d;bytes.push(v>>16&255,v>>8&255,v&255);}
  offsets.push(bytes.length/3);
}
const packed=Buffer.from(bytes).toString('base64');
// 2) 접촉망 요약
const close=new Map(),near=new Map();
const key=(a,b)=>a*1000+b;
for(const [,a,b,d] of rows){
  if(d<=4)close.set(key(a,b),(close.get(key(a,b))||0)+1);
  if(d<=20)near.set(key(a,b),(near.get(key(a,b))||0)+Math.exp(-d/10));
}
const degree=Array(N+1).fill(0),nearDegree=Array(N+1).fill(0);
for(const k of close.keys()){degree[Math.floor(k/1000)]++;degree[k%1000]++;}
for(const k of near.keys()){nearDegree[Math.floor(k/1000)]++;nearDegree[k%1000]++;}
// 3) 배치: 20 m 접촉망의 힘 기반 배치 → 960×720 안에 담고 겹침을 푼다.
let seed=20171012;const rng=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
const pos=Array.from({length:N+1},(_,i)=>({x:(rng()-.5)*600,y:(rng()-.5)*450}));
const edges=[...near.entries()].map(([k,w])=>[Math.floor(k/1000),k%1000,Math.min(w,30)]);
const components=componentsOf(edges);
for(let iter=0;iter<700;iter++){
  const temp=Math.max(2,60*(1-iter/700));
  const fx=Array(N+1).fill(0),fy=Array(N+1).fill(0);
  for(let i=1;i<=N;i++)for(let j=i+1;j<=N;j++){
    let dx=pos[i].x-pos[j].x,dy=pos[i].y-pos[j].y,d2=dx*dx+dy*dy+.01,f=1800/d2;
    if(d2>90000)continue;
    fx[i]+=dx*f;fy[i]+=dy*f;fx[j]-=dx*f;fy[j]-=dy*f;
  }
  for(const [a,b,w] of edges){
    const dx=pos[b].x-pos[a].x,dy=pos[b].y-pos[a].y,d=Math.hypot(dx,dy)+.01,f=d*(.004+.0015*Math.log1p(w));
    fx[a]+=dx*f;fy[a]+=dy*f;fx[b]-=dx*f;fy[b]-=dy*f;
  }
  for(let i=1;i<=N;i++){
    fx[i]-=pos[i].x*.015;fy[i]-=pos[i].y*.02;// 가운데로 끌어당김
    const f=Math.hypot(fx[i],fy[i])||1,s=Math.min(f,temp)/f;pos[i].x+=fx[i]*s;pos[i].y+=fy[i]*s;
  }
}
// 화면에 맞추기: 힘 기반 배치는 가운데가 지나치게 빽빽하므로, 각도는 두고 중심 거리를 순위에 따라 고르게 편다(타원 안의 균일 밀도).
const W=960,H=720,SKY=60,CX=W/2,CY=SKY+(H-SKY)/2,RX=W/2-30,RY=(H-SKY)/2-26;
let mx=0,my=0;for(let i=1;i<=N;i++){mx+=pos[i].x/N;my+=pos[i].y/N;}
const order=[...Array(N).keys()].map(i=>i+1).sort((a,b)=>Math.hypot(pos[a].x-mx,pos[a].y-my)-Math.hypot(pos[b].x-mx,pos[b].y-my));
order.forEach((i,rank)=>{const ang=Math.atan2(pos[i].y-my,pos[i].x-mx),r=Math.sqrt((rank+.5)/N);pos[i].x=CX+Math.cos(ang)*r*RX;pos[i].y=CY+Math.sin(ang)*r*RY;});
// 고르게 편 뒤, 자주 만난 사이가 다시 가까워지도록 약한 끌림과 가까운 거리의 밀침만으로 다듬는다.
const bound=i=>{const ex=(pos[i].x-CX)/RX,ey=(pos[i].y-CY)/RY,e=Math.hypot(ex,ey);if(e>1){pos[i].x=CX+ex/e*RX;pos[i].y=CY+ey/e*RY;}};
const closeEdges=[...close.entries()].map(([k,n])=>[Math.floor(k/1000),k%1000,n]);
for(let iter=0;iter<260;iter++){
  const fx=Array(N+1).fill(0),fy=Array(N+1).fill(0),k=.012*(1-iter/300);
  for(const [a,b,n] of closeEdges){const dx=pos[b].x-pos[a].x,dy=pos[b].y-pos[a].y,d=Math.hypot(dx,dy)+.01;if(d<22)continue;const f=k*Math.min(1,n/12)*(d-22)/d;fx[a]+=dx*f;fy[a]+=dy*f;fx[b]-=dx*f;fy[b]-=dy*f;}
  for(let i=1;i<=N;i++)for(let j=i+1;j<=N;j++){const dx=pos[j].x-pos[i].x,dy=pos[j].y-pos[i].y,d2=dx*dx+dy*dy;if(d2>1600||d2<.01)continue;const d=Math.sqrt(d2),f=.9*(40-d)/40/d;fx[i]-=dx*f;fy[i]-=dy*f;fx[j]+=dx*f;fy[j]+=dy*f;}
  for(let i=1;i<=N;i++){const f=Math.hypot(fx[i],fy[i])||1,sc=Math.min(f,3)/f;pos[i].x+=fx[i]*sc;pos[i].y+=fy[i]*sc;bound(i);}
}
for(let pass=0;pass<150;pass++){// 최소 간격 17px, 타원 안에 머무르기
  for(let i=1;i<=N;i++)for(let j=i+1;j<=N;j++){
    let dx=pos[j].x-pos[i].x,dy=pos[j].y-pos[i].y,d=Math.hypot(dx,dy);
    if(d<17){if(d<.01){dx=rng()-.5;dy=rng()-.5;d=Math.hypot(dx,dy);}const push=(17-d)/2/d;pos[i].x-=dx*push;pos[i].y-=dy*push;pos[j].x+=dx*push;pos[j].y+=dy*push;}
  }
  for(let i=1;i<=N;i++)bound(i);
}
const layout=[];for(let i=1;i<=N;i++)layout.push(Math.round(pos[i].x*10)/10,Math.round(pos[i].y*10)/10);
// 4) 보정: 전 구간 50 m 기록에 커널 exp(-d/ρ)를 적용한 쌍별 3일 합 K_ij.
//    감염 기간 D일 동안 3일 기록을 반복한다고 보면 P_ij=1-exp(-a·K_ij·D/3)이고 R_j=Σ_i P_ij, R0=mean_j R_j.
const pathogens=[
  {id:1,name:'홍역',en:'measles',R0:15,latentDays:10,infectiousDays:8,rho:10,cutoff:50,ve:97,
   note:'R0 12~18의 가운데값. 노출 후 발진까지 14일, 발진 4일 전부터 4일 후까지 전염. 2회 접종 효과 약 97%.'},
  {id:2,name:'백일해',en:'pertussis',R0:5.5,latentDays:8,infectiousDays:21,rho:10,cutoff:50,ve:85,
   note:'유럽 5개국 혈청·접촉 자료 추정치 5.5. 잠복 7~10일, 치료 없으면 기침 시작 후 약 3주 전염. 접종 효과는 80~90% 가운데값.'},
  {id:3,name:'인플루엔자',en:'influenza',R0:1.3,latentDays:1,infectiousDays:5,rho:10,cutoff:50,ve:50,
   note:'계절 인플루엔자 R0 중앙값 1.28 부근. 잠복 약 2일이며 증상 하루 전부터 전염, 5~7일 전염. 접종 효과 40~60% 가운데값.'},
  {id:4,name:'BBC 팬데믹 모의 독감',en:'bbc-pandemic',R0:null,a:1,latentSteps:5,infectiousSteps:859,rho:10,cutoff:20,ve:50,
   note:'다큐멘터리 설정: a=1, ρ=10 m, 차단 20 m, 감염 25분(5단계) 뒤 전염, 감염 사흘 뒤(원 모의의 572 기록 단계) 회복. R0는 문헌값이 아니라 이 설정의 결과다.'},
  {id:5,name:'폐구균 보균',en:'pneumococcal-carriage',R0:2,latentDays:1,infectiousDays:49,rho:10,cutoff:50,ve:0,
   note:'보균 기간은 성인 종단연구 중앙값 7주(49일). R0 2는 문헌값이 아니라 1년 동안 성인 다수가 한 번쯤 보균하도록 둔 가정값이다(성인 획득률 16.5건/1,000인-주 참고). 보균이 끝나면 이 실행 안에서는 다시 보균하지 않는다. 기본 백신 효과 0%: 성인 PCV는 보균을 막지 않고 명령 13으로 질병 위험만 줄인다고 둔다.'},
  {id:6,name:'폐구균 풍토 보균',en:'pneumococcal-endemic',R0:0.7,latentDays:1,infectiousDays:49,rho:10,cutoff:50,ve:0,sis:true,
   note:'보균이 끝나면 곧바로 다시 보균될 수 있다(S→C→S). 보균 기간은 성인 종단연구 중앙값 7주(49일). 평균 R 0.7은 문헌값이 아니라, 마을 밖 유입(7일마다 1명)과 함께 돌렸을 때 성인 보균율이 5~10%(CDC Pink Book)에 머물도록 고른 가정값이다. 유입 없이는 대개 꺼진다.'},
  {id:7,name:'RSV',en:'rsv',R0:3,latentDays:4,infectiousDays:9,rho:10,cutoff:50,ve:0,
   note:'R0 약 3(1~5, eClinicalMedicine 2025 체계적 고찰). 노출 뒤 감염까지 평균 5.1일·흔한 잠복 4~6일에서 배출이 증상 1~2일 전부터 시작한다고 보아 잠복 4일. 15세 이상 배출 기간 9일(Munywoki 등 JID 2015). 면역 지속은 기본이 유지이며 명령 14로 줄인다.'}
];
const Kall=new Map();
for(const [,a,b,d] of rows){const k=key(a,b);Kall.set(k,(Kall.get(k)||0)+Math.exp(-d/10));}
const nbr=Array.from({length:N+1},()=>[]);
for(const [k,w] of Kall){const a=Math.floor(k/1000),b=k%1000;nbr[a].push([b,w]);nbr[b].push([a,w]);}
function meanR(a,D){let tot=0;for(let j=1;j<=N;j++)for(const [,w] of nbr[j])tot+=1-Math.exp(-a*w*D/3);return tot/N;}
for(const p of pathogens){
  if(p.R0===null){p.calibrated=null;continue;}
  let lo=1e-6,hi=1e3;
  for(let i=0;i<80;i++){const m=Math.sqrt(lo*hi);if(meanR(m,p.infectiousDays)<p.R0)lo=m;else hi=m;}
  p.a=Number(hi.toPrecision(5));p.calibrated={targetR0:p.R0,meanRAtA:Number(meanR(p.a,p.infectiousDays).toFixed(3)),maxReachable:Number(meanR(1e9,p.infectiousDays).toFixed(1))};
  p.latentSteps=p.latentDays*288;p.infectiousSteps=p.infectiousDays*288;// 하루 = 5분 × 288단계(밤 포함)
}
const stats={
  users:N,steps:T,stepMinutes:5,hoursPerDay:16,days:3,rows:rows.length,
  pairsWithin50m:Kall.size,pairsWithin20m:near.size,pairsWithin4m:close.size,
  meanDistinctContacts50m:Number(([...Array(N).keys()].reduce((s,i)=>s+nbr[i+1].length,0)/N).toFixed(1)),
  meanDistinctContacts20m:Number((nearDegree.slice(1).reduce((s,v)=>s+v,0)/N).toFixed(1)),
  meanDistinctContacts4m:Number((degree.slice(1).reduce((s,v)=>s+v,0)/N).toFixed(1)),
  isolated4m:degree.slice(1).filter(v=>v===0).length,isolated50m:nbr.slice(1).filter(v=>v.length===0).length,
  maxDegree4m:Math.max(...degree),topDegree4m:[...degree.keys()].filter(i=>i>0).sort((a,b)=>degree[b]-degree[a]).slice(0,10),
  components20m:components.length,largestComponent20m:Math.max(...components.map(c=>c.length)),
  firstTime:times[0][1],lastTime:times[T-1][1]
};
const out={
  source:{repository:'https://github.com/skissler/haslemere',commit:'dc49e83406bbd4788d0a5baeca6ceeba53241d7e',files:['Kissler_DataS1.csv','Kissler_DataS2.csv'],
    sha256:{'Kissler_DataS1.csv':sha(s1),'Kissler_DataS2.csv':sha(s2)},license:'README는 코드에 GPL-3을 명시하며 데이터 파일의 라이선스는 적혀 있지 않다. 논문은 이 저장소를 공개 데이터로 안내한다.'},
  encoding:'base64, 시간 단계별 (a<<15|b<<6|d) 3바이트, offsets[t]~offsets[t+1]',
  N,T,offsets,packed,times:times.map(t=>t[1]),layout,degree4m:degree.slice(1),
  pathogens,stats
};
fs.writeFileSync(path.join(root,'data/village.json'),JSON.stringify(out));
console.log(JSON.stringify({rows:rows.length,bytes:bytes.length,packedChars:packed.length,stats,pathogens:pathogens.map(p=>({name:p.name,a:p.a,cal:p.calibrated}))},null,1));
function componentsOf(edges){
  const parent=Array.from({length:N+1},(_,i)=>i),find=x=>parent[x]===x?x:(parent[x]=find(parent[x]));
  for(const [a,b] of edges)parent[find(a)]=find(b);
  const groups=new Map();for(let i=1;i<=N;i++){const r=find(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(i);}
  return [...groups.values()];
}
