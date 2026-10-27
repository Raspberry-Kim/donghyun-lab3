/* 동현빌의 마을 모형. 실제 Haslemere 접촉 기록(469명 · 5분 간격 · 3일) 위에서 S-E-I-R 전파를 계산한다.
   하루는 288단계(5분×24시간)이며, 기록이 있는 07:00~22:55의 192단계에만 접촉이 있고 밤 96단계는 접촉이 없다.
   세 날의 기록은 날짜 순서대로 반복된다. 전파 위험은 거리 d(m)에 대해 λ = a·exp(-d/ρ), d ≤ 차단 거리이며,
   한 단계에서 감수성자가 감염될 확률은 1-exp(-Σλ)이다 (Kissler 등, BBC Pandemic Haslemere 모의의 커널). */
function random(seed){let x=seed>>>0;return()=>((x=(Math.imul(1664525,x)+1013904223)>>>0)/4294967296);}
const S=0,E=1,I=2,R=3;
const DAY=288,ACTIVE=192,NIGHT=96;
/* 병원체 5(폐구균 보균)의 성인 PCV 결과 층. 보균 획득 1건마다 혈청형 묶음을 하나 뽑고, PCV 접종자이면 그 묶음이 백신에 들어 있을 때
   그 보균이 침습질환(IPD)이 될 위험을 혈청형당 효과만큼 줄인다고 센다. 보균과 전파에는 영향이 없다(결과만 줄이는 접종).
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
    if(!this.isNight()){
      const t=this.recordDay()*ACTIVE+this.stepInDay(),lo=this.offsets[t],hi=this.offsets[t+1];
      const hz=this.hazard;const touched=[];
      for(let k=lo;k<hi;k++){
        const a=this.pa[k],b=this.pb[k],d=this.pd[k];
        if(d<=4)out.contacts.push(a,b);
        if(d>p.cutoff)continue;
        const sa=this.state[a],sb=this.state[b];
        let inf=0,sus=0;
        if(sa===I&&sb===S)inf=a,sus=b;else if(sb===I&&sa===S)inf=b,sus=a;
        if(inf&&this.isolationMode===2&&d<=4)this.contactsWhileInfectious.get(inf)?.add(sus);
        if(!inf||this.immune[sus]||this.isolated[inf]||this.isolated[sus])continue;
        const lam=p.a*Math.exp(-d/p.rho);
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
          out.events.push({from,to:s});
        }
        hz[s]=0;
      }
      this.cands.length=0;
    }
    this.time++;
    // 상태 전이 (잠복→전염, 전염→회복, 격리 해제)
    const lat=p.latentSteps,inf=p.infectiousSteps;
    for(let i=1;i<=N;i++){
      const s=this.state[i];
      if(s===E&&this.time-this.tE[i]>=lat){this.state[i]=I;this.tI[i]=this.time;if(this.isolationMode===2)this.contactsWhileInfectious.set(i,new Set());}
      else if(s===I&&this.time-this.tI[i]>=inf){this.state[i]=R;this.tR[i]=this.time;if(this.isolated[i]&&this.isolatedUntil[i]<0){this.isolated[i]=0;}this.contactsWhileInfectious.delete(i);}
      if(this.isolated[i]&&this.isolatedUntil[i]>=0&&this.time>=this.isolatedUntil[i])this.isolated[i]=0;
    }
    if(this.isolationMode){// 증상 인지 뒤 격리: 전염 시작 1일 뒤
      for(let i=1;i<=N;i++)if(this.state[i]===I&&!this.isolated[i]&&this.time-this.tI[i]>=DAY){
        this.isolated[i]=1;this.isolatedUntil[i]=-1;out.isolated=(out.isolated||0)+1;
        if(this.isolationMode===2){for(const c of this.contactsWhileInfectious.get(i)||[])if(!this.isolated[c]&&this.state[c]!==R){this.isolated[c]=1;this.isolatedUntil[c]=this.time+14*DAY;out.quarantined=(out.quarantined||0)+1;}}
      }
    }
    if(this.time%12===0)this.sample();
    if(this.time%DAY===0){this.newDays.push(this.newToday);this.newToday=0;this.day++;}
    return out;
  }
  sample(){const c=this.counts();this.series.push({t:this.time/DAY,...c,cum:this.cum});}
  skipNight(){let n=0;while(this.isNight()){this.step();n++;}return n;}
  observe(item){
    const c=this.counts();
    const recent=this.stepInDay()===0&&this.newDays.length?this.newDays[this.newDays.length-1]:this.newToday;
    const v=[0,this.dayIndex(),c.S,c.E,c.I,c.R,c.V,this.cum,c.Q,recent,this.index?this.secondary[this.index]:0];
    return v[item];
  }
}
if(typeof module!=='undefined')module.exports={Village,random,DAY,ACTIVE,NIGHT,PCV_MODEL};
