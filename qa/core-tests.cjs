const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const root=path.join(__dirname,'..');
const {Village}=require('../src/village.js'),{examples}=require('../src/examples.js'),{makeContext}=require('./run-examples.cjs');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/village.json'),'utf8'));
let count=0;function check(n,f){f();count++;console.log('PASS',n);}
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'data/raw',f))).digest('hex');
check('Raw files match recorded SHA-256 and row count',()=>{
  for(const f of ['Kissler_DataS1.csv','Kissler_DataS2.csv'])assert.strictEqual(sha(f),data.source.sha256[f],f);
  assert.strictEqual(fs.readFileSync(path.join(root,'data/raw/Kissler_DataS1.csv'),'utf8').trim().split('\n').length,102831);
});
check('Packed log decodes to the raw rows',()=>{
  const v=new Village(data);assert.strictEqual(v.pa.length,102831);
  const rows=fs.readFileSync(path.join(root,'data/raw/Kissler_DataS1.csv'),'utf8').trim().split('\n').map(l=>l.split(',').map(Number));
  const set=new Set(rows.map(r=>r.join(',')));
  for(let t=0;t<576;t++)for(let k=data.offsets[t];k<data.offsets[t+1];k++)assert(set.has([t+1,v.pa[k],v.pb[k],v.pd[k]].join(',')));
  assert.strictEqual(data.offsets[576],102831);
});
check('Summary statistics',()=>{const s=data.stats;assert.strictEqual(s.users,469);assert.strictEqual(s.pairsWithin4m,1262);assert.strictEqual(s.pairsWithin20m,3195);assert.strictEqual(s.pairsWithin50m,8277);assert.strictEqual(s.maxDegree4m,37);assert.strictEqual(s.isolated4m,57);assert.strictEqual(data.degree4m[329],37);});
check('Layout keeps 469 people apart and inside the frame',()=>{const L=data.layout;assert.strictEqual(L.length,938);for(let i=0;i<469;i++){assert(L[i*2]>=0&&L[i*2]<=960&&L[i*2+1]>=60&&L[i*2+1]<=720);for(let j=i+1;j<469;j++)assert(Math.hypot(L[i*2]-L[j*2],L[i*2+1]-L[j*2+1])>=16,'overlap '+(i+1)+'/'+(j+1));}});
function run(pid,days,seed,setup){const v=new Village(data);v.reset(seed);v.setPathogen(pid);if(setup)setup(v);const idx=v.setIndex(0);for(let d=0;d<days;d++){for(let s=0;s<192;s++)v.step();v.skipNight();}return {v,idx,counts:v.counts()};}
check('Same seed reproduces the same outbreak',()=>{const a=run(1,40,11),b=run(1,40,11);assert.strictEqual(a.idx,b.idx);assert.deepStrictEqual(a.counts,b.counts);assert.deepStrictEqual([...a.v.state],[...b.v.state]);});
check('Different seeds differ',()=>{const a=run(1,40,1),b=run(1,40,2);assert(a.v.cum!==b.v.cum||a.idx!==b.idx);});
check('Calibrated amplitude gives mean secondary infections near target R0',()=>{
  for(const p of data.pathogens.filter(p=>p.R0)){
    const rho=p.rho,K=new Map(),v=new Village(data);
    for(let k=0;k<v.pa.length;k++){if(v.pd[k]>p.cutoff)continue;const key=v.pa[k]*1000+v.pb[k];K.set(key,(K.get(key)||0)+Math.exp(-v.pd[k]/rho));}
    let tot=0;const D=p.infectiousDays;for(const [key,w] of K){tot+=2*(1-Math.exp(-p.a*w*D/3));}
    const meanR=tot/469;assert(Math.abs(meanR-p.R0)/p.R0<.01,p.name+' '+meanR);
  }
});
check('Night has no transmission but timers advance',()=>{const v=new Village(data);v.reset(3);v.setPathogen(4);v.setIndex(0);for(let s=0;s<192;s++)v.step();const cum=v.cum,t=v.time;const n=v.skipNight();assert.strictEqual(n,96);assert.strictEqual(v.cum,cum);assert.strictEqual(v.time,t+96);assert.strictEqual(v.time%288,0);});
check('Vaccination: all-or-nothing with efficacy, only susceptibles',()=>{const v=new Village(data);v.reset(5);v.setPathogen(1);v.ve=0;assert.strictEqual(v.vaccinateRule(100,1),100);const c=v.counts();assert.strictEqual(c.V,100);assert.strictEqual(c.VI,0);v.ve=100;v.vaccinateRule(50,2);assert.strictEqual(v.counts().VI,50);assert.strictEqual(v.vaccinate(1)+v.vaccinateRule(469,1),469-150);});
check('Ring rule needs an index case; degree rule picks 330 first',()=>{const v=new Village(data);v.reset(1);v.setPathogen(2);assert.throws(()=>v.vaccinateRule(5,3));v.ve=100;v.vaccinateRule(1,2);assert.strictEqual(v.vaccinated[330],1);v.setIndex(217);assert(v.vaccinateRule(10,3)>0);});
check('Immune person cannot be the index case',()=>{const v=new Village(data);v.reset(1);v.setPathogen(1);v.ve=100;v.vaccinate(7);assert.throws(()=>v.setIndex(7));});
check('Isolation policies reduce the measles outbreak in order 0 ≥ 1 ≥ 2 (seed 5)',()=>{const r=[0,1,2].map(m=>run(1,60,5,v=>{v.isolationMode=m;}).v.cum);assert(r[0]>=r[1]&&r[1]>=r[2],r.join(','));assert(r[2]<r[0]);});
check('Observation items are integers in range',()=>{const {v}=run(3,10,2);for(let i=1;i<=10;i++){const x=v.observe(i);assert(Number.isInteger(x)&&x>=0&&x<=469,i);}assert.strictEqual(v.observe(1),10);});
function exec(code){const {ctx,queue,msgs}=makeContext();ctx.onmessage({data:{type:'init',data}});ctx.onmessage({data:{type:'run',code}});let n=0;while(queue.length){queue.shift()();if(++n>3e6)throw Error('loop');}
  const seen=new Set(),all=[];for(const m of msgs)for(const l of m.logs||[]){const k=l.day+'|'+l.text;if(!seen.has(k)){seen.add(k);all.push(l);}}
  return {...msgs[msgs.length-1],allLogs:all};}
