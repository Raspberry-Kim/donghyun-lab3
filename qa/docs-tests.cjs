const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..'),{renderMarkdown,renderReferenceDocuments,escapeHTML}=require('../render-docs.cjs'),{lexer}=require('../vendor/marked.cjs');
let count=0;function check(n,f){f();count++;console.log('PASS',n);}
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
for(const name of ['PROVENANCE.md','CREDITS.md'])check('All blocks and real bold: '+name,()=>{
  const text=read(name),html=renderMarkdown(text);
  assert(!html.includes('**'));assert(html.includes('<strong>'));
  for(const block of lexer(text).filter(x=>x.type!=='space'))assert(html.includes(renderMarkdown(block.raw).trim()),block.type);
});
check('All licenses preserved',()=>{const html=renderReferenceDocuments(root);for(const f of fs.readdirSync(path.join(root,'licenses')))if(f!=='MARKED-MIT.txt')assert(html.includes(escapeHTML(read('licenses/'+f))),f);});
check('No unsafe raw HTML or script URLs',()=>{const h=renderMarkdown('<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)');assert(!h.includes('<script>'));assert(!h.includes('href="javascript:'));});
check('Source repository, commit and data download are discoverable',()=>{
  const html=read('src/index.html');assert(html.includes('id="data-download"'));
  for(const n of ['CREDITS.md','PROVENANCE.md','LICENSE','data/SOURCE.md'])assert(read(n).includes('github.com/skissler/haslemere'),n);
  assert(read('PROVENANCE.md').includes('dc49e83406bbd4788d0a5baeca6ceeba53241d7e'));
});
check('Data license status is stated honestly',()=>{for(const n of ['CREDITS.md','PROVENANCE.md','README.md']){const t=read(n);assert(t.includes('GPL-3')&&/적지 않았|적혀 있지 않/.test(t),n);}});
check('Only code-driven simulation controls',()=>{const html=read('src/index.html');assert(!/type="range"/.test(html));assert(!/onpointerdown|onmousedown|ontouchstart/.test(html));assert(html.includes('조작은 오직 동현랭으로'));});
check('Version 0.1 and Donghyun-lang 1.53 are consistent',()=>{
  assert(require('../package.json').version==='0.34.0');assert(read('src/index.html').includes('v0.3'));assert(read('SPEC.md').includes('v0.3'));assert(read('CHANGELOG.md').includes('## v0.3'));
  assert(read('src/donghyun.js').includes('version: "1.53.0"'));assert(read('README.md').includes('v1.53'));
});
check('Counts are written as 숫자+단위, not 뉴런-style labels',()=>{for(const n of ['README.md','src/index.html','PROVENANCE.md','CREDITS.md'])assert(!/\d뉴런/.test(read(n)),n);});
check('Series nav has four entries with 동현빌 current',()=>{const html=read('src/index.html');assert(html.includes('data-series="village" aria-current="page"'));assert((html.match(/class="series-item"/g)||[]).length===4);});
check('Pathogen table in SPEC matches data',()=>{const d=JSON.parse(read('data/village.json')),spec=read('SPEC.md');for(const p of d.pathogens)assert(spec.includes(String(p.a)),p.name+' a');});
console.log('DOCUMENT TOTAL',count);
