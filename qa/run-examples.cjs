// 예제를 계산 스레드와 같은 코드로 끝까지 실행한다 (브라우저 없이).
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
const src=f=>fs.readFileSync(path.join(root,'src',f),'utf8');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/village.json'),'utf8'));
function makeContext(){
  const queue=[];const msgs=[];
  const ctx={console,atob:s=>Buffer.from(s,'base64').toString('binary'),performance:{now:()=>Number(process.hrtime.bigint()/1000000n)},
    setTimeout:(fn)=>{queue.push(fn);},postMessage:m=>msgs.push(m),Buffer};
  ctx.self=ctx;vm.createContext(ctx);
  vm.runInContext([src('donghyun.js'),src('village.js'),src('examples.js'),src('worker.js')].join('\n'),ctx);
  return {ctx,queue,msgs};
}
module.exports={makeContext};
if(require.main===module){
  const {examples}=require('../src/examples.js');
  const only=process.argv[2];
  for(const ex of examples){
    if(only&&ex.id!==only)continue;
    const {ctx,queue,msgs}=makeContext();const t0=Date.now();
    ctx.onmessage({data:{type:'init',data}});ctx.onmessage({data:{type:'run',code:ex.code}});
    let n=0;while(queue.length){const fn=queue.shift();fn();if(++n>2e6)throw Error('loop');}
    const last=msgs[msgs.length-1];
    const logs=last.logs.map(l=>l.text);
    console.log(ex.id,last.type,'frames',msgs.length,'ms',Date.now()-t0,'| cum',last.state.cum,'counts',JSON.stringify(last.state.counts),last.error||'');
    console.log('   '+logs.filter(t=>/유행 종료|오류|접종|기록|관측|완료/.test(t)).slice(-8).join('\n   '));
  }
}
