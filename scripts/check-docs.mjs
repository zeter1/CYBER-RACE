// Read-only local Markdown link and heading-anchor validation for CI.
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, extname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const sourceFiles = ['README.md','README_EN.md','AGENTS.md','SECURITY.md','CHANGELOG.md'];
function walkDocs(folder) {
  return readdirSync(folder,{withFileTypes:true}).flatMap(item => {
    const name=join(folder,item.name);
    return item.isDirectory()?walkDocs(name):(item.isFile()&&extname(name).toLowerCase()==='.md'?[relative(root,name)]:[]);
  });
}
sourceFiles.push(...walkDocs(join(root,'docs')));
function githubSlug(heading) {
  return heading.replace(/<[^>]*>/g,'').replace(/[\x60*_~]/g,'').trim().toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu,'').replace(/\s+/g,'-');
}
const headers=new Map();
function anchors(file) {
  if(headers.has(file))return headers.get(file);
  const text=readFileSync(file,'utf8');
  const result=new Set(),seen=new Map();
  for(const match of text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const raw=githubSlug(match[1]);
    if(!raw)continue;
    const count=seen.get(raw)||0;seen.set(raw,count+1);
    result.add(count?raw+'-'+count:raw);
  }
  headers.set(file,result);
  return result;
}
function referenceError(file,url) {
  if(/^(?:https?:|mailto:|tel:|data:|\/\/)/i.test(url))return null;
  let path=url,hash='';
  try {
    const index=url.indexOf('#');
    if(index>=0){path=url.slice(0,index);hash=decodeURIComponent(url.slice(index+1));}
    path=decodeURIComponent(path.split('?')[0]);
  }catch{return 'malformed URL escape';}
  const target=path.startsWith('/')?resolve(root,'.'+path):resolve(dirname(file),path||'.');
  if(target!==root&&!target.startsWith(root+sep))return 'outside repository';
  if(!existsSync(target))return 'missing local target';
  const actual=statSync(target).isDirectory()?join(target,'README.md'):target;
  if(hash) {
    if(!existsSync(actual)||extname(actual).toLowerCase()!=='.md')return 'anchor on non-Markdown target';
    if(!anchors(actual).has(hash.toLowerCase()))return 'missing heading anchor #'+hash;
  }
  return null;
}
function check() {
  let count=0,external=0;
  const errors=[];
  for(const file of sourceFiles){
    const path=join(root,file);
    if(!existsSync(path)){errors.push(file+': missing source');continue;}
    const raw=readFileSync(path,'utf8');
    const withoutCode=raw.replace(/^(\s{0,3})(\x60{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*$/gm,'');
    const linkPattern=/!?\[[^\]\r\n]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g;
    for(const match of withoutCode.matchAll(linkPattern)) {
      const url=match[1].replace(/^<|>$/g,'');
      const error=referenceError(path,url);
      if(/^(?:https?:|mailto:|tel:|data:|\/\/)/i.test(url)){external++;continue;}
      count++;
      if(error){const line=withoutCode.slice(0,match.index).split('\n').length;errors.push(file+':'+line+' '+url+' → '+error);}
    }
  }
  return {count,external,errors};
}
if(process.argv.includes('--self-test')) {
  assert.equal(githubSlug('Тест: **Hello** (2026)!'),'тест-hello-2026');
  const thisFile=join(root,'README.md');
  assert.equal(referenceError(thisFile,'docs/CODE_MAP.md'),null);
  assert.equal(referenceError(thisFile,'docs/__missing_doc_probe__.md'),'missing local target');
  assert.equal(referenceError(thisFile,'docs/CODE_MAP.md#__invalid_anchor_probe__'),'missing heading anchor #__invalid_anchor_probe__');
  assert.equal(referenceError(thisFile,'../outside-file.md'),'outside repository');
  console.log('DOC_LINK_NEGATIVE_CONTROLS PASS');
}
const result=check();
for(const error of result.errors)console.error('DOC_LINK_FAIL '+error);
if(result.errors.length)process.exitCode=1;
else console.log('DOC_LINKS_PASS '+result.count+' internal references; '+result.external+' external links skipped; '+sourceFiles.length+' Markdown sources');
