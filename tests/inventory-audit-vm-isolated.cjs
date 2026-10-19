const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=fs.readFileSync('bookang.html','utf8');
fs.mkdirSync('backups/inventory-audit-20261020',{recursive:true});
const fn=source.slice(source.indexOf('      async function writeScopedInventoryAudits('),source.indexOf('      async function saveInventoryAuditEntries('));
function fixture(options={}){
 const calls=[],book={id:'B',stock:12,audit:{id:'OLD'}},user={uid:'U',getIdToken:async()=> 'isolated'};
 let pid='P',currentUser=user;
 const ctx={URL,AbortSignal,crypto,Date,Number,Object,JSON,Error,inventoryAuditUncertain:false,rootSaveUncertain:false,
 actor:'검수자',now:()=>new Date().toISOString(),selectedPeriodId:()=>pid,
 firebase:{auth:()=>({currentUser})},root:{toString:()=> 'https://isolated.invalid/dataset'},
 fetch:async(url,opt={})=>{
  calls.push({path:new URL(url).pathname,method:opt.method||'GET',body:opt.body});
  if(!opt.method){
   if(options.readFail)throw new Error('offline');
   if(options.authChange)currentUser={uid:'OTHER'};
   if(options.periodChange)pid='Q';
   return {ok:true,json:async()=>url.pathname.includes('/periods/')?{status:options.closed?'CLOSED':'ACTIVE'}:options.deleted?null:structuredClone(book)};
  }
  if(options.writeFail)throw new Error('lost');
  if(options.denied)return {ok:false,status:401};
  if(options.serverFail)return {ok:false,status:503};
  const patch=JSON.parse(opt.body),ack={books:{},audits:{}};
  for(const [path,value]of Object.entries(patch)){const x={...value,validatedAt:Date.now()};if(path.startsWith('books/'))ack.books[value.bookId]={audit:x};else ack.audits[value.id]=x;}
  if(options.badAck)ack.audits={};
  return {ok:true,json:async()=>ack};
 }};
 vm.createContext(ctx);vm.runInContext(fn,ctx);
 return {ctx,calls,run:()=>ctx.writeScopedInventoryAudits('P',[{bookId:'B',physical:0,memo:'검수'}])};
}
(async()=>{
 const results=[];let f=fixture(),out=await f.run();assert.equal(out.length,1);assert.equal(out[0].system,12);assert.equal(out[0].diff,-12);assert.equal(out[0].previousAuditId,'OLD');
 const patch=JSON.parse(f.calls.at(-1).body);assert.deepEqual(Object.keys(patch).sort(),['audits/'+out[0].id,'books/B/audit'].sort());assert.equal(f.calls.filter(x=>x.method==='PATCH').length,1);results.push('only mirrored audit paths, fresh stock, zero quantity');
 for(const key of ['readFail','authChange','periodChange','closed','deleted']){f=fixture({[key]:true});await assert.rejects(f.run());assert.equal(f.calls.filter(x=>x.method==='PATCH').length,0);results.push(key+' no writes');}
 for(const key of ['writeFail','serverFail','badAck']){f=fixture({[key]:true});await assert.rejects(f.run());assert.equal(f.ctx.inventoryAuditUncertain,true);const n=f.calls.length;await assert.rejects(f.run());assert.equal(f.calls.length,n);results.push(key+' locks blind retry');}
 f=fixture({denied:true});await assert.rejects(f.run());assert.equal(f.ctx.inventoryAuditUncertain,false);results.push('known denial allows deliberate retry');
 fs.writeFileSync('backups/inventory-audit-20261020/vm-test.json',JSON.stringify({results,operationalWrites:0},null,2));console.log(JSON.stringify({passed:results.length,results}));
})().catch(e=>{console.error(e);process.exitCode=1});
