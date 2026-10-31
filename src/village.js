/* 동현빌의 마을 모형. 실제 Haslemere 접촉 기록(469명 · 5분 간격 · 3일) 위에서 S-E-I-R 전파를 계산한다.
   하루는 288단계(5분×24시간)이며, 기록이 있는 07:00~22:55의 192단계에만 접촉이 있고 밤 96단계는 접촉이 없다.
   세 날의 기록은 날짜 순서대로 반복된다. 전파 위험은 거리 d(m)에 대해 λ = a·exp(-d/ρ), d ≤ 차단 거리이며,
   한 단계에서 감수성자가 감염될 확률은 1-exp(-Σλ)이다 (Kissler 등, BBC Pandemic Haslemere 모의의 커널). */
function random(seed){let x=seed>>>0;return()=>((x=(Math.imul(1664525,x)+1013904223)>>>0)/4294967296);}
const S=0,E=1,I=2,R=3;
const DAY=288,ACTIVE=192,NIGHT=96;
/* 병원체 5(폐구균 보균)의 성인 PCV 결과 층. 보균 획득 1건마다 혈청형 묶음을 하나 뽑고, PCV 접종자이면 그 묶음이 백신에 들어 있을 때
   그 보균이 침습질환(IPD)이 될 위험을 혈청형당 효과만큼 줄인다고 센다. 보균과 전파에는 영향이 없다(PPSV 접종).
   묶음 비율: 질병관리청 「폐렴구균 백신 효과평가」 최종결과보고서(2026) 그림 27(B), 65세 이상 IPD 2023–2025의 PCV20 51.0%·PCV21 57.1%.
   공통형 44.0%로 나눈 고유형 비율(PCV20만 7.0%, PCV21만 13.1%)은 가정이다. 혈청형당 효과 50.2%는 미국 PCV20 실사용 값
   (모든 혈청형 IPD 25.6%, Miles 등 Lancet Infect Dis 2026)을 PCV20 포괄률 51.0%로 나눈 보정값이며 두 백신에 같게 준다. */
