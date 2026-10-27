const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {integrateReferenceDocuments}=require('./render-docs.cjs');
const {inlineIcons,copyIcons}=require('./icon-files.cjs');
const root=__dirname,out=path.join(root,'dist'),src=n=>fs.readFileSync(path.join(root,'src',n),'utf8');
fs.mkdirSync(out,{recursive:true});
for(const file of fs.readdirSync(out))if(/^(worker\.bundle|app|village|style)\.[a-f0-9]{12}\.(js|json|css)$/.test(file))fs.unlinkSync(path.join(out,file));
const hashed=(stem,ext,text)=>{const name=stem+'.'+crypto.createHash('sha256').update(text).digest('hex').slice(0,12)+'.'+ext;fs.writeFileSync(path.join(out,name),text);return name;};
const worker=[src('donghyun.js'),src('village.js'),src('examples.js'),src('worker.js')].join('\n');
const app=[src('examples.js'),src('app.js')].join('\n');
const data=fs.readFileSync(path.join(root,'data/village.json'),'utf8');
const css=src('style.css')+'\n'+src('brand.css');
const workerFile=hashed('worker.bundle','js',worker),appFile=hashed('app','js',app),dataFile=hashed('village','json',data),cssFile=hashed('style','css',css);
fs.copyFileSync(path.join(root,'LICENSE'),path.join(root,'licenses/DONGHYUNVIL-LICENSE.txt'));
let html=integrateReferenceDocuments(src('index.html'),root)
  .replace('./style.css','./'+cssFile).replace('./app.js','./'+appFile).replace('./worker.js','./'+workerFile).replace('./village.json','./'+dataFile);
fs.cpSync(path.join(root,'fonts'),path.join(out,'fonts'),{recursive:true});
fs.cpSync(path.join(root,'licenses'),path.join(out,'licenses'),{recursive:true});
for(const name of ['README.md','PROVENANCE.md','CREDITS.md','SPEC.md','LICENSE'])fs.copyFileSync(path.join(root,name),path.join(out,name));
fs.writeFileSync(path.join(out,'index.html'),html);
copyIcons(out);
let embeddedCSS=css;
for(const name of fs.readdirSync(path.join(root,'fonts'))){
  embeddedCSS=embeddedCSS.replaceAll('./fonts/'+name,'data:font/woff2;base64,'+fs.readFileSync(path.join(root,'fonts',name)).toString('base64'));
}
const safeJSON=v=>JSON.stringify(v).replaceAll('<','\\u003c');
html=html.replace(`<link rel="stylesheet" href="./${cssFile}">`,`<style>${embeddedCSS}</style>`)
  .replace(`<script>window.VILLAGE_CONFIG={worker:"./${workerFile}",data:"./${dataFile}"};</script>`,`<script>window.VILLAGE_CONFIG={};window.EMBEDDED_VILLAGE=${safeJSON(JSON.parse(data))};window.EMBEDDED_WORKER=${safeJSON(worker)};</script>`)
  .replace(`<script type="module" src="./${appFile}"></script>`,`<script type="module">${app.replaceAll('</script','<\\/script')}</script>`);
const version=require('./package.json').version.split('.').slice(0,2).join('.');
fs.writeFileSync(path.join(root,'index.html'),html);fs.writeFileSync(path.join(root,`동현빌-v${version}.html`),inlineIcons(html));
const {examples}=require('./src/examples.js');fs.mkdirSync(path.join(root,'examples'),{recursive:true});
for(const f of fs.readdirSync(path.join(root,'examples')))if(/^\d\d-[a-z-]+\.dh$/.test(f))fs.unlinkSync(path.join(root,'examples',f));
// 내려받는 .dh 예제도 편집기와 같은 규칙으로 들여쓴다: 시작·끝 줄은 맨 앞, 명령은 2칸, 따로 줄에 있는 주석은 3칸
const dhIndent=t=>t.split('\n').map(l=>{const b=l.replace(/^[ \t]+/,'');if(!b)return '';if(b.startsWith('ㅋㅋ'))return '   '+b;const s=b.split('~')[0].replace(/ㅋㅋ.*$/,'').trim();return (s==='나는 동현이냐?'||s==='동현이구나'?'':'  ')+b;}).join('\n');
examples.forEach((e,i)=>fs.writeFileSync(path.join(root,'examples',String(i+1).padStart(2,'0')+'-'+e.id+'.dh'),dhIndent(e.code)+'\n'));
console.log(JSON.stringify({version,workerFile,appFile,dataFile,bytes:Buffer.byteLength(html),examples:examples.length}));
