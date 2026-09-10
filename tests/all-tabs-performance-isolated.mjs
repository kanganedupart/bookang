import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const html=await readFile(process.env.BOOKFLOW_TEST_HTML||new URL('../bookang.html',import.meta.url),'utf8');
const source=await readFile(new URL('./withdrawal-ui-playwright-isolated.mjs',import.meta.url),'utf8');
let fakeSource=source.slice(source.indexOf('function installFakeFirebase('),source.indexOf('let forcedStaleResponses'));
fakeSource=fakeSource.replaceAll('localStorage.getItem(stateKey)','globalThis.__isolatedState').replaceAll('localStorage.setItem(stateKey, JSON.stringify(seed))','globalThis.__isolatedState=JSON.stringify(seed)').replaceAll('localStorage.setItem(stateKey, JSON.stringify(path.length ? currentRoot : result))','globalThis.__isolatedState=JSON.stringify(path.length ? currentRoot : result)');
const fake=new Function('return '+fakeSource)();
const seed=JSON.parse((await readFile(new URL('../backups/history-readonly-current.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const fixture=new Function(source.slice(source.indexOf('function fnvId('),source.indexOf('function installFakeFirebase('))+';return seedState();')();
seed.staffProfiles=fixture.staffProfiles;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const results=[];
try{for(const [device,width,height] of [['PC',1440,1000],['mobile',390,844]]){
const context=await browser.newContext({viewport:{width,height}});
await context.route('**/*',route=>{
 const url=route.request().url();
 if(url.includes('/version.json'))return route.fulfill({json:{build:html.match(/bookflow-build" content="([^"]+)/)[1]}});
 if(url==='https://performance.invalid/bookang.html')return route.fulfill({contentType:'text/html',body:html});
 if(url.includes('bookflowStaffLogin'))return route.fulfill({json:{firebaseEmail:'isolated@example.invalid',firebasePassword:'isolated',role:'admin'}});
 if(url.includes('gstatic.com/firebasejs/'))return route.fulfill({contentType:'application/javascript',body:''});
 return route.abort();
});
await context.addInitScript(fake,{seed,stateKey:'memory-only'});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.dismiss());
await page.goto('https://performance.invalid/bookang.html');await page.waitForTimeout(1500);await page.locator('#staffName').fill('검수자');await page.locator('#staffPin').fill('0000');await page.getByRole('button',{name:'로그인',exact:true}).click();await page.locator('#studentStatusSearch').waitFor({timeout:10000}).catch(async e=>{console.log(errors,await page.locator('body').innerText());throw e;});
const before=await page.evaluate(()=>globalThis.__isolatedState);
await page.evaluate(()=>{tab='관리';window.manageView='target';render();});
await page.screenshot({path:new URL('../backups/target-'+device+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1').replaceAll('%EA%B0%9C%EB%B0%9C','개발')});
if(await page.locator('.period-date-control').count()){
 const controls=await page.locator('.period-date-control').evaluateAll(nodes=>nodes.map(n=>{const a=n.querySelector('input').getBoundingClientRect(),b=n.querySelector('button').getBoundingClientRect();return {aligned:Math.abs(a.y-b.y)<2,height:n.closest('tr').getBoundingClientRect().height};}));
 assert(controls.length>0&&controls.every(c=>c.aligned&&c.height<85),'date/save must stay inline in compact rows');
 assert.equal(await page.locator('.period-refund-note').count(),1);
 assert.equal(await page.locator('#periodYear').count(),1);
 assert.equal(await page.locator('#periodName').count(),1);
}
const metrics=[];
for(const main of ['학생','신규','반이동','퇴반대기','일괄처리','재고','추가결제','이력','관리']){
 await page.evaluate(main=>{tab=main;render();},main);
 const nav=await page.evaluate(()=>[...document.querySelectorAll('#subtabsHost button')].map(b=>({key:b.dataset.hubKey,text:b.textContent})));
 for(const sub of [null,...nav]){
  if(sub)await page.locator('#subtabsHost button').filter({hasText:sub.text}).first().click();
  const measurement=await page.evaluate(()=>{
   const t=performance.now();render();const renderMs=performance.now()-t;
   const inputs=[...document.querySelectorAll('#screen input')].filter(i=>!i.type||['text','search'].includes(i.type)).filter(i=>/검색|학생명|이름/.test(i.placeholder));
   let maxInputMs=0;
   for(const input of inputs){for(const value of ['강','강승','강승희','강승','']){const t=performance.now();input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));maxInputMs=Math.max(maxInputMs,performance.now()-t);}}
   return {renderMs:Math.round(renderMs),maxInputMs:Math.round(maxInputMs),searchFields:inputs.length};
  });
  await page.waitForTimeout(300);
  metrics.push({main,sub:sub?.text||'',...measurement});
 }
}
assert.equal(await page.evaluate(()=>globalThis.__isolatedState),before,'read-only tabs must not mutate database');
const stock=await page.evaluate(()=>{
 if(typeof inventoryIntakeSummary!=='function')return null;
 const original=S,originalPeriod=window.periodChoiceId;
 try{
  S={...S,movements:{a:{type:'IN',bookId:'A',quantity:10,time:'2026-09-01'},b:{type:'IN',bookId:'A',quantity:5,time:'2026-09-02'},c:{type:'RETURN',bookId:'A',quantity:8},d:{type:'ADJUST',bookId:'A',quantity:100},e:{type:'IN',bookId:'B',quantity:99}}};resetDerivedState();
  const summary=inventoryIntakeSummary('A');
  const node=document.createElement('div');
  for(const [bid,extra,expected] of [['A',false,'10'],['A',true,'5'],['B',true,'-'],['C',false,'-']]){
    node.innerHTML=inventoryIntakeHtml(bid,extra);if(node.textContent!==expected)throw new Error('intake quantity display mismatch');
  }
  window.periodChoiceId='another';const other=inventoryIntakeSummary('A');window.periodChoiceId=originalPeriod;
  return {total:summary.total,additional:summary.additional,count:summary.records.length,first:summary.first.quantity,other:other.total,none:inventoryIntakeSummary('C').records.length};
 }finally{S=original;window.periodChoiceId=originalPeriod;resetDerivedState();}
});
if(stock)assert.deepEqual(stock,{total:15,additional:5,count:2,first:10,other:15,none:0});
await page.evaluate(()=>{tab='재고';window.bookHubView='inventory';render();});
if(await page.locator('#inventorySort').count()){
 const checks=await page.evaluate(()=>{
  const body=document.getElementById('inventoryRows'),nodes=[...body.rows],raw=globalThis.__isolatedState;
  const first=nodes[0],bid=first.dataset.bookId,p=document.getElementById('p'+bid),memo=document.getElementById('a'+bid);
  p.value=String(Number(S.books[bid].stock||0)+12345);p.dispatchEvent(new Event('input',{bubbles:true}));memo.value='정렬 중 보존 확인';
  window.invQuery='국매';document.getElementById('inventoryBookSearch').value='국매';filterInventoryRows('국매');
  const visibility=new Map(nodes.map(n=>[n,n.style.display]));
  for(const mode of ['stockAsc','stockDesc','diffDesc','default']){
   const select=document.getElementById('inventorySort');select.value=mode;select.dispatchEvent(new Event('change',{bubbles:true}));
   const current=[...body.rows];
   if(current.length!==nodes.length||!current.every(n=>nodes.includes(n)&&n.style.display===visibility.get(n)))throw Error('sorting changed row identity or visibility');
   if(mode.startsWith('stock'))for(let i=1;i<current.length;i++){const a=Number(S.books[current[i-1].dataset.bookId].stock||0),b=Number(S.books[current[i].dataset.bookId].stock||0);if(mode==='stockAsc'?a>b:a<b)throw Error('stock order incorrect');}
   if(mode==='diffDesc'&&current[0]!==first)throw Error('draft difference not used');
   if(document.getElementById('p'+bid)!==p||memo.value!=='정렬 중 보존 확인'||window.invQuery!=='국매')throw Error('draft or query lost');
  }
  if(raw!==globalThis.__isolatedState)throw Error('sort wrote data');
  const tops=[...document.querySelectorAll('.inventory-filter label')].map(n=>Math.round(n.getBoundingClientRect().top));
  window.invQuery='';window.invSort='default';inventory();
  return {oneLine:new Set(tops).size===1};
 });
 if(device==='PC')assert(checks.oneLine,'desktop conditions must remain one row');
}
await page.screenshot({path:new URL('../backups/stock-'+device+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1').replaceAll('%EA%B0%9C%EB%B0%9C','개발')});
if(stock){const receipt=page.locator('.inventory-intakes button').first();await receipt.click();await page.getByRole('dialog',{name:'입고내역'}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'닫기'}).click();}
const saves=await page.evaluate(async()=>{
 const originalBooks=JSON.stringify(S.books),originalMovements=JSON.stringify(S.movements);
 tab='학생';window.studentHubView='new';window.newNamesDraft='격리성능검수';render();document.getElementById('newNames').value='격리성능검수';
 const t=performance.now();await saveNewStudentNames();const nameMs=Math.round(performance.now()-t);
 const student=arr(S.students).find(s=>s.name==='격리성능검수');
 if(!student)throw new Error('isolated registration did not save');
 const start=performance.now();await saveNewStudentNames();const repeatMs=Math.round(performance.now()-start);
 const target=arr(S.classes).find(c=>c.periodId===selectedPeriodId()&&c.active!==false);
 if(!target)throw new Error('no current test class');
 window.newAssigned=[target.id];const a=performance.now();await assignNewStudent(student.id);const assignMs=Math.round(performance.now()-a);
 if(!activePeriodClassIds(S,student.id).includes(target.id))throw new Error('assignment not saved');
 return {nameMs,repeatMs,assignMs,created:arr(S.students).filter(s=>s.name==='격리성능검수').length,booksUnchanged:JSON.stringify(S.books)===originalBooks,movementsUnchanged:JSON.stringify(S.movements)===originalMovements};
});
assert.equal(saves.created,1);assert(saves.booksUnchanged&&saves.movementsUnchanged);
assert.deepEqual(errors,[]);
results.push({device,metrics,saves,operationalWrites:0});await context.close();
}}finally{await browser.close();}
console.log(JSON.stringify(results,null,2));
if(process.env.BOOKFLOW_PERF_REPORT)await writeFile(process.env.BOOKFLOW_PERF_REPORT,JSON.stringify(results,null,2));
