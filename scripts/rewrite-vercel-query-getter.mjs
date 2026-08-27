import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API_DIR='api';
const HELPER="import { requestQuery } from './_request-query.js';\n";
const changed=[];

for(const entry of await readdir(API_DIR,{withFileTypes:true})){
  if(!entry.isFile()||!entry.name.endsWith('.js')||entry.name==='_request-query.js')continue;
  const path=join(API_DIR,entry.name);
  let source=await readFile(path,'utf8');
  const next=source.replace(/\breq\??\.query\b/g,'requestQuery(req)');
  if(next===source)continue;
  source=next;
  if(!source.includes("from './_request-query.js'"))source=HELPER+source;
  await writeFile(path,source,'utf8');
  changed.push(path);
}

console.log(JSON.stringify({changedCount:changed.length,changed},null,2));
if(!changed.length)throw new Error('No req.query usages found to rewrite');
