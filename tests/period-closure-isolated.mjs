import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const html=await readFile(process.env.BOOKFLOW_TEST_HTML||new URL('../bookang.html',import.meta.url),'utf8');
const source=await readFile(new URL('./withdrawal-ui-playwright-isolated.mjs',import.meta.url),'utf8');
const seed=new Function(source.slice(source.indexOf('function fnvId('),source.indexOf('function installFakeFirebase('))+';return seedState();')();
let fakeSource=source.slice(source.indexOf('function installFakeFirebase('),source.indexOf('let forcedStaleResponses'));
fakeSource=fakeSource.replaceAll('localStorage.getItem(stateKey)','globalThis.__isolatedState').replaceAll('localStorage.setItem(stateKey, JSON.stringify(seed))','globalThis.__isolatedState=JSON.stringify(seed)').replaceAll('localStorage.setItem(stateKey, JSON.stringify(path.length ? currentRoot : result))','globalThis.__isolatedState=JSON.stringify(path.length ? currentRoot : result)');
const fake=new Function('return '+fakeSource)();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{for(const [device,width,height] of [['PC',1440,1000],['mobile',390,844]]){
 const context=await browser.newContext({viewport:{width,height}});
 await context.route('**/*',route=>{
  const url=route.request().url();
  if(url.includes('/version.json'))return route.fulfill({json:{build:html.match(/bookflow-build" content="([^"]+)/)[1]}});
  if(url==='https://period.invalid/bookang.html')return route.fulfill({contentType:'text/html',body:html});
  if(url.includes('bookflowStaffLogin'))return route.fulfill({json:{firebaseEmail:'isolated@example.invalid',firebasePassword:'isolated',role:'admin'}});
  if(url.includes('gstatic.com/firebasejs/'))return route.fulfill({contentType:'application/javascript',body:''});
  return route.abort();
 });
 await context.addInitScript(fake,{seed,stateKey:'period-test'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.dismiss());
 await page.goto('https://period.invalid/bookang.html');await page.waitForTimeout(1500);
 await page.locator('#staffName').fill('검수자');await page.locator('#staffPin').fill('0000');await page.getByRole('button',{name:'로그인',exact:true}).click();await page.locator('#studentStatusSearch').waitFor();
 const result=await page.evaluate(async()=>{
  const base=structuredClone(S),pid=selectedPeriodId(),before=globalThis.__isolatedState,originalTransaction=transaction,originalAlert=window.alert;
  const actions=['DISTRIBUTE','RETURN','IN','AUDIT','ADJUST','CHARGE','REFUND','PRICE','STUDENT_EDIT','MANAGEMENT','IMPORT'];
  const closingAllowed=['RETURN','AUDIT','ADJUST','CHARGE','REFUND','PRICE'];
  let matrix=0,blockedCalls=0;window.alert=()=>{};
  try{
   for(const status of ['ACTIVE','CLOSING','CLOSED']){
    S=structuredClone(base);S.periods[pid].status=status;window.periodChoiceId=pid;resetDerivedState();
    for(const action of actions){
     const expected=status==='ACTIVE'||status==='CLOSING'&&closingAllowed.includes(action);
     let ran=false;
     transaction=async fn=>{const state=structuredClone(S);const out=fn(state);return {committed:out!==false,snapshot:{val:()=>state}};};
     const result=await periodTransaction(pid,action,()=>{ran=true;});
     if(result.committed!==expected||ran!==expected)throw Error('permission matrix '+status+'/'+action);
     matrix++;
    }
   }
   // A live-looking client must still be rejected against a newly closed server snapshot.
   S=structuredClone(base);window.periodChoiceId=pid;
   for(const status of ['CLOSING','CLOSED'])for(const action of actions){
    transaction=async fn=>{const state=structuredClone(base);state.periods[pid].status=status;const out=fn(state);return {committed:out!==false,snapshot:{val:()=>state}};};
    let ran=false;const result=await periodTransaction(pid,action,()=>{ran=true;});
    const expected=status==='CLOSING'&&closingAllowed.includes(action);
    if(ran!==expected||result.committed!==expected)throw Error('stale client bypass '+status+'/'+action);
   }
   transaction=async fn=>{window.periodChoiceId='OTHER';const out=fn(structuredClone(base));return {committed:out!==false};};
   if((await periodTransaction(pid,'DISTRIBUTE',()=>{throw Error('period switch mutated');})).committed)throw Error('period switch allowed');
   transaction=originalTransaction;S=structuredClone(base);window.periodChoiceId=pid;S.periods[pid].status='CLOSED';resetDerivedState();
   const noArgs=[commitBulkClass,commitAcademyBulk,commitBulkBook,distributeNewStudent,commitClassReturn,commitBookReturn,commitAcademyReturn,setExitReturnDecision,doIntake,commitNewBookIntake,audit,adjustToPhysical,setExitRefundDecision,completeRefund,excludeStudentBook,restoreStudentBook,toggleNewStudentComplete,saveNewStudentNames,assignNewStudent,moveStudent,withdrawStudent,withdrawStudentKeepBooks,completeClassMoveWork,cancelCompletedWithdrawal,unlinkClassBook,createClass,closeClass,reopenClass,saveBookDistributionState,setBookDistributionClosed,saveBookDistributionEndDate,createBook,editUnusedBook,deleteUnusedBook,archiveBook,saveImport,saveBookPrice];
   for(const fn of noArgs){await fn();blockedCalls++;}
   for(const type of ['DISTRIBUTE','RETURN']){await commitBundle(type);await commitBundleSpecific(type);await commitMove('BHELD',type);await allForStudent('STEST',type);blockedCalls+=4;}
   if(before!==globalThis.__isolatedState)throw Error('blocked operation changed database');
   const ledgerState={periods:{A:{id:'A',status:'ACTIVE'},B:{id:'B',status:'CLOSED'}},students:{X:{id:'X',holdings:{BOOK:1}}},books:{BOOK:{id:'BOOK'}},movements:{M:{id:'M',type:'DISTRIBUTE',bookId:'BOOK',periodId:'B',studentDeltas:{X:1},periodStudentDeltas:{B:{X:1}}}}};
   if(returnPeriodDeltas(ledgerState,'BOOK',{X:1},'A')!==null)throw Error('active target returned closed target stock');
   ledgerState.periods.B.status='CLOSING';
   const returned=returnPeriodDeltas(ledgerState,'BOOK',{X:1},'B');
   if(returned?.B?.X!==-1)throw Error('closing target return incorrectly blocked');
   const pendingState={...ledgerState,refundTasks:{R:{id:'R',periodId:'B',status:'PENDING'}}};
   if(periodOutstanding(pendingState,'B').refunds.length!==1||periodOutstanding(pendingState,'A').refunds.length!==0)throw Error('pending refund period mismatch');
   // Closing/closed stay selectable; switching away and back must not reopen the period.
   S.periods.OTHER={id:'OTHER',name:'반대 대상',year:2027,status:'ACTIVE'};resetDerivedState();
   for(const selected of [pid,'OTHER',pid]){window.periodChoiceId=selected;tab='관리';window.manageView='target';render();if(selectedPeriodId()!==selected)throw Error('selection lost');}
   if(S.periods[pid].status!=='CLOSED'||!document.querySelector('#periodBar').textContent.includes('조회만'))throw Error('closed lookup state lost');
   tab='이력';render();if(!document.getElementById('histSearch'))throw Error('history unavailable');
   if(!ECODING_OPERATION_LOCKED)throw Error('sync lock changed');
   return {matrix,blockedCalls,readOnly:before===globalThis.__isolatedState};
  }finally{transaction=originalTransaction;window.alert=originalAlert;S=base;window.periodChoiceId=pid;resetDerivedState();}
 });
 assert.deepEqual(errors,[]);assert.equal(result.blockedCalls,45);console.log(JSON.stringify({device,...result}));await context.close();
}}finally{await browser.close();}
