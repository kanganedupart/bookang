const assert=require('node:assert/strict'),fs=require('node:fs');
const {buildRules,dataset}=require('../tools/inventory-audit-rules.cjs');
fs.mkdirSync('backups/inventory-audit-20261020',{recursive:true});
const base='http://127.0.0.1:19027',ns='demo-bookflow-default-rtdb';
const jwt=Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:'isolated',user_id:'isolated',aud:'demo-bookflow',iss:'https://securetoken.google.com/demo-bookflow',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.';
async function req(path,method,body,admin=false){return fetch(base+path+'.json?ns='+ns+(admin?'':'&auth='+jwt),{method,headers:admin?{Authorization:'Bearer owner'}:{},body:body===undefined?undefined:JSON.stringify(body)});}
function audit(id,bid='B',system=10){return {id,bookId:bid,periodId:'P',physical:9,system,diff:9-system,memo:'검수',actor:'검수자',time:new Date().toISOString(),saveProtocol:'SCOPED_AUDIT_V1',validatedAt:{'.sv':'timestamp'},previousAuditId:''};}
function patch(x){return {['books/'+x.bookId+'/audit']:x,['audits/'+x.id]:x};}
(async()=>{
 const rules=buildRules({rules:{[dataset]:{'.read':true,'.write':"auth != null && auth.uid === 'isolated'"}}});
 const installed=await req('/.settings/rules','PUT',rules,true);assert(installed.ok,await installed.text());
 const seed={periods:{P:{status:'ACTIVE'},Q:{status:'CLOSED'},R:{status:'ACTIVE'}},books:{B:{id:'B',stock:10,periodIds:{P:'P'}},C:{id:'C',stock:0,periodIds:{P:'P'}}},students:{S:{holdings:{B:2}}},movements:{M:{quantity:10}}};
 const reset=async()=>{const r=await req('/'+dataset,'PUT',seed,true);assert(r.ok)};
 const read=async()=>{const r=await req('/'+dataset,'GET',undefined,true);return r.json()};
 const cases=[];
 await reset();let x=audit('A1'),r=await req('/'+dataset,'PATCH',patch(x));assert(r.ok,await r.text());let state=await read();assert.deepEqual(state.books.B.audit,state.audits.A1);assert.equal(state.books.B.stock,10);assert.deepEqual(state.students,seed.students);cases.push('atomic mirrored audit');
 // Existing full-root distribution and adjustment are not subject to stale-audit validation.
 state.books.B.stock=8;state.students.S.holdings.B=4;r=await req('/'+dataset,'PUT',state);assert(r.ok,await r.text());cases.push('whole root distribution unchanged');
 state=await read();state.books.B.audit.system=9;state.books.B.audit.diff=0;state.books.B.stock=9;state.audits.A1.adjustedAt='test';r=await req('/'+dataset,'PUT',state);assert(r.ok,await r.text());cases.push('existing stock adjustment unchanged');
 for(const [name,make] of [
  ['stale stock',()=>patch(audit('A2','B',11))],
  ['missing book',()=>patch(audit('A2','NONE'))],
  ['closed period',()=>patch({...audit('A2'),periodId:'Q'})],
  ['wrong active period',()=>patch({...audit('A2'),periodId:'R'})],
  ['history missing',()=>({'books/B/audit':audit('A2')})],
  ['recent missing',()=>({'audits/A2':audit('A2')})],
  ['mismatched history',()=>({...patch(audit('A2')),'audits/A2':{...audit('A2'),physical:5}})],
  ['negative quantity',()=>patch({...audit('A2'),physical:-1,diff:-11})],
  ['fraction quantity',()=>patch({...audit('A2'),physical:0.5,diff:-9.5})],
  ['stale previous audit',()=>patch({...audit('A2'),previousAuditId:'wrong'})],
  ['batch all-or-none',()=>({...patch(audit('A2')),...patch(audit('A3','C',5))})],
 ]){await reset();r=await req('/'+dataset,'PATCH',make());assert.equal(r.status,401,name+': '+await r.text());assert.deepEqual(await read(),seed,name);cases.push(name);}
 await reset();r=await req('/'+dataset,'PATCH',patch(audit('ZERO','C',0)));assert(r.ok,await r.text());cases.push('zero stock');
 await reset();r=await req('/'+dataset,'PATCH',{...patch(audit('A2')),...patch(audit('A3','C',0))});assert(r.ok,await r.text());cases.push('valid batch');
 state=await read();const historic=structuredClone(state);historic.books.B.stock=7;historic.books.B.audit.system=99;historic.audits.A2.system=99;r=await req('/'+dataset,'PUT',historic);assert(r.ok,await r.text());cases.push('historical backup restore');
 const unauthorized=await fetch(base+'/'+dataset+'.json?ns='+ns,{method:'PATCH',body:JSON.stringify(patch(audit('BAD')))});assert.equal(unauthorized.status,401);cases.push('authorization unchanged');
 fs.writeFileSync('backups/inventory-audit-20261020/rules-test.json',JSON.stringify({cases,operationalWrites:0},null,2));console.log(JSON.stringify({passed:cases.length,cases}));
})().catch(e=>{console.error(e);process.exitCode=1});