const PCV_MODEL={groups:[0.440,0.070,0.131,0.359],in20:[1,1,0,0],in21:[1,0,1,0],ve:0.502,rwe:{est:25.6,lo:17.4,hi:33.0}};
class Village{
  constructor(data){
    this.D=data;this.N=data.N;this.T=data.T;this.offsets=data.offsets;
    const bin=typeof atob==='function'?atob(data.packed):Buffer.from(data.packed,'base64').toString('binary');
    const n=bin.length/3;this.pa=new Uint16Array(n);this.pb=new Uint16Array(n);this.pd=new Uint8Array(n);
    for(let i=0;i<n;i++){const v=(bin.charCodeAt(i*3)<<16)|(bin.charCodeAt(i*3+1)<<8)|bin.charCodeAt(i*3+2);this.pa[i]=v>>15&511;this.pb[i]=v>>6&511;this.pd[i]=v&63;}
    this.degree=data.degree4m;
    this.reset(1);
  }
  reset(seed){
    const N=this.N;this.seed=seed;this.rng=random(seed*2654435761+97);
    this.state=new Uint8Array(N+1);this.vaccinated=new Uint8Array(N+1);this.immune=new Uint8Array(N+1);
    this.isolated=new Uint8Array(N+1);this.isolatedUntil=new Int32Array(N+1);
    this.tE=new Int32Array(N+1).fill(-1);this.tI=new Int32Array(N+1).fill(-1);this.tR=new Int32Array(N+1).fill(-1);
    this.infector=new Int16Array(N+1).fill(0);this.secondary=new Uint16Array(N+1);this.generation=new Uint8Array(N+1);
    this.contactsWhileInfectious=new Map();
    this.time=0;this.day=0;this.pathogen=null;this.index=0;this.started=false;this.ve=null;this.isolationMode=0;
    this.cum=0;this.newToday=0;this.newDays=[];this.hazard=new Float64Array(N+1);this.cands=[];this.series=[];
    this.totalDays=0;
    this.rng2=random(seed*40503+12345);this.tag=new Uint8Array(N+1);this.pcv=new Uint8Array(N+1);
    this.pcvStats={tagged:0,vaccinated:0,acqTagged:0,acq:0,c20:0,c21:0};
    this.resetExt(seed);
  }
  shuffled(pool){const o=pool.slice();for(let k=o.length-1;k>0;k--){const j=Math.floor(this.rng2()*(k+1));[o[k],o[j]]=[o[j],o[k]];}return o;}
  tagOlder(n){// 가상 65세 이상 표시. 실제 나이 자료가 아니다. 전파 난수와 따로 쓰는 난수(rng2)로 고른다.
    const pool=[];for(let i=1;i<=this.N;i++)if(!this.tag[i])pool.push(i);let done=0;
    for(const i of this.shuffled(pool)){if(done>=n)break;this.tag[i]=1;done++;}this.pcvStats.tagged+=done;return done;
  }
  pcvVaccinate(n){// 65세 이상 표시자 가운데 아직 접종하지 않은 감수성자에게 성인 PCV. 보균은 막지 않는다.
    const pool=[];for(let i=1;i<=this.N;i++)if(this.tag[i]&&!this.pcv[i]&&this.state[i]===S)pool.push(i);let done=0;
    for(const i of this.shuffled(pool)){if(done>=n)break;this.pcv[i]=1;done++;}this.pcvStats.vaccinated+=done;return done;
  }
  pcvAcquire(s){// 보균 획득 1건의 혈청형 묶음을 뽑아 결과 층에 더한다.
    let u=this.rng2(),g=0;const G=PCV_MODEL.groups;while(g<G.length-1&&u>=G[g]){u-=G[g];g++;}
    if(!this.tag[s])return;const st=this.pcvStats;st.acqTagged++;
    if(this.pcv[s]){st.acq++;st.c20+=PCV_MODEL.in20[g];st.c21+=PCV_MODEL.in21[g];}
  }
  pcvSummary(){const st=this.pcvStats,ve=PCV_MODEL.ve*100;
    return {...st,red20:st.acq?ve*st.c20/st.acq:null,red21:st.acq?ve*st.c21/st.acq:null,ve,rwe:PCV_MODEL.rwe};
  }
  setPathogen(id){const p=this.D.pathogens.find(p=>p.id===id);if(!p)throw Error('없는 병원체 번호');this.pathogen=p;}
  effectiveVE(){return this.ve===null?this.pathogen.ve:this.ve;}
  setIndex(id){
    if(this.index){const i=this.index;this.state[i]=S;this.tE[i]=-1;this.tI[i]=-1;this.cum=0;}
    let i=id;
    if(id===0){const pool=[];for(let k=1;k<=this.N;k++)if(this.state[k]===S&&!this.immune[k])pool.push(k);if(!pool.length)throw Error('첫 환자가 될 수 있는 사람이 없다.');i=pool[Math.floor(this.rng()*pool.length)];}
    if(this.immune[i])throw Error(`${i}번은 접종으로 면역이 생겨 첫 환자가 될 수 없다. 다른 사람을 고르라.`);
    if(this.state[i]!==S)throw Error(`${i}번은 이미 첫 환자이거나 감염 상태다.`);
    this.index=i;this.state[i]=I;this.tE[i]=this.time-this.pathogen.latentSteps;this.tI[i]=this.time;this.generation[i]=0;this.cum=1;
    if(this.isolationMode)this.contactsWhileInfectious.set(i,new Set());
    return i;
  }
  vaccinate(i){
    if(this.state[i]!==S||this.vaccinated[i])return 0;
    this.vaccinated[i]=1;if(this.rng()*100<this.effectiveVE())this.immune[i]=1;return 1;
  }
  vaccinateRule(n,rule){
    const N=this.N;let order;
    const pool=[];for(let i=1;i<=N;i++)if(this.state[i]===S&&!this.vaccinated[i])pool.push(i);
    if(rule===1){order=pool.slice();for(let k=order.length-1;k>0;k--){const j=Math.floor(this.rng()*(k+1));[order[k],order[j]]=[order[j],order[k]];}}
    else if(rule===2||rule===4){const sgn=rule===2?-1:1;order=pool.slice().sort((a,b)=>sgn*(this.degree[a-1]-this.degree[b-1])||(this.rng()<.5?-1:1));}
    else{
      if(!this.index)throw Error('규칙 3(첫 환자 주변 고리)은 명령 3으로 첫 환자를 정한 뒤 쓸 수 있다.');
      const ring=this.ringOrder(this.index);const set=new Set(pool);order=ring.filter(i=>set.has(i));
    }
    let done=0;for(const i of order){if(done>=n)break;done+=this.vaccinate(i);}
    return done;
  }
  ringOrder(center){// 4 m 이내 접촉 횟수가 많은 순서로 1차·2차 접촉자
    const close=this.closeCounts();const first=[...(close.get(center)||new Map()).entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0]);
    const seen=new Set([center,...first]),second=new Map();
    for(const f of first)for(const [g,c] of (close.get(f)||new Map()))if(!seen.has(g))second.set(g,(second.get(g)||0)+c);
    return first.concat([...second.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0]));
  }
  closeCounts(){
    if(this._close)return this._close;const m=new Map();const add=(a,b)=>{if(!m.has(a))m.set(a,new Map());const r=m.get(a);r.set(b,(r.get(b)||0)+1);};
    for(let k=0;k<this.pa.length;k++)if(this.pd[k]<=4){add(this.pa[k],this.pb[k]);add(this.pb[k],this.pa[k]);}
    return this._close=m;
  }
  counts(){
    const c={S:0,E:0,I:0,R:0,V:0,VI:0,Q:0};for(let i=1;i<=this.N;i++){const s=this.state[i];if(s===S){if(!this.immune[i])c.S++;}else if(s===E)c.E++;else if(s===I)c.I++;else c.R++;if(this.vaccinated[i])c.V++;if(this.immune[i])c.VI++;if(this.isolated[i])c.Q++;}
    return c;
  }
  dayIndex(){return Math.floor(this.time/DAY);}
  stepInDay(){return this.time%DAY;}
  isNight(){return this.stepInDay()>=ACTIVE;}
  clock(){const m=7*60+this.stepInDay()*5,h=Math.floor(m/60)%24;return `${String(h).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
  recordDay(){return this.dayIndex()%3;}
  /* 한 단계를 진행한다. 반환: {contacts:[a,b,...] (4 m 이내), events:[{from,to}]}. 밤이면 접촉 없이 시간만 흐른다. */
  step(){
    const p=this.pathogen,N=this.N,now=this.time,out={contacts:[],events:[]};
    const ext=this.ext,vir=this.virus,wane=this.wane,night=this.isNight();
    if(ext&&this.stepInDay()===0)this.extMorning();
    if(!this.isNight()){
      const t=this.recordDay()*ACTIVE+this.stepInDay(),lo=this.offsets[t],hi=this.offsets[t+1];
      const hz=this.hazard;const touched=[];
      for(let k=lo;k<hi;k++){
        const a=this.pa[k],b=this.pb[k],d=this.pd[k];
        if(d<=4)out.contacts.push(a,b);
        if(vir)this.virusPair(a,b,d);
        if(d>p.cutoff)continue;
        const sa=this.state[a],sb=this.state[b];
        let inf=0,sus=0;
        if(sa===I&&sb===S)inf=a,sus=b;else if(sb===I&&sa===S)inf=b,sus=a;
        if(inf&&this.isolationMode===2&&d<=4)this.contactsWhileInfectious.get(inf)?.add(sus);
        if(!inf||this.immune[sus]||this.isolated[inf]||this.isolated[sus])continue;
        let lam=p.a*Math.exp(-d/p.rho);
        if(ext){lam*=this.lamMul(inf,sus);if(!(lam>0))continue;}
        if(hz[sus]===0)touched.push(sus);hz[sus]+=lam;this.cands.push(sus,inf,lam);
      }
      for(const s of touched){
        const P=1-Math.exp(-hz[s]);
        if(this.rng()<P){
          let r=this.rng()*hz[s],from=0;
          for(let c=0;c<this.cands.length;c+=3)if(this.cands[c]===s){r-=this.cands[c+2];if(r<=0){from=this.cands[c+1];break;}}
          if(!from)for(let c=0;c<this.cands.length;c+=3)if(this.cands[c]===s){from=this.cands[c+1];}
          this.state[s]=E;this.tE[s]=now;this.infector[s]=from;this.secondary[from]++;this.generation[s]=this.generation[from]+1;this.cum++;this.newToday++;
          if(p.id===5)this.pcvAcquire(s);
          if(ext)this.onAcquire(s,from);else if(p.sis){if(this.everInf[s])this.reinf++;this.everInf[s]=1;}
          out.events.push({from,to:s});
        }
        hz[s]=0;
      }
      this.cands.length=0;
      if(vir)this.virusResolve();
    }
    this.time++;
    // 상태 전이 (잠복→전염, 전염→회복, 격리 해제)
    const lat=p.latentSteps,inf=p.infectiousSteps;
    for(let i=1;i<=N;i++){
      const s=this.state[i];
      if(s===E&&this.time-this.tE[i]>=lat){this.state[i]=I;this.tI[i]=this.time;if(this.isolationMode===2)this.contactsWhileInfectious.set(i,new Set());}
      else if(s===I&&this.time-this.tI[i]>=inf){this.state[i]=p.sis?S:R;this.tR[i]=this.time;if(p.sis)this.strain[i]=0;if(this.isolated[i]&&this.isolatedUntil[i]<0){this.isolated[i]=0;}this.contactsWhileInfectious.delete(i);}
      else if(wane&&s===R&&this.time-this.tR[i]>=wane)this.state[i]=S;
      if(this.isolated[i]&&this.isolatedUntil[i]>=0&&this.time>=this.isolatedUntil[i])this.isolated[i]=0;
    }
    if(this.isolationMode){// 증상 인지 뒤 격리: 전염 시작 1일 뒤
      for(let i=1;i<=N;i++)if(this.state[i]===I&&!this.isolated[i]&&this.time-this.tI[i]>=DAY){
        this.isolated[i]=1;this.isolatedUntil[i]=-1;out.isolated=(out.isolated||0)+1;
        if(this.isolationMode===2){for(const c of this.contactsWhileInfectious.get(i)||[])if(!this.isolated[c]&&this.state[c]!==R){this.isolated[c]=1;this.isolatedUntil[c]=this.time+14*DAY;out.quarantined=(out.quarantined||0)+1;}}
      }
    }
    if(ext)this.extAfter(night,now);
    if(this.time%12===0)this.sample();
    if(this.time%DAY===0){this.newDays.push(this.newToday);this.newToday=0;this.day++;}
    return out;
  }
  sample(){const c=this.counts();const row={t:this.time/DAY,...c,cum:this.cum};if(this.ext)this.extSample(row);this.series.push(row);}
  skipNight(){let n=0;while(this.isNight()){this.step();n++;}return n;}
  observe(item){
    const c=this.counts();
    const recent=this.stepInDay()===0&&this.newDays.length?this.newDays[this.newDays.length-1]:this.newToday;
    const v=[0,this.dayIndex(),c.S,c.E,c.I,c.R,c.V,this.cum,c.Q,recent,this.index?this.secondary[this.index]:0];
    if(item>10)return this.observeExt(item);
    return v[item];
  }
}
/* ---- 확장 층 (예제 17부터). 명령 14~28과 병원체 6·7에서만 켜진다(this.ext).
   켜지지 않으면 기존 경로에 난수 호출도 계산도 더하지 않아 예제 1~16의 결과가 그대로다.
   새 기능의 우연은 따로 쓰는 난수 rng3(유입·아기·혈청형)와 rng4(함께 도는 바이러스)로 뽑는다. ---- */
/* RSV 영아 보호 전략. 근거는 각 시험의 공개 결과 그대로이며, 정면 비교 시험은 없다.
   창: [시작일, 끝일, 효과, 하한, 상한]. 시작일은 아브리스보는 출생, 두 항체주사는 투여일 기준이다. 창 밖은 근거가 없어 0으로 센다.
   아브리스보(MATISSE, Kampmann 등 NEJM 2023): MA-LRTI 90일 57.1%(99.5% CI 14.7–79.8), 180일 51.3%(97.58% CI 29.4–66.8);
     입원 90일 67.7%(99.17% CI 15.9–89.5), 180일 56.8%(99.17% CI 10.1–80.7). 91~180일 구간값은 보고되지 않아 180일 누적값을 그대로 쓴다(가정).
     접종 뒤 14일 안에 태어나면 효과를 32/82배로 줄인다(스코틀랜드 입원 효과 32% 대 82%, McLachlan 등 Lancet Infect Dis 2025, 호주 예방접종 지침 인용).
   베이포투스(MELODY 1차 분석 코호트, Hammitt 등 NEJM 2022): 150일 MA-LRTI 74.5%(95% CI 49.6–87.1), 입원 62.1%(95% CI −8.6–86.8).
   엔플론시아(CLEVER, Zar 등 NEJM 2025): 150일 MALRI 60.4%(95% CI 44.1–71.9), 입원 84.2%(95% CI 66.6–92.6). */
const RSV_PRODUCTS=[null,
  {key:'abrysvo',name:'아브리스보',kind:'산모 접종',from:'birth',ma:[[0,90,57.1,14.7,79.8],[90,180,51.3,29.4,66.8]],hosp:[[0,90,67.7,15.9,89.5],[90,180,56.8,10.1,80.7]],short14:32/82,ci:'99.5%·97.58%·99.17% CI'},
  {key:'beyfortus',name:'베이포투스',kind:'항체주사',from:'dose',ma:[[0,150,74.5,49.6,87.1]],hosp:[[0,150,62.1,-8.6,86.8]],ci:'95% CI'},
  {key:'enflonsia',name:'엔플론시아',kind:'항체주사',from:'dose',ma:[[0,150,60.4,44.1,71.9]],hosp:[[0,150,84.2,66.6,92.6]],ci:'95% CI'}];
/* 폐구균 혈청형 묶음: 0 구분 없음, 1 백신형(VT), 2 비백신형(NVT), 3 X형(벨기에 19A처럼 백신에서 빠질 수 있는 형).
   침습도(보균 획득 10만 건당 IPD)는 문헌 범위 0~75(1·5형 75, Epidemics 2023) 안의 가정값이다. */
const PN_INVASIVE=[10,20,5,40];
/* 가상 아기·아이 층의 기본값. q_in: 보호자 한 명의 전염 기간 동안 아기에게 옮길 확률, q_out: 아기 한 번의 전염 기간 동안 보호자에게 옮길 확률.
   RSV: 가구 2차 발병률 5세 미만 26.8%·전 연령 23.8%(Saravanos 등 Influenza Other Respir Viruses 2026). 영아 배출 18일(Munywoki 등 JID 2015). 잠복 4일.
   폐구균 아이: 보균 51일(Melegaro 등 Epidemiol Infect 2004). q_in·q_out 30%와 바깥(어린이집) 획득 하루 0.00825(성인 16.5/1,000인-주의 3.5배)는 가정값. */
const BABY_DEFAULT={7:{qin:26.8,qout:23.8,latentDays:4,infDays:18,sis:false,ext:0},6:{qin:30,qout:30,latentDays:1,infDays:51,sis:true,ext:0.00825}};
Object.assign(Village.prototype,{
  resetExt(seed){
    const N=this.N;this.ext=false;this.rng3=random(seed*69069+20261028);this.rng4=random(seed*22695477+1);this.rng5=random(seed*1103515245+4242);
    this.wane=0;this.everInf=new Uint8Array(N+1);this.reinf=0;this.imp={every:0,n:0,start:-1,last:-1,count:0};
    this.strain=new Uint8Array(N+1);this.mix=null;this.pnVac=new Uint8Array(N+1);this.leakyEff=0;this.outEff=0;this.coverX=1;
    this.pn={acq:[0,0,0,0],acqVac:0,acqUnvac:0,ipd:0,ipdVac:0,ipdUnvac:0,samples:0,prev:0,prevUnvac:0,prevType:[0,0,0,0],prevChild:0,leaky:0,out:0,childLeaky:0};
    this.virus=null;this.babies=[];this.babyOf=new Int32Array(N+1).fill(-1);this.fromBaby=0;
    this.next={birth:0,prod:0,f:0,interval:35,mabRule:0,shed:0};this.abAdd=false;this.babyQ=null;this.labels=[];
  },
  enableExt(){this.ext=true;},
  setWane(days){this.enableExt();this.wane=days*DAY;},
  setImport(every,n){this.enableExt();this.imp.every=every;this.imp.n=n;if(every>0&&this.imp.start<0)this.imp.start=this.dayIndex();this.imp.last=every>0?this.dayIndex()-every:-1;},
  pickStrain(){if(!this.mix)return 0;const u=this.rng3()*100;return u<this.mix[0]?1:u<this.mix[0]+this.mix[1]?3:2;},
  covered(t){return t===1||(t===3&&this.coverX===1);},
  setMix(vt,x){this.enableExt();this.mix=[vt,x];if(this.index&&!this.strain[this.index])this.strain[this.index]=this.pickStrain();},
  lamMul(inf,sus){let m=1;
    if(this.pnVac[sus]===1&&this.covered(this.strain[inf]))m*=1-this.leakyEff/100;
    if(this.virus){const v=this.virus;if(v.state[sus]===2)m*=v.m;if(v.state[inf]===2)m*=v.m;}
    return m;},
  onAcquire(s,from){
    if(this.everInf[s])this.reinf++;this.everInf[s]=1;
    if(this.pathogen.sis){this.strain[s]=from?this.strain[from]:this.pickStrain();this.pnRecord(s,this.strain[s],this.virus?.state[s]===2);}
  },
  pnRecord(s,t,viral){// 보균 획득 1건의 기대 IPD(난수 없이 기댓값으로 더한다)
    const P=this.pn;P.acq[t]++;let r=PN_INVASIVE[t]/1e5;if(viral)r*=this.virus.m;
    const vac=s>0?this.pnVac[s]:0;if(vac===2&&this.covered(t))r*=1-this.outEff/100;
    P.ipd+=r;if(s>0){if(vac){P.acqVac++;P.ipdVac+=r;}else{P.acqUnvac++;P.ipdUnvac+=r;}}
  },
  importOne(){
    const pool=[];for(let i=1;i<=this.N;i++)if(this.state[i]===S&&!this.immune[i]&&!this.isolated[i])pool.push(i);
    if(!pool.length)return 0;const i=pool[Math.floor(this.rng3()*pool.length)];
    let t=0;if(this.pathogen.sis){t=this.pickStrain();if(this.pnVac[i]===1&&this.covered(t)&&this.rng3()<this.leakyEff/100)return 0;}
    this.state[i]=E;this.tE[i]=this.time;this.infector[i]=0;this.generation[i]=0;this.cum++;this.newToday++;this.imp.count++;this.everInf[i]&&this.reinf++;this.everInf[i]=1;if(this.pathogen.sis){this.strain[i]=t;this.pnRecord(i,t,this.virus?.state[i]===2);}return i;
  },
  extMorning(){
    const d=this.dayIndex(),im=this.imp;
    if(this.virus)this.virusImport(d);
    if(im.every>0&&d-im.last>=im.every){im.last=d;for(let k=0;k<im.n;k++)this.importOne();}
    if(this.babies.length&&this.pathogen.sis){const q=this.babyQ;for(const b of this.babies){if(d<b.birth||b.st!==S)continue;
      let h=q.ext;const t=this.pickStrain();if(b.leaky&&this.covered(t))h*=1-b.leaky/100;
      if(this.rng3()<1-Math.exp(-h))this.babyInfect(b,t);}}
  },
  extSample(row){
    if(this.mix){let v=0,n=0,x=0;for(let i=1;i<=this.N;i++)if(this.state[i]===E||this.state[i]===I){const t=this.strain[i];if(t===1)v++;else if(t===3)x++;else n++;}row.VT=v;row.NVT=n;row.X=x;}
    if(this.virus){let k=0;for(let i=1;i<=this.N;i++)if(this.virus.state[i]===2)k++;row.virus=k;}
    if(this.babies.length){let k=0;for(const b of this.babies)if(b.st===E||b.st===I)k++;row.baby=k;}
    if(this.pathogen.sis){const P=this.pn;let c=0,cu=0,nu=0,cc=0,nc=0;const tc=[0,0,0,0];
      for(let i=1;i<=this.N;i++){const car=this.state[i]===E||this.state[i]===I;if(car){c++;tc[this.strain[i]]++;}if(!this.pnVac[i]){nu++;if(car)cu++;}}
      for(const b of this.babies)if(this.time/DAY>=b.birth){nc++;if(b.st===E||b.st===I)cc++;}
      P.samples++;P.prev+=c/this.N;P.prevUnvac+=nu?cu/nu:0;for(let t=0;t<4;t++)P.prevType[t]+=tc[t]/this.N;P.prevChild+=nc?cc/nc:0;}
  },
  observeExt(item){
    let a=0,b=0;for(const x of this.babies){if(x.st===E||x.st===I)a++;b+=x.inf.length;}
    const t=[0,0,0,0];for(let i=1;i<=this.N;i++)if(this.state[i]===E||this.state[i]===I)t[this.strain[i]]++;
    return [0,0,0,0,0,0,0,0,0,0,0,this.reinf,a,b,t[1],t[2],t[3]][item];
  },
  /* 가상 아기·아이: 실제 469명 가운데 고른 사람(보호자)에게 한 명씩 붙인다. 접촉 기록이 없고, 밤(집)에 보호자와만 주고받는다. */
  addBabies(n,rule){
    this.enableExt();const p=this.pathogen,def=BABY_DEFAULT[p.id];
    if(!this.babyQ){this.babyQ={...def};}
    const pool=[];for(let i=1;i<=this.N;i++)if(this.babyOf[i]<0)pool.push(i);
    let order;
    if(rule===1){order=pool.slice();for(let k=order.length-1;k>0;k--){const j=Math.floor(this.rng3()*(k+1));[order[k],order[j]]=[order[j],order[k]];}}
    else{const sgn=rule===2?-1:1,tie=new Map(pool.map(i=>[i,this.rng3()]));order=pool.slice().sort((a,b)=>sgn*(this.degree[a-1]-this.degree[b-1])||tie.get(a)-tie.get(b));}
    const nx=this.next;let done=0;
    for(const cg of order){if(done>=n)break;
      const b={cg,birth:nx.birth,st:S,tE:-1,tI:-1,prod:nx.prod,f:nx.f,interval:nx.interval,mabRule:nx.mabRule,shed:nx.shed,rule,inf:[],strain:0,leaky:0};
      this.babyOf[cg]=this.babies.length;this.babies.push(b);done++;}
    return done;
  },
  babyH(){const q=this.babyQ,p=this.pathogen,Dcg=p.infectiousSteps/DAY;
    return {hin:-Math.log(1-Math.min(q.qin,99.9)/100)/(Dcg*NIGHT),hout:-Math.log(1-Math.min(q.qout,99.9)/100)/(q.infDays*NIGHT)};},
  doseDay(b){return b.mabRule===1||this.imp.start<0?b.birth:Math.max(b.birth,this.imp.start);},
  /* 아브리스보 아기의 추가 항체주사(명령 21 값 2, 한국·미국 지침): 접종→분만 14일 미만이거나 계절 전(4~9월)에 태어난 아기는
     출생일과 계절 시작일 가운데 늦은 날 베이포투스를 맞는다. 그날부터는 베이포투스 시험값만 쓴다(두 제품을 합친 효과는 근거가 없어 더하지 않는다). */
  abAddDay(b){return this.abAdd&&this.imp.start>=0&&(b.interval<14||b.birth<this.imp.start)?Math.max(b.birth,this.imp.start):null;},
  rsvProtect(k,b,t,end){
    if(k===1){const d=this.abAddDay(b);if(d!==null&&t>=d){const w=RSV_PRODUCTS[2][end].find(w=>t-d>=w[0]&&t-d<w[1]);return w?{v:[w[2],w[3],w[4]],win:true,add:true}:{v:[0,0,0],win:false,add:true};}}
    const P=RSV_PRODUCTS[k];if(!P)return null;const start=P.from==='birth'?b.birth:this.doseDay(b);
    if(t<start)return {v:[0,0,0],win:false,pre:true};
    const s=t-start,w=P[end].find(w=>s>=w[0]&&s<w[1]);if(!w)return {v:[0,0,0],win:false};
    const f=P.from==='birth'&&b.interval<14?P.short14:1;return {v:[w[2]*f,w[3]*f,w[4]*f],win:true};
  },
  babyInfect(b,t){b.st=E;b.tE=this.time;b.strain=t||0;b.inf.push(this.time/DAY);},
  extAfter(night,now){
    if(this.virus)this.virusTransitions();
    if(!this.babies.length)return;
    const p=this.pathogen,q=this.babyQ,H=night?this.babyH():null,tday=now/DAY,lat=q.latentDays*DAY,dur=q.infDays*DAY;
    for(const b of this.babies){
      if(tday<b.birth)continue;
      if(b.st===E&&this.time-b.tE>=lat){b.st=I;b.tI=this.time;}
      else if(b.st===I&&this.time-b.tI>=dur){b.st=q.sis?S:R;if(q.sis)b.strain=0;}
      if(!night)continue;const cg=b.cg;
      if(b.st===S&&this.state[cg]===I){
        let h=H.hin;const t=this.strain[cg];
        if(q.sis){if(b.leaky&&this.covered(t))h*=1-b.leaky/100;}
        else if(b.prod&&b.f){const pr=this.rsvProtect(b.prod,b,tday,'ma');if(pr.win)h*=1-b.f/100*pr.v[0]/100;}
        if(this.rng3()<1-Math.exp(-h))this.babyInfect(b,t);
      }
      else if(b.st===I&&this.state[cg]===S&&!this.immune[cg]&&!this.isolated[cg]){
        let h=H.hout;if(!q.sis&&b.prod&&b.shed){const pr=this.rsvProtect(b.prod,b,b.inf[b.inf.length-1],'ma');if(pr.win)h*=1-b.shed/100;}
        if(q.sis&&this.pnVac[cg]===1&&this.covered(b.strain))h*=1-this.leakyEff/100;
        if(this.rng3()<1-Math.exp(-h)){this.state[cg]=E;this.tE[cg]=this.time;this.infector[cg]=0;this.cum++;this.newToday++;this.fromBaby++;
          if(this.everInf[cg])this.reinf++;this.everInf[cg]=1;if(q.sis){this.strain[cg]=b.strain;this.pnRecord(cg,b.strain,this.virus?.state[cg]===2);}}
      }
    }
  },
  /* 함께 도는 바이러스: 같은 접촉 기록 위의 두 번째 S-E-I-R. 바이러스 전염 중인 사람은 폐구균 획득·전파·IPD 위험이 배수만큼 커진다(배수는 가정값). */
  startVirus(id,m){
    this.enableExt();const p=this.D.pathogens.find(x=>x.id===id);const N=this.N;
    const v={p,m,state:new Uint8Array(N+1),tE:new Int32Array(N+1),tI:new Int32Array(N+1),hz:new Float64Array(N+1),touched:[],cum:1,start:this.dayIndex()};
    v.cum=0;v.last=this.dayIndex()-3;this.virus=v;return 0;
  },
  virusImport(d){// 바이러스 계절: 3일마다 1명이 바깥에서 감염되어 들어온다
    const v=this.virus;if(d-v.last<3)return;v.last=d;const pool=[];for(let i=1;i<=this.N;i++)if(v.state[i]===0)pool.push(i);if(!pool.length)return;
    const i=pool[Math.floor(this.rng4()*pool.length)];v.state[i]=1;v.tE[i]=this.time;v.cum++;
  },
  virusPair(a,b,d){const v=this.virus;if(d>v.p.cutoff)return;const sa=v.state[a],sb=v.state[b];let s=0;
    if(sa===2&&sb===0)s=b;else if(sb===2&&sa===0)s=a;if(!s||this.isolated[a]||this.isolated[b])return;
    if(v.hz[s]===0)v.touched.push(s);v.hz[s]+=v.p.a*Math.exp(-d/v.p.rho);},
  virusResolve(){const v=this.virus;for(const s of v.touched){if(this.rng4()<1-Math.exp(-v.hz[s])){v.state[s]=1;v.tE[s]=this.time;v.cum++;}v.hz[s]=0;}v.touched.length=0;},
  virusTransitions(){const v=this.virus;for(let i=1;i<=this.N;i++){const s=v.state[i];
    if(s===1&&this.time-v.tE[i]>=v.p.latentSteps){v.state[i]=2;v.tI[i]=this.time;}else if(s===2&&this.time-v.tI[i]>=v.p.infectiousSteps)v.state[i]=3;}},
  /* 폐구균 접종: 1 PCV(누수형 · 백신형 획득 위험을 효과만큼 줄임), 2 PPSV(보균은 그대로, 백신형 보균의 IPD 위험만 줄임). 접종자 고르기는 따로 쓰는 난수(rng5)라 유입·혈청형의 우연을 바꾸지 않는다. */
  pnVaccinate(n,eff,kind,target){
    this.enableExt();if(kind===1)this.leakyEff=eff;else this.outEff=eff;let done=0;
    if(target===2){const pool=this.babies.filter(b=>!b.leaky);for(let k=pool.length-1;k>0;k--){const j=Math.floor(this.rng5()*(k+1));[pool[k],pool[j]]=[pool[j],pool[k]];}
      for(const b of pool){if(done>=n)break;b.leaky=eff;done++;}this.pn.childLeaky+=done;return done;}
    const pool=[];for(let i=1;i<=this.N;i++)if(!this.pnVac[i])pool.push(i);
    for(let k=pool.length-1;k>0;k--){const j=Math.floor(this.rng5()*(k+1));[pool[k],pool[j]]=[pool[j],pool[k]];}
    for(const i of pool){if(done>=n)break;this.pnVac[i]=kind;done++;}
    if(kind===1)this.pn.leaky+=done;else this.pn.out+=done;return done;
  },
  pnSummary(){const P=this.pn,n=P.samples||1,pc=x=>x/n*100;
    const last=this.series.filter(r=>r.t>this.time/DAY-30),L=last.length||1,lt=k=>last.reduce((a,r)=>a+(r[k]||0),0)/L/this.N*100;
    return {last30:{all:last.reduce((a,r)=>a+r.E+r.I,0)/L/this.N*100,VT:lt('VT'),NVT:lt('NVT'),X:lt('X')},days:this.time/DAY,acq:P.acq.reduce((a,b)=>a+b,0),acqVac:P.acqVac,acqUnvac:P.acqUnvac,prev:pc(P.prev),prevUnvac:pc(P.prevUnvac),
      prevType:P.prevType.map(pc),prevChild:pc(P.prevChild),ipd:P.ipd,ipdVac:P.ipdVac,ipdUnvac:P.ipdUnvac,leaky:P.leaky,out:P.out,childLeaky:P.childLeaky,
      children:this.babies.length,mix:this.mix,coverX:this.coverX,virus:this.virus?{name:this.virus.p.name,m:this.virus.m,cum:this.virus.cum}:null,fromBaby:this.fromBaby};},
  /* RSV 아기 요약. 같은 아기·같은 감염을 세 전략으로 각각 센 기대 감소(쌍 비교)와, 실제로 배정한 전략별 위험(관찰 비교)을 함께 낸다. */
  rsvSummary(){
    const B=this.babies,born=B.filter(b=>this.time/DAY>=b.birth);let infs=0;
    const pair=[1,2,3].map(k=>({k,name:RSV_PRODUCTS[k].name,kind:RSV_PRODUCTS[k].kind,ci:RSV_PRODUCTS[k].ci,ma:[0,0,0],hosp:[0,0,0],out:0,pre:0}));
    const cohorts=new Map(),groups=new Map();
    for(const b of B){
      const key=b.birth+'|'+b.interval;if(!cohorts.has(key))cohorts.set(key,{birth:b.birth,interval:b.interval,n:0,inf:0,ma:[0,0,0]});const co=cohorts.get(key);co.n++;
      const g=b.prod;if(!groups.has(g))groups.set(g,{prod:g,name:g?RSV_PRODUCTS[g].name:'보호 없음',n:0,inf:0,ma:0,hosp:0,rule:new Set(),mab:new Set(),f:new Set(),shed:new Set(),interval:new Set(),short:0,add:0});const gr=groups.get(g);gr.n++;gr.rule.add(b.rule);gr.mab.add(b.mabRule);gr.f.add(b.f);gr.shed.add(b.shed);gr.interval.add(b.interval);if(g===1&&b.interval<14)gr.short++;if(g===1&&this.abAddDay(b)!==null)gr.add++;
      for(const t of b.inf){infs++;co.inf++;gr.inf++;
        pair.forEach((r,j)=>{const m=this.rsvProtect(r.k,b,t,'ma'),h=this.rsvProtect(r.k,b,t,'hosp');for(let z=0;z<3;z++){r.ma[z]+=m.v[z];r.hosp[z]+=h.v[z];}if(!m.win)r.out++;if(m.pre)r.pre++;co.ma[j]+=m.v[0];});
        if(g){const m=this.rsvProtect(g,b,t,'ma'),h=this.rsvProtect(g,b,t,'hosp'),fi=b.f/100*m.v[0]/100;gr.ma+=(1-m.v[0]/100)/(1-fi);gr.hosp+=Math.min(1,(1-h.v[0]/100)/(1-fi));}
        else{gr.ma+=1;gr.hosp+=1;}
      }
    }
    const mean=a=>infs?a.map(x=>x/infs):null;
    return {babies:B.length,born:born.length,infections:infs,fromBaby:this.fromBaby,seasonStart:this.imp.start,
      pair:pair.map(r=>({...r,ma:mean(r.ma),hosp:mean(r.hosp)})),
      cohorts:[...cohorts.values()].sort((a,b)=>a.birth-b.birth||b.interval-a.interval).map(c=>({...c,ma:c.inf?c.ma.map(x=>x/c.inf):null})),
      groups:[...groups.values()].sort((a,b)=>a.prod-b.prod).map(g=>({...g,rule:[...g.rule],mab:[...g.mab],f:[...g.f],shed:[...g.shed],interval:[...g.interval],risk:g.n?g.inf/g.n:0,maRisk:g.n?g.ma/g.n:0,hospRisk:g.n?g.hosp/g.n:0}))};
  }
});
if(typeof module!=='undefined')module.exports={Village,random,DAY,ACTIVE,NIGHT,PCV_MODEL,RSV_PRODUCTS,PN_INVASIVE,BABY_DEFAULT};