const P=(...ns)=>ns.map(n=>'뿡뿡 '+require('../src/examples.js').expression(n)+'~뿡뿡뿡~').join('');
const prog=body=>'나는 동현이냐?\n'+body+'\n동현이구나';
check('Protocol: pathogen must come first',()=>{const m=exec(prog(P(3,0)));assert.strictEqual(m.type,'error');assert(m.error.includes('명령 2'));});
check('Protocol: time cannot advance without an index case',()=>{const m=exec(prog(P(2,1)+P(7,5)));assert.strictEqual(m.type,'error');assert(m.error.includes('첫 환자'));});
check('Protocol: pathogen cannot change after time passes',()=>{const m=exec(prog(P(2,3)+P(3,0)+P(7,1)+P(2,1)));assert.strictEqual(m.type,'error');assert(m.error.includes('병원체'));});
check('Protocol: 365-day budget',()=>{const m=exec(prog(P(2,3)+P(3,0)+P(7,300)+P(7,100)));assert.strictEqual(m.type,'error');assert(m.error.includes('365'));});
check('Protocol: observation then 꽥꽥, unread 꽥꽥 is an error',()=>{
  const ok=exec(prog(P(2,3)+P(3,0)+P(7,2)+P(8,1)+'동현아 꽥꽥\n'+P(10)+'뿡뿡 동현~뿡뿡뿡~'));assert.strictEqual(ok.type,'done');assert(ok.logs.some(l=>l.text==='동현랭 기록: 2'));
  const bad=exec(prog(P(2,3)+'동현아 꽥꽥'));assert.strictEqual(bad.type,'error');
});
check('Protocol: non-integer output and unknown command are errors',()=>{assert.strictEqual(exec(prog('뿡뿡뿡 도오오오오오오오오오옹 도오오오오오오옹도오옹')).type,'error');assert.strictEqual(exec(prog(P(42))).type,'error');});
check('Halt program stops a running experiment',()=>{const {ctx,queue,msgs}=makeContext();ctx.onmessage({data:{type:'init',data}});ctx.onmessage({data:{type:'run',code:prog(P(2,1)+P(3,0)+P(7,30))}});for(let i=0;i<20;i++)queue.shift()();ctx.onmessage({data:{type:'halt'}});assert.strictEqual(msgs[msgs.length-1].type,'halted');});
check('All examples run to completion',()=>{for(const ex of examples){const m=exec(ex.code);assert.strictEqual(m.type,'done',ex.id+': '+(m.error||''));}});
check('Example outcomes tell the intended stories',()=>{
  const last=id=>exec(examples.find(e=>e.id===id).code);
  const m=last('measles');assert(m.state.cum>400);
  const cov=last('measles-coverage').allLogs.filter(l=>/유행 종료/.test(l.text));assert.strictEqual(cov.length,2);const sizes=cov.map(l=>Number(l.text.match(/누적 감염 (\d+)명/)[1]));assert(sizes[1]<sizes[0],sizes.join(','));
  const tgt=exec(examples.find(e=>e.id==='pertussis-targeted').code);assert(tgt.state.cum<150,'targeted pertussis '+tgt.state.cum);
});
fs.writeFileSync(path.join(__dirname,'core-results.json'),JSON.stringify({passed:count,at:new Date().toISOString()},null,1)+'\n');
console.log('CORE TOTAL',count);
