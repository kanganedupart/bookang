import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const html=await readFile(new URL('../bookang.html',import.meta.url),'utf8');
const previous=await readFile(new URL('./withdrawal-ui-playwright-isolated.mjs',import.meta.url),'utf8');
const extract=(start,end)=>new Function('return '+previous.slice(previous.indexOf(start),previous.indexOf(end)))();
const fake=extract('function installFakeFirebase(', 'let forcedStaleResponses');
const fixture=new Function(previous.slice(previous.indexOf('function fnvId('),previous.indexOf('function installFakeFirebase('))+';return seedState')();
let state=process.env.BOOKFLOW_HISTORY_SNAPSHOT?JSON.parse((await readFile(process.env.BOOKFLOW_HISTORY_SNAPSHOT,'utf8')).replace(/^\uFEFF/,'')):fixture();
if(process.env.BOOKFLOW_HISTORY_SNAPSHOT){
  const original=state, selected=Object.values(original.students).filter(s=>/임건우|강승희\(테스트\)/.test(s.name)), ids=new Set(selected.map(s=>s.id));
  const related=m=>ids.has(m.studentId)||Object.keys(m.studentNames||{}).some(id=>ids.has(id))||Object.keys(m.studentDeltas||{}).some(id=>ids.has(id));
  const subset=record=>Object.fromEntries(Object.entries(record||{}).filter(([,m])=>related(m)));
  state={...fixture(),currentPeriodId:original.currentPeriodId,periods:original.periods,books:original.books,classes:original.classes,students:Object.fromEntries(selected.map(s=>[s.id,s])),movements:subset(original.movements),refundHistory:subset(original.refundHistory),refundTaskEvents:subset(original.refundTaskEvents),refundTasks:subset(original.refundTasks),chargeHistory:{},chargeTasks:{},classEvents:{},ecodingEvents:{}};
}
if(!process.env.BOOKFLOW_HISTORY_SNAPSHOT){
  const pid=state.currentPeriodId;
  state.students.L1={id:'L1',name:'임건우7179',active:true};
  state.students.L2={id:'L2',name:'임건우5242',active:true};
  state.movements.H1={id:'H1',periodId:pid,time:'2026-09-08T00:41:00+09:00',type:'DISTRIBUTE',bookId:'B1',bookName:'국매 9-1주',quantity:-2,studentIds:{L2:'L2',SACTIVE:'SACTIVE'},studentNames:{L2:'임건우5242',SACTIVE:'재원검수'},studentDeltas:{L2:1,SACTIVE:1},classNames:{L2:'옛반A',SACTIVE:'옛반B'},stockBefore:10,stockAfter:8};
  state.movements.H2={id:'H2',periodId:pid,time:'2026-09-09T00:41:00+09:00',type:'DISTRIBUTE',bookId:'B2',bookName:'사회문화',quantity:-1,studentIds:{L1:'L1'},studentNames:{L1:'임건우7179'},studentDeltas:{L1:1}};
}
const build=html.match(/bookflow-build" content="([^"]+)/)[1];
const key='__history_isolated__';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const outputs=[];
try{
for(const [name,width,height] of [['pc',1365,900],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height}});
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.includes('/version.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify({build})});
    if(url.startsWith('https://history-audit.invalid/bookang.html'))return route.fulfill({contentType:'text/html',body:html});
    if(url.includes('bookflowStaffLogin'))return route.fulfill({contentType:'application/json',body:JSON.stringify({firebaseEmail:'isolated@example.invalid',firebasePassword:'isolated',role:'admin'})});
    if(url.includes('gstatic.com/firebasejs/'))return route.fulfill({contentType:'application/javascript',body:''});
    return route.abort();
  });
  await context.addInitScript(fake,{seed:state,stateKey:key});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>{errors.push(String(e));console.error(String(e));});
  await page.goto('https://history-audit.invalid/bookang.html');
  await page.waitForTimeout(1000);
  if(await page.locator('#staffName').count()){
    await page.locator('#staffName').fill('검수자');await page.locator('#staffPin').fill('0000');
    await page.getByRole('button',{name:'로그인',exact:true}).click();
  } else console.log((await page.locator('body').innerText()).slice(0,1200));
  await page.locator('[data-main-tab="이력"]').click();
  await page.locator('#histFrom').fill('2026-08-01');await page.locator('#histTo').fill('2026-09-30');
  const before=await page.evaluate(k=>localStorage.getItem(k),key);
  assert.equal(await page.locator('#histScope').inputValue(),'ALL','unified search must be the default');
  await page.locator('#histSearch').focus();
  await page.locator('#histSearch').evaluate(input=>{
    input.value='강승';input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    input.value='강승희';input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'희'}));
  });
  await page.waitForTimeout(400);
  assert.notEqual(await page.locator('#histCount').innerText(),'검색 중…','Korean final syllable composition must not leave the old pending search forever');
  assert(await page.locator('#histSuggestions').isVisible(),'Korean IME must show candidates without requiring Enter or blur');
  assert.match(await page.locator('#histSuggestions').innerText(),/강승희/);
  await page.locator('#histSearch').evaluate(input=>input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
  await page.locator('#histSearch').fill('임');
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#histSuggestions').isVisible(),false,'one character must not open suggestions');
  await page.locator('#histSearch').fill('임건우');
  await page.locator('#histSuggestions button').first().waitFor();
  const candidates=await page.locator('#histSuggestions button').allTextContents();
  assert(candidates.some(x=>x.includes('7179'))&&candidates.some(x=>x.includes('5242')),'same-name students must be separately selectable');
  await page.locator('#histSuggestions button').filter({hasText:'5242'}).click();
  const sid=await page.evaluate(()=>window.histEntity.id);
  const rows=page.locator('#hist tr');assert(await rows.count()>0);
  for(const row of await rows.all()){
    assert.equal(await row.getAttribute('data-history-student'),sid);
    assert.match(await row.locator('td').nth(3).innerText(),/5242/);
    assert.match(await row.locator('td').nth(4).innerText(),/1권/);
  }
  assert.equal(await page.locator('#hist .history-event-details li').count(),0,'hidden bulk lists must not be built while typing');
  assert.equal(await page.locator('#hist').getByText('상세 보기',{exact:true}).count(),0,'no repeated detail buttons');
  assert.match(await rows.first().locator('td').nth(4).innerText(),/배부 1권/);
  assert.equal(await rows.first().locator('.history-content-preview').evaluate(e=>getComputedStyle(e).whiteSpace),'nowrap');
  await page.screenshot({path:new URL('../backups/history-'+name+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1').replaceAll('%EA%B0%9C%EB%B0%9C','개발')});
  const detail=rows.first().locator('.history-event-details');await detail.locator(':scope > summary').click();
  await detail.getByText('전체 일괄처리 기준 재고',{exact:true}).waitFor();
  assert.match(await detail.innerText(),/전체 일괄처리 기준 재고/);
  const panel=detail.locator(':scope > div'),rect=await panel.boundingBox(),handle=detail.locator('.history-dialog-handle');
  const h=await handle.boundingBox(),close=await detail.getByRole('button',{name:'닫기',exact:true}).boundingBox();
  assert(close.x>h.x+h.width/2,'close button must be on the right');
  await page.mouse.move(h.x+30,h.y+12);await page.mouse.down();await page.mouse.move(h.x+40,h.y+22,{steps:3});await page.mouse.up();
  const moved=await panel.boundingBox();assert(moved.x!==rect.x||moved.y!==rect.y,'detail must move by dragging the title');
  await page.screenshot({path:new URL('../backups/history-detail-'+name+'.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1').replaceAll('%EA%B0%9C%EB%B0%9C','개발')});
  await detail.getByRole('button',{name:'닫기',exact:true}).click();
  assert.equal(await detail.getAttribute('open'),null);
  await page.locator('#histSearch').fill('국매 9-1주');
  await page.locator('#histSuggestions button').filter({hasText:'교재'}).first().waitFor();
  await page.locator('#histSuggestions button').filter({hasText:'교재'}).first().click();
  for(const row of await page.locator('#hist tr').all())assert.match(await row.locator('td').nth(4).innerText(),/국매 9-1주/);
  assert.deepEqual(await page.evaluate(()=>['퇴반등록','퇴반완료','퇴반취소','DISTRIBUTE','IN'].map(type=>historyBusinessReason({type}))),['','','','NORMAL','NORMAL']);
  assert.match(await page.evaluate(()=>historyResultHtml({m:{type:'퇴반완료',time:'2026-09-10',memo:'자동 설명'},participants:[],books:[{name:'교재'}],who:'검수',quantity:1},0)),/환불 계산 대상 1권/);
  await page.evaluate(()=>{
    const row={m:{type:'IN',time:'2026-09-10'},participants:[],books:[{name:'메모없는 교재'}],who:'전체',quantity:2};
    window.histRenderedRows=[row];document.getElementById('hist').innerHTML=historyResultHtml(row,0);
  });
  assert.equal(await page.locator('#hist .history-content-preview').isVisible(),false);
  await page.locator('#hist .history-target-link').click();
  await page.getByRole('dialog',{name:'업무이력 상세'}).waitFor();
  await page.getByRole('dialog').getByRole('button',{name:'닫기'}).click();
  const checks=await page.evaluate(()=>{
    const m={type:'DISTRIBUTE',studentIds:{A:'A',B:'B'},studentNames:{A:'동명1234',B:'동명5678'},studentDeltas:{A:2,B:3},classNames:{A:'과거반A',B:'과거반B'},bookName:'테스트교재',quantity:5};
    return {student:historyProjection(m,'STUDENT','동명','A').map(x=>[x.studentId,x.quantity]),classes:historyProjection(m,'CLASS','과거반A').map(x=>[x.who,x.quantity,x.matchedParticipants.map(s=>s.id)]),wrong:historyProjection(m,'CLASS','현재반').length,unknown:historyProjection({...m,studentDeltas:{}},'STUDENT','동명','A')[0].quantity};
  });
  assert.deepEqual(checks,{student:[['A',2]],classes:[['과거반A',2,['A']]],wrong:0,unknown:null});
  const isolation=await page.evaluate(()=>{
    const original=S,pid=window.periodChoiceId;
    try{
      S={...S,movements:{PA:{type:'IN',bookId:'A',bookName:'동일교재',periodId:'PA',time:'2026-09-01',quantity:1},PB:{type:'IN',bookId:'B',bookName:'동일교재',periodId:'PB',time:'2026-09-01',quantity:9}},students:{},refundTasks:{},refundHistory:{},refundTaskEvents:{},chargeTasks:{},chargeHistory:{},ecodingEvents:{},classEvents:{}};
      return ['PA','PB','PA'].map(p=>{window.periodChoiceId=p;resetDerivedState();return [...historyPrepared().entities.values()].filter(e=>e.kind==='BOOK').map(e=>e.id).sort();});
    }finally{S=original;window.periodChoiceId=pid;resetDerivedState();}
  });
  assert.deepEqual(isolation,[['A'],['B'],['A']],'same-name books in opposite periods must never leak into candidates');
  await page.locator('#histSearch').fill('임건우');
  await page.locator('#histSuggestions button').first().waitFor();
  await page.locator('#histSearch').press('ArrowDown');await page.locator('#histSearch').press('Enter');
  assert.equal(await page.evaluate(()=>window.histEntity.kind),'STUDENT');
  await page.locator('#histSearch').fill('');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>window.histEntity),null,'deleting text must clear the selected identity');
  const typing=await page.evaluate(()=>{
    const original=window.histApply;window.typingApplyCalls=0;
    window.histApply=function(){window.typingApplyCalls++;return original();};
    const input=document.getElementById('histSearch');
    for(const value of ['임','임건','임건우','임건','임','']){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
    return window.typingApplyCalls;
  });
  assert.equal(typing,0,'typing and deleting must not synchronously rebuild history');
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>window.typingApplyCalls),1,'rapid input must apply only the final search');
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),before,'history reads must not modify any data');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page must not overflow horizontally');
  assert.deepEqual(errors,[]);outputs.push({viewport:name,studentId:sid,rows:await rows.count(),readOnly:true});
  await context.close();
}
}finally{await browser.close();}
console.log(JSON.stringify(outputs,null,2));
