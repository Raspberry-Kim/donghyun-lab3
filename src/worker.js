let slow=false;
/* 동현빌의 계산 스레드. 바뀌지 않은 동현랭 실행기가 출력한 정수 묶음만 마을에 전달한다. */
let D,village,world,vm,running=false,runId=0,steps=0,pending=0,token='',packet=[],queue=[],logs=[],wallStart=0,sentSeries=0,nightHold=0,eventsBuffer=[],lastContacts=[];
const arity={1:1,2:1,3:1,4:1,5:2,6:1,7:1,8:1,9:1,10:1,11:1,12:1,13:1,14:1,15:2,16:2,17:1,18:1,19:1,20:1,21:1,22:2,23:2,24:3,25:2,26:1,27:2,28:1,29:1};
const FRAME_MS=160/3,SPEED_STEPS={1:2,2:8,3:32},NIGHT_HOLD={1:10,2:6,3:1},MAX_DAYS=365;
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
const range=(x,a,b,name)=>assert(Number.isSafeInteger(x)&&x>=a&&x<=b,`${name}: ${a}~${b} 정수여야 한다.`);
const RULES={1:'무작위',2:'접촉이 많은 사람부터',3:'첫 환자 주변 고리',4:'접촉이 적은 사람부터'};
const ISO={0:'격리 없음',1:'증상자 격리(전염 시작 하루 뒤)',2:'증상자 격리 + 가까운 접촉자 14일 격리'};
function log(text){logs.push({day:village?village.time/DAY:0,text});if(logs.length>400)logs.shift();}
/* Seed: the first run uses the seed written in code. Running the same code again shifts every seed by one random offset,
   so a repeat run draws new luck while seeds that are equal inside one program stay equal. */
