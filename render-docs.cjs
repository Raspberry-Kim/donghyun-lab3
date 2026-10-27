// Build-time Markdown conversion. No parser or network request is needed in the app.
const fs=require('fs'),path=require('path');
const {Marked,Renderer}=require('./vendor/marked.cjs');
const escapeHTML=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const licenseNames={
  'BlackHanSans-OFL.txt':['license-blackhansans','Black Han Sans · SIL Open Font License'],
  'NanumGothicCoding-OFL.txt':['license-nanum','Nanum Gothic Coding · SIL Open Font License'],
  'Pretendard-OFL.txt':['license-pretendard','Pretendard · SIL Open Font License'],
  'DONGHYUN-MIT.txt':['license-donghyun','동현랭 실행기 · MIT'],
  'DONGHYUNVIL-LICENSE.txt':['license-donghyunvil','동현빌 코드·데이터의 이용 조건'],
  'MARKED-MIT.txt':['license-marked','Marked 문서 변환 도구 · MIT 및 원 고지']
};
function documentHref(href){
  if(href==='PROVENANCE.md')return '#offline-provenance';
  if(href==='CREDITS.md')return '#offline-credits';
  if(href==='LICENSE')return '#offline-licenses';
  if(href.startsWith('licenses/')){
    const entry=licenseNames[href.slice(9)];
    if(entry)return '#'+entry[0];
  }
  return href;
}
function safeHref(href){
  const s=String(href).trim();
  if(/[\u0000-\u0020\u007f]/.test(s)||s.startsWith('//')||s.includes('\\'))return null;
  if(/^[a-z][a-z\d+.-]*:/i.test(s)&&!/^https?:\/\//i.test(s))return null;
  return documentHref(s);
}
function renderMarkdown(markdown,headingOffset=1){
  const renderer=new Renderer(),baseTable=renderer.table;
  renderer.html=({text})=>escapeHTML(text);
  renderer.heading=function({tokens,depth}){
    const level=Math.min(6,depth+headingOffset);
    return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
  };
  renderer.link=function({href,title,tokens}){
    const text=this.parser.parseInline(tokens),url=safeHref(href);
    if(url===null)return text;
    return `<a href="${escapeHTML(url)}"${title?` title="${escapeHTML(title)}"`:''}${/^https?:\/\//i.test(url)?' target="_blank" rel="noopener noreferrer"':''}>${text}</a>`;
  };
  renderer.image=function({href,text}){
    const url=safeHref(href);
    return url===null?escapeHTML(text):`<a href="${escapeHTML(url)}">${escapeHTML(text)}</a>`;
  };
  renderer.table=function(token){return `<p class="table-scroll-hint">넓은 표는 좌우로 밀어 확인할 수 있다.</p><div class="table-wrap" tabindex="0" role="region" aria-label="가로로 스크롤할 수 있는 자료 표">${baseTable.call(this,token)}</div>\n`;};
  return new Marked({renderer,gfm:true,breaks:false}).parse(markdown);
}
function renderReferenceDocuments(root){
  const provenance=renderMarkdown(fs.readFileSync(path.join(root,'PROVENANCE.md'),'utf8'));
  const credits=renderMarkdown(fs.readFileSync(path.join(root,'CREDITS.md'),'utf8'));
  const licenses=fs.readdirSync(path.join(root,'licenses')).sort().map(file=>{
    const [id,label]=licenseNames[file]||['license-'+file.replace(/[^a-z\d]/gi,'-'),file];
    const text=fs.readFileSync(path.join(root,'licenses',file),'utf8');
    const body=file==='MARKED-MIT.txt'?`<div class="reference-body license-markdown">${renderMarkdown(text,2)}</div>`:`<pre class="license-text">${escapeHTML(text)}</pre>`;
    return `<details class="license-disclosure" id="${id}" tabindex="-1"><summary>${escapeHTML(label)}</summary>${body}</details>`;
  }).join('\n');
  return [
    `<section id="offline-provenance" class="reference-panel reference-body" data-reference-panel="provenance" tabindex="-1" aria-label="데이터 계보" hidden>${provenance}</section>`,
    `<section id="offline-credits" class="reference-panel reference-body" data-reference-panel="credits" tabindex="-1" aria-label="전체 출처·가공·이용 안내" hidden>${credits}</section>`,
    `<section id="offline-licenses" class="reference-panel" data-reference-panel="licenses" tabindex="-1" aria-label="내장 글꼴·원 코드 라이선스" hidden><h2>내장 글꼴·원 코드 라이선스</h2><p>사용한 글꼴과 코드의 라이선스 및 고지 전문을 보존했다. 항목을 펼쳐 확인할 수 있으며, 접촉 기록 데이터의 별도 이용 조건은 <a href="#offline-credits">전체 출처·이용 안내</a>에서 확인할 수 있다.</p>${licenses}</section>`
  ].join('\n');
}
function integrateReferenceDocuments(html,root){
  if(!html.includes('<!-- REFERENCE_DOCUMENTS -->'))throw Error('Missing reference-document build slot');
  return html.replace('<!-- REFERENCE_DOCUMENTS -->',renderReferenceDocuments(root))
    .replace(/href="(PROVENANCE\.md|CREDITS\.md|licenses\/[^"]+)"(?: target="_blank")?/g,(_,href)=>`href="${escapeHTML(documentHref(href))}"`);
}
module.exports={renderMarkdown,renderReferenceDocuments,integrateReferenceDocuments,escapeHTML,licenseNames};