let seedOffset=0,seedsUsed=[];
function pickSeedOffset(){const u=new Uint32Array(1);if(typeof crypto!=='undefined'&&crypto.getRandomValues)crypto.getRandomValues(u);else u[0]=Math.floor(Math.random()*4294967296);return 1+u[0]%2147483646;}
function runSeed(s){return seedOffset?(s-1+seedOffset)%2147483647+1:s;}
let programRuns=[],boxMode=0;
function resetWorld(seed){
  if(village.ext&&village.time>0&&world)programRuns.push(runSummary());
  village.reset(seed);
  world={seed,speed:2,tags:[],pathogen:null,index:0,lastEvents:0,finished:false,ended:false,isolationMode:0,ve:null,vaccinations:0,totalDays:0};
  queue=[];pending=0;sentSeries=0;nightHold=0;eventsBuffer=[];lastContacts=[];
}
function write(str){
  for(const ch of String(str)){
    if(/\s/.test(ch)){if(token){const t=token;token='';accept(t);}}
    else{token+=ch;assert(token.length<=20,'정수 토큰이 너무 길다. 문자 대신 정수와 줄바꿈을 출력하라.');}
  }
}
function accept(t){
  assert(/^[+-]?\d+$/.test(t),'동현빌은 정수 명령만 읽는다: '+t);
  const n=Number(t);assert(Number.isSafeInteger(n),'정수가 안전 범위를 벗어났다.');
  if(!packet.length)assert(n in arity,'없는 실험 명령: '+n);
  packet.push(n);
  if(packet.length===arity[packet[0]]+1){const p=packet;packet=[];command(p[0],p.slice(1));}
}
const needPathogen=()=>assert(village.pathogen,'먼저 명령 2로 병원체를 골라라.');
const needPcv=()=>assert(village.pathogen?.id===5,'명령 12·13은 병원체 5(폐구균 보균)를 고른 뒤에 쓴다.');
const notStarted=what=>assert(village.time===0,`시간이 흐른 뒤에는 ${what}을 바꿀 수 없다. 명령 1로 초기화하라.`);
function command(op,a){
  switch(op){
    case 1:{range(a[0],1,2147483647,'시드');const s=runSeed(a[0]);resetWorld(s);seedsUsed.push(s);log('마을 초기화 · 시드 '+s+(seedOffset?` (다시 실행 · 코드의 시드 ${a[0]} 대신)`:''));break;}
    case 2:{range(a[0],1,7,'병원체 번호');notStarted('병원체');village.setPathogen(a[0]);const p=village.pathogen;world.pathogen=p.id;
      log(`병원체 ${p.id} ${p.name} · 잠복 ${fmtDays(p.latentSteps)} · 전염 ${fmtDays(p.infectiousSteps)} · 기본 백신 효과 ${p.ve}%`);break;}
    case 3:{range(a[0],0,469,'첫 환자 번호');needPathogen();notStarted('첫 환자');const i=village.setIndex(a[0]);world.index=i;if(village.pathogen.id>=6||village.ext){village.everInf[i]=1;if(village.mix)village.strain[i]=village.pickStrain();}log(`첫 환자 ${i}번 (${a[0]===0?'무작위':'지정'}) · 사흘간 4 m 이내 접촉 상대 ${village.degree[i-1]}명`);break;}
    case 4:{range(a[0],1,469,'접종할 사람 번호');needPathogen();const n=village.vaccinate(a[0]);world.vaccinations+=n;log(n?`${a[0]}번 접종 · 효과 ${village.effectiveVE()}%`:`${a[0]}번은 접종 대상이 아니다(이미 접종했거나 감염 상태)`);break;}
    case 5:{range(a[0],0,469,'접종 인원');range(a[1],1,4,'접종 규칙');needPathogen();const n=village.vaccinateRule(a[0],a[1]);world.vaccinations+=n;log(`${RULES[a[1]]} ${n}명 접종 · 효과 ${village.effectiveVE()}%`+(n<a[0]?` · 대상 부족으로 ${a[0]-n}명은 접종하지 못함`:''));break;}
    case 6:range(a[0],0,100,'백신 효과');village.ve=a[0];world.ve=a[0];log(`백신 효과 ${a[0]}% (이후 접종에 적용)`);break;
    case 7:{range(a[0],1,MAX_DAYS,'진행 일수');needPathogen();assert(village.index||village.imp.every>0||village.imp.start>=0,'명령 3으로 첫 환자를 정한 뒤 시간을 진행하라.');
      assert(world.totalDays+a[0]<=MAX_DAYS,`한 실행의 모의 기간은 ${MAX_DAYS}일까지다.`);world.totalDays+=a[0];pending+=a[0]*DAY;log(`${a[0]}일 진행 시작`);break;}
    case 8:{range(a[0],1,16,'관측 항목');const v=village.observe(a[0]);assert(queue.length<256,'관측 입력 큐가 가득 찼다.');queue.push(v);log(`관측 ${a[0]} ${OBS[a[0]]} → ${v}`);break;}
    case 9:{range(a[0],0,2,'격리 정책');village.isolationMode=a[0];world.isolationMode=a[0];
      if(a[0]===2)for(let i=1;i<=village.N;i++)if(village.state[i]===2&&!village.contactsWhileInfectious.has(i))village.contactsWhileInfectious.set(i,new Set());
      if(village.pathogen?.id>=6&&a[0])label(a[0]===1?'증상자 격리':'증상자·접촉자 격리');log('격리 정책 '+a[0]+' · '+ISO[a[0]]);break;}
    case 10:world.tags.push({day:village.time/DAY,value:a[0]});log('동현랭 기록: '+a[0]);break;
    case 11:range(a[0],1,3,'재생 속도');world.speed=a[0];log('재생 속도 '+['','느리게','보통','빠르게'][a[0]]);break;
    case 12:{range(a[0],0,469,'65세 이상 표시 인원');needPcv();notStarted('65세 이상 표시');const n=village.tagOlder(a[0]);
      log(`가상 65세 이상 표시 ${n}명 (무작위 · 실제 나이가 아니다)`+(n<a[0]?` · 대상 부족으로 ${a[0]-n}명은 표시하지 못함`:''));break;}
    case 13:{range(a[0],0,469,'성인 PCV 접종 인원');needPcv();notStarted('성인 PCV 접종');assert(village.pcvStats.tagged>0,'먼저 명령 12로 65세 이상 표시를 붙여라.');const n=village.pcvVaccinate(a[0]);
      log(`65세 이상 표시자 ${n}명 성인 PCV 접종 · 같은 사람을 PCV20과 PCV21로 각각 센다 · 보균은 막지 않는다`+(n<a[0]?` · 대상 부족으로 ${a[0]-n}명은 접종하지 못함`:''));break;}
    default:extCommand(op,a);
  }
}
/* 확장 명령 14~28 (예제 17부터). 병원체 6·7과 새 명령에서만 마을의 확장 층(village.ext)을 켠다. */
const BOX_NAMES={1:'누적 감염·재감염',2:'접종하지 않은 사람의 보균율',3:'혈청형별 보균',4:'기대 IPD',5:'아이·마을 보균율',6:'아기 배정 군',7:'세 제품을 같은 아기에',8:'관찰한 입원 비',9:'점유율 코호트'};
const PRODUCT_NAMES={0:'보호 없음',1:'아브리스보(산모 접종)',2:'베이포투스(항체주사)',3:'엔플론시아(항체주사)'};
const needBabyPathogen=()=>assert(village.pathogen&&(village.pathogen.id===6||village.pathogen.id===7),'아기·아이 층은 병원체 6(폐구균 풍토 보균)이나 7(RSV)에서 쓴다.');
const needRsv=n=>assert(village.pathogen?.id===7,`명령 ${n}은 병원체 7(RSV)을 고른 뒤에 쓴다.`);
const needPn=n=>assert(village.pathogen?.id===6,`명령 ${n}은 병원체 6(폐구균 풍토 보균)을 고른 뒤에 쓴다.`);
const label=t=>{world.label=world.label||[];world.label.push(t);};
function extCommand(op,a){
  switch(op){
    case 14:{range(a[0],0,3650,'면역 지속 일수');needPathogen();assert(!village.pathogen.sis,'병원체 6은 보균이 끝나면 곧바로 다시 보균될 수 있어 명령 14가 필요 없다.');village.setWane(a[0]);label(a[0]?`면역 ${a[0]}일`:'면역 유지');
      log(a[0]?`면역 지속 ${a[0]}일 · 회복 ${a[0]}일 뒤 다시 감수성자`:'면역 유지 · 회복자는 이 실행 안에서 다시 감염되지 않는다');break;}
    case 15:{range(a[0],0,365,'유입 간격');range(a[1],0,469,'유입 인원');needPathogen();village.setImport(a[0],a[1]);if(a[0])label(`유입 ${a[0]}일마다 ${a[1]}명`);
      log(a[0]?`마을 밖 유입 · ${a[0]}일마다 ${a[1]}명이 바깥에서 감염되어 들어온다 (계절 시작 ${village.imp.start}일)`:'마을 밖 유입 멈춤');break;}
    case 16:{range(a[0],0,469,'아기 인원');assert([1,2,4].includes(a[1]),'보호자 규칙: 1 무작위, 2 접촉이 많은 사람부터, 4 접촉이 적은 사람부터');needBabyPathogen();
      const n=village.addBabies(a[0],a[1]),nx=village.next,rsv=village.pathogen.id===7;
      log(`가상 ${rsv?'아기':'아이'} ${n}명을 보호자(${RULES[a[1]]})에게 붙임 · 출생 ${nx.birth}일`+(rsv?` · ${PRODUCT_NAMES[nx.prod]}`+(nx.prod===1?` · 산모 접종→분만 ${nx.interval}일`:''):'')+(n<a[0]?` · 보호자 부족으로 ${a[0]-n}명은 붙이지 못함`:''));break;}
    case 17:range(a[0],-365,365,'출생일');needRsv(17);village.next.birth=a[0];log(`다음 아기의 출생일 ${a[0]}일`+(a[0]<0?' (시작 전에 태어나 이미 '+(-a[0])+'일 된 아기)':''));break;
    case 18:range(a[0],0,3,'보호 전략');needRsv(18);village.next.prod=a[0];log('다음 아기의 보호 전략: '+PRODUCT_NAMES[a[0]]);break;
    case 19:range(a[0],0,100,'감염을 막는 몫');needRsv(19);village.next.f=a[0];log(`다음 보호 아기: 효과 가운데 ${a[0]}%는 감염 자체를 막고, 나머지는 감염 뒤 결과를 줄인다고 둔다`);break;
    case 20:range(a[0],0,120,'산모 접종→분만 간격');needRsv(20);village.next.interval=a[0];log(`다음 아기의 산모 접종→분만 간격 ${a[0]}일`+(a[0]<14?' · 14일 미만이라 효과를 32/82배로 줄인다':''));break;
    case 21:range(a[0],0,2,'항체주사 투여 규칙');needRsv(21);if(a[0]===2){village.abAdd=true;label('아브리스보 아기 지침 추가 투여');log('이 마을의 아브리스보 아기: 접종→분만 14일 미만이거나 계절 전(4~9월)에 태어나면 출생일과 계절 시작일 가운데 늦은 날 베이포투스를 추가로 맞는다 (한국·미국 지침)');break;}village.next.mabRule=a[0];log('다음 아기의 항체주사 투여: '+(a[0]?'출생 때':'계절 안 출생은 출생 때, 계절 전 출생은 계절 시작 때'));break;
    case 22:range(a[0],0,99,'보호자→아기 전파 확률');range(a[1],0,99,'아기→보호자 전파 확률');needBabyPathogen();assert(village.babies.length,'먼저 명령 16으로 아기·아이를 붙여라.');
      village.babyQ.qin=a[0];village.babyQ.qout=a[1];label(`가구 전파 ${a[0]}/${a[1]}%`);log(`가구 전파 · 보호자 한 번의 전염 기간에 아기에게 ${a[0]}%, 아기 한 번의 전염 기간에 보호자에게 ${a[1]}%`);break;
    case 23:range(a[0],0,100,'백신형 비율');range(a[1],0,100-a[0],'X형 비율');needPn(23);village.setMix(a[0],a[1]);log(`혈청형 섞기 · 백신형 ${a[0]}% · X형 ${a[1]}% · 비백신형 ${100-a[0]-a[1]}% (새 획득·유입에 적용)`);break;
    case 24:{range(a[0],0,469,'접종 인원');range(a[1],0,100,'보균 차단 효과');range(a[2],1,2,'대상');needPn(24);assert(village.mix,'먼저 명령 23으로 혈청형 섞기를 정하라.');
      if(a[2]===2)assert(village.babies.length,'먼저 명령 16으로 가상 아이를 붙여라.');const n=village.pnVaccinate(a[0],a[1],1,a[2]);label(`PCV ${a[2]===2?'아이 ':''}${n}명 ${a[1]}%`);
      log(`PCV 접종 ${a[2]===2?'가상 아이':'마을 사람'} ${n}명 · 백신형 보균 획득 위험 ${a[1]}% 감소`);break;}
    case 25:{range(a[0],0,469,'접종 인원');range(a[1],0,100,'IPD 감소 효과');needPn(25);assert(village.mix,'먼저 명령 23으로 혈청형 섞기를 정하라.');const n=village.pnVaccinate(a[0],a[1],2,1);label(`PPSV ${n}명 ${a[1]}%`);
      log(`PPSV 접종 ${n}명 · 보균은 그대로, 백신형 보균의 IPD 위험 ${a[1]}% 감소`);break;}
    case 26:range(a[0],0,1,'X형 포함');needPn(26);assert(village.mix,'먼저 명령 23으로 혈청형 섞기를 정하라.');village.coverX=a[0];village.enableExt();log(a[0]?'백신에 X형 포함':'백신에서 X형을 뺌 · 이제 X형 획득은 막지 못한다');break;
    case 27:{assert(a[0]===3||a[0]===7,'함께 돌릴 바이러스: 3 인플루엔자, 7 RSV');range(a[1],1,10,'바이러스 배수');needPn(27);assert(!village.virus,'바이러스는 한 실행에 하나만 함께 돌린다.');
      const i=village.startVirus(a[0],a[1]);label(`${village.virus.p.name} 배수 ${a[1]}`);log(`${village.virus.p.name} 함께 돌림 · 오늘부터 3일마다 1명이 바깥에서 감염되어 들어온다 · 바이러스 전염 중엔 폐구균 획득·전파·IPD 위험 ${a[1]}배 (가정값)`);break;}
    case 28:range(a[0],0,100,'항체의 전파 감소');needRsv(28);village.next.shed=a[0];log(`다음 보호 아기: 보호 기간 안에 감염되면 보호자에게 옮길 위험 ${a[0]}% 감소 (가정값)`);break;
    case 29:range(a[0],0,9,'결과 상자');boxMode=a[0];log(a[0]?`결과 상자 ${a[0]} · ${BOX_NAMES[a[0]]} · 결과와 무관`:'결과 상자를 내린다');break;
  }
}
function runSummary(){
  const v=village,row={label:[v.pathogen?.name||'',...(world.label||[])].join(' · '),pathogen:v.pathogen?.id||0,days:v.time/DAY,cum:v.cum,reinf:v.reinf,imports:v.imp.count};
  if(v.pathogen?.sis)row.pn=v.pnSummary();
  if(v.babies.length&&v.pathogen?.id===7)row.rsv=v.rsvSummary();
  return row;
}
function extState(){
  const v=village;if(!v.ext&&!(v.pathogen?.id>=6))return null;
  const out={runs:programRuns.concat(v.time>0?[{...runSummary(),live:running}]:[]),reinf:v.reinf,imports:v.imp.count,wane:v.wane/DAY};
  if(v.pathogen?.sis)out.pn=v.pnSummary();
  if(v.babies.length&&v.pathogen?.id===7)out.rsv=v.rsvSummary();
  out.box=boxMode;
  return out;
}
function extArrays(){
  const v=village;if(!v.ext)return {};const o={};
  if(v.mix)o.strains=v.strain.slice(1);
  if(v.babies.length){const day=v.time/DAY,b=new Int16Array(v.babies.length*3);v.babies.forEach((x,k)=>{b[k*3]=x.cg;b[k*3+1]=day<x.birth?-1:x.st;b[k*3+2]=x.prod;});o.babies=b;}
  if(v.virus)o.virus=v.virus.state.slice(1);
  if(v.leakyEff||v.outEff)o.pnVac=v.pnVac.slice(1);
  return o;
}
const OBS={1:'경과 일수',2:'감수성자',3:'잠복기',4:'전염 중',5:'회복',6:'접종자',7:'누적 감염',8:'격리 중',9:'최근 하루 새 감염',10:'첫 환자의 2차 감염',11:'재감염 누적',12:'지금 감염·보균 중인 아기·아이',13:'아기·아이 누적 감염',14:'백신형 보균 중',15:'비백신형 보균 중',16:'X형 보균 중'};
function fmtDays(stepsN){return stepsN%DAY===0?stepsN/DAY+'일':stepsN<DAY?stepsN*5+'분':(stepsN/DAY).toFixed(1)+'일';}
function tick(){
  if(village.isNight()){
    if(nightHold>0){nightHold--;return;}
    const n=village.skipNight();pending-=n;afterDay();return;
  }
  let k=SPEED_STEPS[world.speed];
  while(k-->0&&pending>0&&!village.isNight()){
    const r=village.step();pending--;
    if(r.events.length)eventsBuffer.push(...r.events);
    lastContacts=r.contacts;
    if(r.isolated)log(`${r.isolated}명 격리 시작`+(r.quarantined?` · 접촉자 ${r.quarantined}명 격리`:''));
  }
  if(village.isNight())nightHold=NIGHT_HOLD[world.speed];
}
function afterDay(){
  const d=village.dayIndex(),c=village.counts(),k=village.newDays[village.newDays.length-1]||0;
  if(k>0||d%7===0)log(`${d}일째 아침 · 어제 새 감염 ${k} · 누적 ${village.cum} · 전염 중 ${c.I}`);
  if(!world.ended&&c.E+c.I===0&&village.time>0&&!(village.imp.every>0)){world.ended=true;log(`유행 종료 · 누적 감염 ${village.cum}명 (${(village.cum/village.N*100).toFixed(1)}%) · 감수성자 ${c.S}명 남음`);}
}
function snapshot(type='frame',extra={}){
  const N=village.N,people=new Uint8Array(N);
  for(let i=1;i<=N;i++)people[i-1]=village.state[i]|(village.vaccinated[i]<<2)|(village.immune[i]<<3)|(village.isolated[i]<<4)|((village.index===i)<<5)|(village.tag[i]<<6)|(village.pcv[i]<<7);
  const c=village.counts();
  const state={...world,time:village.time,day:village.dayIndex(),clock:village.clock(),night:village.isNight(),recordDay:village.recordDay(),counts:c,cum:village.cum,newToday:village.newToday,
    pathogenName:village.pathogen?.name||'',pcv:village.pcvStats.tagged?village.pcvSummary():null,ext:extState(),index:village.index,secondaryOfIndex:village.index?village.secondary[village.index]:0,pending,running};
  const series=village.series.slice(sentSeries);sentSeries=village.series.length;
  postMessage({type,state,people,contacts:lastContacts,events:eventsBuffer,series,logs:logs.slice(-40),steps,line:vm?.currentLine||1,phys:vm&&!vm.done?(vm.stmts?.[vm.pc]?.phys||0):0,slow,seeds:seedsUsed.length?seedsUsed:[world.seed],...extArrays(),...extra});
  eventsBuffer=[];
}
function fail(e){running=false;log('오류: '+e.message);snapshot('error',{error:e.message,line:e.line||vm?.currentLine,allSeries:village.series});}
function loop(id){
  if(!running||id!==runId)return;const t=performance.now(),wasPending=pending>0;
  try{
    if(pending>0)tick();
    else{
      let budget=0;
      while(running&&pending<=0&&!vm.done&&budget++<(slow?1:400)){vm.step(1);steps++;assert(steps<=300000,'30만 문장 한도에 도달했다. 반복 조건을 확인하라.');}
      if(vm.done){
        if(vm.halted){running=false;packet=[];token='';pending=0;log('오겡끼데스까 · 종료');}
        else{if(token){const t=token;token='';accept(t);}assert(!packet.length,'명령 인수가 부족하다. 조작 규약을 확인하라.');if(pending<=0){running=false;log('프로그램 완료 · 동현이구나');}}
      }
    }
    snapshot(running?'frame':'done',running?{}:{allSeries:village.series,wallMs:performance.now()-wallStart});
    if(running)setTimeout(()=>loop(id),Math.max(0,(slow&&!wasPending?260:FRAME_MS)-(performance.now()-t)));
  }catch(e){fail(e);}
}
onmessage=({data:m})=>{
  try{
    if(m.type==='speed'){slow=!!m.slow;return;}
    if(m.type==='init'){D=m.data;village=new Village(D);resetWorld(1);snapshot('ready');return;}
    if(m.type==='halt'){
      const h=new Donghyun.VM('나는 동현이냐?\n오겡끼데스까\n동현이구나');h.run();
      if(h.halted){running=false;runId++;pending=0;packet=[];token='';log('오겡끼데스까 · 동현랭 중단 프로그램');snapshot('halted',{allSeries:village.series});}return;
    }
    if(m.type==='run'){
      assert(typeof m.code==='string'&&m.code.length<=100000,'코드는 100,000자까지다.');
      const candidate=new Donghyun.VM(m.code,{write,readInt:()=>{assert(queue.length>0,'명령 8로 관측을 요청한 뒤 꽥꽥으로 읽어라.');return queue.shift();}});
      runId++;seedOffset=m.repeat?pickSeedOffset():0;seedsUsed=[];village.reset(1);programRuns=[];boxMode=0;resetWorld(runSeed(1));logs=[];steps=0;packet=[];token='';pending=0;vm=candidate;slow=!!m.slow;running=true;wallStart=performance.now();log(seedOffset?'동현랭 프로그램 시작 · 같은 코드를 다시 실행해 새 시드를 쓴다':'동현랭 프로그램 시작');snapshot();loop(runId);
    }
  }catch(e){fail(e);}
};
