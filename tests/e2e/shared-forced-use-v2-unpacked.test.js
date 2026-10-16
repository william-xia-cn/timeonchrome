const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { isolatedExtension } = require('./helpers/isolated-extension');

const harness = `
import { configureSharedAccessRuntime as configureV2FixtureRuntime } from './product/shared-access-runtime.js';
import { projectSharedAccessPolicyV2 as projectV2FixturePolicy } from './core/shared-contracts/1.54.0/shared-access.js';
import * as serviceV2Fixture from './core/shared-contracts/1.54.0/shared-reminder-lifecycle.js';
import { sourceStatisticsWeekRange as fixtureV2Range } from './infra/source-statistics-shadow.js';
import { getCurrentModeSnapshot as readV2FixtureMode } from './product/mode-service.js';
let v2FixturePolicy, v2FixtureIdentity, v2FixtureState = null, v2FixtureReceipt = null;
let v2FixtureVisibleMono = null, v2FixtureVisibleBoot = null;
let v2FixtureOffset = 0, v2FixtureWebSeconds = 0, v2FixtureVersion = 1, v2FixtureExecution = null;
let v2FixtureConfirmed = 0, v2FixtureClock = {bootId:'isolated-service-v2',lastMonotonicMs:0,accumulatedMs:0};
const v2FixtureGrants = new Map(), v2FixtureConsumed = new Set();
const v2FixtureMono = () => Math.floor(performance.now()) + v2FixtureOffset;
const v2FixtureMessages = [];
const v2FixtureBoot = 'isolated-service-v2';
function v2FixtureContext() { return { state: v2FixtureState, scopeCurrent: true, presenterCurrent: true,
  currentPolicyIdentity: v2FixtureIdentity, currentStateRevision: v2FixtureState.stateRevision,
  executionEnabled: true, nowMs: Date.now(), monotonicNowMs: v2FixtureMono(), bootId: v2FixtureBoot,
  visibleBootId: v2FixtureVisibleBoot, visibleMonotonicMs: v2FixtureVisibleMono }; }
async function v2FixtureRequest(method, payload) {
  v2FixtureMessages.push({ method, request: structuredClone(payload) });
  if(method==='acknowledgeBrowserExecution') {
    const ack=serviceV2Fixture.validateSharedBrowserExecutionAckV2(payload);
    if(ack.executionId!==v2FixtureExecution?.executionId||ack.leaseId!=='isolated-v2-lease')throw Error('invalid isolated execution ACK');
    const duplicate=v2FixtureConsumed.has(ack.executionId);v2FixtureConsumed.add(ack.executionId);
    const response={ok:true,receipt:{executionId:ack.executionId,outcome:ack.outcome,duplicate},outcome:ack.outcome};
    v2FixtureMessages.at(-1).response=structuredClone(response);
    v2FixtureExecution=null;v2FixtureState={...v2FixtureState,status:'withdrawn',resolution:null};
    return response;
  }
  if (method !== 'getSharedReminderState') {
    const transition = method === 'acknowledgeSharedReminderDelivery'
      ? serviceV2Fixture.acknowledgeSharedReminderDeliveryV2(v2FixtureContext(), payload)
      : serviceV2Fixture.resolveSharedReminderV2(v2FixtureContext(), payload);
    v2FixtureState = transition.state;
    v2FixtureVisibleMono = transition.visibleMonotonicMs; v2FixtureVisibleBoot = transition.visibleBootId;
    if(v2FixtureState.status==='resolved') {
      v2FixtureConfirmed=v2FixtureState.confirmedAtUsageSeconds??v2FixtureConfirmed;
      if(v2FixtureState.resolution==='continue')v2FixtureGrants.set(v2FixtureState.ruleScopeKey,new Set(v2FixtureState.reasonCodes));
      else v2FixtureExecution={schemaVersion:2,roundId:v2FixtureState.roundId,reminderId:v2FixtureState.reminderId,
        deliveryId:v2FixtureState.deliveryId,policyRevision:v2FixtureState.policyRevision,stateRevision:v2FixtureState.stateRevision,
        policyIdentity:v2FixtureIdentity,executionId:crypto.randomUUID(),leaseId:'isolated-v2-lease',activityId:v2FixtureReceipt.message.activityId,
        targetSource:'browser',effect:'request-normal-close',maxAgeMs:5000};
    }
  }
  const response = { ok: true, state: structuredClone(v2FixtureState), browserExecution: structuredClone(v2FixtureExecution),
    requestStartedMonotonicMs:Math.floor(performance.now()) };
  v2FixtureMessages.at(-1).response = structuredClone(response);
  return response;
}
globalThis.startSharedV2Fixture = async () => {
  const previous = await getConfig();
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const hour = Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
  const start = (hour + 2) % 24;
  const cfg = { ...previous, enabled: true, mode: 'study', isInitialized: true,
    studyList: [], compositeList: [], restrictedEntertainmentList: ['127.0.0.1'], unsafeList: [], domainQuotas: {},
    customStudyList: [], customCompositeList: [], customRestrictedEntertainmentList: ['127.0.0.1'],
    timeQuota: { accountingVersion: 2, weekly: { restMinutes: null }, daily: Object.fromEntries(days.map(day=>[day,
      {studyMinutes:null,compositeMinutes:null,restMinutes:2,onlineMinutes:null}])) },
    timeWindows: { daily: Object.fromEntries(days.map(day=>[day,{studyWindows:[{start:'00:00',end:'24:00'}],
      compositeWindows:[{start:String(start).padStart(2,'0')+':00',end:String(start+1).padStart(2,'0')+':00'}],restWindows:[{start:String(start).padStart(2,'0')+':00',end:String(start+1).padStart(2,'0')+':00'}]}])) },
    autonomyConfig: { restrictedEntryConfirmationRequired:true,quotaOverrunConfirmationRequired:true,timeWindowAdvisoryEnabled:true },
    restConfig: { firstReminderMinutes:null,weeklyFirstReminderMinutes:null },
    forcedUsePolicyV1: {schemaVersion:1,enabled:true,reminderIntervalMinutes:1,
      quotaOverrunMinutes:{dailyStudy:null,dailyComposite:null,dailyRest:null,dailyOnline:null,weeklyRest:null,domain:null},advisoryWindowDailyMaxMinutes:null} };
  await chrome.storage.local.set({cloud_profile_id:'isolated-v2-child',cloud_device_id:'isolated-v2-device'});
  await saveConfig(cfg);
  v2FixturePolicy = {...projectV2FixturePolicy(await getConfig(),1,0),stage:'shared'};
  const makeSource = kind => {
    const range=fixtureV2Range();
    return {schemaVersion:1,durationUnit:'seconds',source:kind,childId:'isolated-v2-child',fromDate:range.fromDate,toDate:range.toDate,
      revision:kind+'-fixture',readAtMs:Date.now(),includedSourceKeys:[kind+'-fixture-source'],excludedSourceKeys:[],
      days:range.dates.map(date=>({date,totalSeconds:kind==='web'&&date===range.toDate?v2FixtureWebSeconds:0,
        categoriesSeconds:kind==='web'?{study:0,composite:0,rest:date===range.toDate?v2FixtureWebSeconds:0}:{study:0,composite:0,restrictedEntertainment:0},
        ...(kind==='application'?{nonSpecialTotalSeconds:0}:{}),settledThroughMs:null,complete:true,reasonCodes:[]}))};
  };
  configureV2FixtureRuntime({enabled:true,schemaVersion:2,
    readPolicy:async()=>({ok:true,policy:v2FixturePolicy}),
    readScope:async()=>({childId:'isolated-v2-child',scopeHash:'isolated-v2-scope'}),
    readConfigContext:async()=>({version:v2FixtureVersion,config:await getConfig()}),
    readSources:async()=>({ok:true,childId:'isolated-v2-child',scopeHash:'isolated-v2-scope',sourceStatistics:{web:makeSource('web'),application:makeSource('application')}})});
  v2FixtureIdentity = (await readSharedAccessRuntime(fixtureV2Range().toDate)).policyIdentity;
  await configureSharedForcedUseCoordinatorV2({enabled:true,effectsEnabled:true,
    readCloseCapability:async()=>({available:await chrome.permissions.contains({permissions:['debugger']})}),
    readRound:forcedUsePrompt.readIndependentRound,retireRound:forcedUsePrompt.retireIndependentRound,resumeIndependent:forcedUsePrompt.resumeIndependent,
    readLease:()=> 'isolated-v2-lease',readModel:readSharedAccessRuntime,
    readDecision:tab=>handleModeEvent({type:'ACCESS_OBSERVED',tabId:tab.id,windowId:tab.windowId,url:tab.url,foreground:true,monitoringEnabled:1}),
    onAccepted:id=>reevaluateTabById(id,{source:'shared_v2_isolated_confirmed'}),
    request:v2FixtureRequest,
    sendActivity:async payload=>{
      const previousReceipt=v2FixtureReceipt;
      v2FixtureClock=serviceV2Fixture.advanceSharedForcedUseClock(v2FixtureClock,v2FixtureBoot,v2FixtureMono(),
        [{eligible:previousReceipt?.message.status==='active'&&previousReceipt.message.reasonCodes.some(reason=>reason!=='restrictedEntry'),
          validThroughMonotonicMs:(previousReceipt?.receivedMonotonicMs??0)+15000}]);
      const received=serviceV2Fixture.receiveSharedBrowserActivityV2({leaseId:'isolated-v2-lease',leaseCurrent:true,currentPolicyIdentity:v2FixtureIdentity,
        monotonicNowMs:v2FixtureMono(),bootId:v2FixtureBoot,current:v2FixtureReceipt},payload);
      v2FixtureReceipt=received.receipt;
      const needsEntry=payload.reasonCodes.some(reason=>!v2FixtureGrants.get(payload.ruleScopeKey)?.has(reason));
      const repeatDue=payload.reasonCodes.some(reason=>reason!=='restrictedEntry')&&Math.floor(v2FixtureClock.accumulatedMs/1000)-v2FixtureConfirmed>=60;
      if(!v2FixtureExecution&&payload.status!=='inactive'&&(!v2FixtureState||['resolved','withdrawn'].includes(v2FixtureState.status))&&(needsEntry||repeatDue)) {
        const id=crypto.randomUUID();
        v2FixtureState={schemaVersion:2,roundId:id,reminderId:id,deliveryId:id,policyRevision:v2FixturePolicy.revision,stateRevision:'isolated-v2-state',
          date:fixtureV2Range().toDate,kinds:[...(needsEntry?['entry']:[]),...(repeatDue?['repeat']:[])],presenter:'browser',stage:'shared',issuedAtMs:Date.now(),offerExpiresAtMs:Date.now()+300000,
          visibleAtMs:null,responseDeadlineSeconds:60,timeoutAction:'end',status:'offered',resolution:null,
          policyIdentity:v2FixtureIdentity,ruleScopeKey:payload.ruleScopeKey,reasonCodes:payload.reasonCodes,
          forcedUsageSeconds:Math.floor(v2FixtureClock.accumulatedMs/1000),confirmedAtUsageSeconds:v2FixtureGrants.size?v2FixtureConfirmed:null};
        v2FixtureVisibleMono=null;v2FixtureVisibleBoot=null;
      }
      const response={ok:true,receipt:{schemaVersion:2,leaseId:payload.leaseId,acceptedSequence:payload.sequence,duplicate:received.duplicate,stale:false,
        ownership:'accepted',retiredIndependentRoundId:payload.independentRoundId}};
      v2FixtureMessages.push({method:'reportBrowserActivity',request:structuredClone(payload),response:structuredClone(response)});
      return response;
    }});
};
globalThis.observeSharedV2Fixture = id=>reevaluateTabById(id,{source:'shared_v2_isolated_entry'});
globalThis.pollSharedV2Fixture = ()=>pollSharedForcedUseV2();
globalThis.advanceSharedV2Fixture = async (ms,quotaDue=false)=>{v2FixtureOffset+=ms;if(quotaDue)v2FixtureWebSeconds=120;return pollSharedForcedUseV2();};
globalThis.compositeSharedV2Fixture = async ()=>{
  const config=await getConfig();await saveConfig({...config,customRestrictedEntertainmentList:[],customCompositeList:['127.0.0.1'],restrictedEntertainmentList:[],compositeList:['127.0.0.1']});
  v2FixtureVersion++;v2FixturePolicy={...projectV2FixturePolicy(await getConfig(),v2FixtureVersion,0),stage:'shared'};
  v2FixtureIdentity=(await readSharedAccessRuntime(fixtureV2Range().toDate)).policyIdentity;
  v2FixtureState=null;v2FixtureExecution=null;
};
globalThis.expireSharedV2Fixture = ()=>{
  v2FixtureOffset+=60001;
  const expired=serviceV2Fixture.expireSharedReminderV2(v2FixtureContext());v2FixtureState=expired.state;
  v2FixtureExecution={schemaVersion:2,roundId:v2FixtureState.roundId,reminderId:v2FixtureState.reminderId,deliveryId:v2FixtureState.deliveryId,
    policyRevision:v2FixtureState.policyRevision,stateRevision:v2FixtureState.stateRevision,policyIdentity:v2FixtureIdentity,
    executionId:crypto.randomUUID(),leaseId:'isolated-v2-lease',activityId:v2FixtureReceipt.message.activityId,
    targetSource:'browser',effect:'force-close',maxAgeMs:5000};
};
globalThis.readSharedV2Fixture = async()=>{
  const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
  const config=await getConfig();
  const decision=tab?.url?await handleModeEvent({type:'ACCESS_OBSERVED',tabId:tab.id,windowId:tab.windowId,url:tab.url,foreground:true,monitoringEnabled:1}):null;
  return {messages:v2FixtureMessages,state:v2FixtureState,timing:await getTimingSession(),mode:(await readV2FixtureMode(config,1)).mode,
    activated:runtimeActivationState?.activated,monitoringEnabled:getSyncState().monitoringEnabled,
    decision:decision?{ok:decision.ok,access:decision.access,reminder:decision.reminder,forcedAdmission:decision.forcedAdmission,modeChange:decision.modeChange}:null,
    target:tab?{id:tab.id,url:tab.url}:null};
};
`;

test('V2 actual access entry, merged repeat, canceled close and Composite timeout conserve original segments', async () => {
  test.setTimeout(120000);
  const server = http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<html><body><h1>Isolated shared V2 entry</h1><video autoplay muted width="320" height="180"></video><script>
    addEventListener('beforeunload',e=>{e.preventDefault();e.returnValue=''});
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');let frame=0;
    function draw(){ctx.fillStyle=frame++%2?'#087f73':'#dd3355';ctx.fillRect(0,0,320,180);requestAnimationFrame(draw)}draw();
    const video=document.querySelector('video');video.srcObject=canvas.captureStream(15);video.play().then(()=>window.videoReady=true);
  </script></body></html>`);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let fixture;
  try {
    fixture=await isolatedExtension('shared-forced-v2',harness,{prepare:extension=>{
      const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));
      manifest.permissions=[...new Set([...manifest.permissions,'debugger'])];
      fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
    }});
    const {context,worker,probe,directory}=fixture;
    await context.route('https://**/*',route=>route.abort());
    await probe.evaluate(async()=>{const {DEFAULT_CONFIG,saveConfig}=await import('./infra/storage.js');
      await saveConfig({...DEFAULT_CONFIG,mode:'study',isInitialized:true,studyList:['127.0.0.1'],restConfig:{firstReminderMinutes:null,weeklyFirstReminderMinutes:null}});});
    const unaffected=await context.newPage();
    await unaffected.goto('about:blank');
    await unaffected.evaluate(()=>{window.isolatedWitness='still-open';});
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port+'/');
    await page.waitForFunction(()=>window.videoReady===true);
    await page.bringToFront();
    const tabId=await worker.evaluate(async()=> (await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0].id);
    const readRaw=()=>worker.evaluate(async()=> (await chrome.storage.local.get('usage_segments_v1')).usage_segments_v1||{});
    const assertUnchanged=(before,after)=>{for(const [id,row] of Object.entries(before))expect(after[id],id).toEqual(row);};
    const closedRows=raw=>Object.values(raw).filter(row=>row.tabId===tabId&&row.settlementReason==='tab_close');
    const newTargetRows=(before,after)=>Object.entries(after).filter(([id,row])=>!before[id]&&row.tabId===tabId).map(([,row])=>row);
    await worker.evaluate(()=>startSharedV2Fixture());
    await worker.evaluate(id=>observeSharedV2Fixture(id),tabId);
    fs.writeFileSync(path.join(directory,'entry-diagnostic.json'),JSON.stringify(await worker.evaluate(()=>readSharedV2Fixture()),null,2));
    const input=page.getByRole('textbox',{name:'手动输入强行使用'});
    await expect(input).toBeEnabled();
    const before=await worker.evaluate(()=>readSharedV2Fixture());
    expect(before.messages.find(row=>row.method==='reportBrowserActivity').request.status).toBe('pending-entry');
    expect(before.state.forcedUsageSeconds).toBe(0);
    expect(before.state.reasonCodes).toContain('timeWindow');
    expect(before.state.reasonCodes).toContain('restrictedEntry');
    expect(before.mode).toBe('study');
    expect(await input.evaluate(node=>!node.dispatchEvent(new Event('paste',{bubbles:true,cancelable:true})))).toBe(true);
    await input.fill('错误文字');await expect(page.getByRole('button',{name:'确认继续',exact:true})).toBeDisabled();
    await input.fill('强行使用');await page.getByRole('button',{name:'确认继续',exact:true}).click();
    await expect(page.locator('#__toc_shared_reminder__')).toHaveCount(0);
    await expect.poll(async()=> (await worker.evaluate(()=>readSharedV2Fixture())).mode).toBe('rest');
    await expect.poll(async()=> {
      await worker.evaluate(()=>pollSharedV2Fixture());
      const data=await worker.evaluate(()=>readSharedV2Fixture());
      return data.messages.some(row=>row.method==='reportBrowserActivity'&&row.request.status==='active');
    },{timeout:15000}).toBe(true);
    const after=await worker.evaluate(()=>readSharedV2Fixture());
    expect(after.timing.state).toBe('ACTIVE');
    expect(after.messages.filter(row=>row.method==='resolveSharedReminder')).toHaveLength(1);
    expect(after.messages.every(row=>!Object.hasOwn(row.request,'confirmationText'))).toBe(true);
    for(let index=0;index<12;index++)await worker.evaluate(({quotaDue})=>advanceSharedV2Fixture(5000,quotaDue),{quotaDue:index===11});
    await expect(input).toBeEnabled();
    const merged=await worker.evaluate(()=>readSharedV2Fixture());
    expect(merged.state.kinds).toContain('repeat');expect(merged.state.kinds).toContain('entry');
    expect(merged.state.reasonCodes).toContain('dailyRest');expect(merged.state.reasonCodes).toContain('timeWindow');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await input.fill('强行使用');await page.getByRole('button',{name:'确认继续',exact:true}).click();
    await worker.evaluate(()=>pollSharedV2Fixture());
    await expect(page.locator('#__toc_shared_reminder__')).toHaveCount(0);
    for(let index=0;index<12;index++)await worker.evaluate(()=>advanceSharedV2Fixture(5000));
    await expect(input).toBeEnabled();
    const beforeCanceled=await readRaw();
    page.on('dialog',dialog=>dialog.dismiss());
    await page.getByRole('button',{name:'结束使用',exact:true}).click();
    await expect.poll(async()=> (await worker.evaluate(()=>readSharedV2Fixture())).messages
      .filter(row=>row.method==='acknowledgeBrowserExecution').map(row=>row.request.outcome)).toContain('canceled');
    expect(page.isClosed()).toBe(false);
    const afterCanceled=await readRaw();
    assertUnchanged(beforeCanceled,afterCanceled);
    expect(newTargetRows(beforeCanceled,afterCanceled)).toHaveLength(0);
    expect(closedRows(afterCanceled)).toHaveLength(closedRows(beforeCanceled).length);
    expect(unaffected.isClosed()).toBe(false);
    expect(await unaffected.evaluate(()=>window.isolatedWitness)).toBe('still-open');
    await worker.evaluate(()=>compositeSharedV2Fixture());
    await worker.evaluate(id=>observeSharedV2Fixture(id),tabId);
    await expect(input).toBeEnabled();
    const composite=await worker.evaluate(()=>readSharedV2Fixture());
    expect(composite.messages.filter(row=>row.method==='reportBrowserActivity').at(-1).request.quotaBucket).toBe('composite');
    expect(composite.messages.filter(row=>row.method==='reportBrowserActivity').at(-1).request.status).toBe('pending-entry');
    await input.fill('强行使用');await page.getByRole('button',{name:'确认继续',exact:true}).click();
    await expect.poll(async()=> (await worker.evaluate(()=>readSharedV2Fixture())).timing?.state).toBe('ACTIVE');
    await expect.poll(async()=>{
      await worker.evaluate(()=>pollSharedV2Fixture());
      return (await worker.evaluate(()=>readSharedV2Fixture())).messages
        .filter(row=>row.method==='reportBrowserActivity').at(-1)?.request.status;
    }).toBe('active');
    // Real elapsed time is used only for a positive original segment, not the accelerated Service clock.
    await expect.poll(async()=>Date.now()-(await worker.evaluate(()=>readSharedV2Fixture())).timing?.startTime,
      {timeout:10000}).toBeGreaterThan(2000);
    for(let index=0;index<12;index++)await worker.evaluate(()=>advanceSharedV2Fixture(5000));
    await expect(input).toBeEnabled();
    const beforeForce=await readRaw();
    const beforeForceTiming=(await worker.evaluate(()=>readSharedV2Fixture())).timing;
    expect(beforeForceTiming.tabId).toBe(tabId);
    expect(beforeForceTiming.state).toBe('ACTIVE');
    await worker.evaluate(()=>expireSharedV2Fixture());
    await worker.evaluate(()=>pollSharedV2Fixture());
    await expect.poll(()=>page.isClosed()).toBe(true);
    try {
      await expect.poll(async()=>newTargetRows(beforeForce,await readRaw()).length).toBe(1);
    } finally {
      fs.writeFileSync(path.join(directory,'accounting-close-diagnostic.json'),JSON.stringify({beforeCanceled,afterCanceled,
        beforeForce,beforeForceTiming,afterForce:await readRaw(),stateAfterForce:await worker.evaluate(()=>readSharedV2Fixture())},null,2));
    }
    const afterForce=await readRaw();
    assertUnchanged(beforeForce,afterForce);
    const closed=newTargetRows(beforeForce,afterForce);
    expect(closed).toHaveLength(1);
    expect(closed[0].startMs).toBe(beforeForceTiming.startTime);
    expect(['transition_complete','tab_close']).toContain(closed[0].settlementReason);
    expect(closed[0].durationSeconds).toBe(Math.floor((closed[0].endMs-closed[0].startMs)/1000));
    expect(closed[0].durationSeconds).toBeGreaterThan(0);
    const activeRows=Object.values(afterForce).filter(row=>row.tabId===tabId&&row.channel==='active'&&row.durationSeconds>0)
      .sort((a,b)=>a.startMs-b.startMs);
    for(let index=1;index<activeRows.length;index++)expect(activeRows[index].startMs).toBeGreaterThanOrEqual(activeRows[index-1].endMs);
    await expect.poll(async()=>await readRaw()).toEqual(afterForce);
    expect(unaffected.isClosed()).toBe(false);
    expect(await unaffected.evaluate(()=>window.isolatedWitness)).toBe('still-open');
    const final=await worker.evaluate(()=>readSharedV2Fixture());
    expect(final.messages.filter(row=>row.method==='acknowledgeBrowserExecution').at(-1).request.outcome).toBe('completed');
    fs.writeFileSync(path.join(directory,'message-replay.json'),JSON.stringify({evidence:'real_unpacked_sw_content_access_coordinator_and_cdp_closer',
      service:'isolated_contract_state_machine_with_accelerated_clock',nativeTransport:'not_used_in_this_browser_case',
      executionContext:'production_default_v2_no_context_injection',originalLedgerFixtureWrites:false,
      accounting:{beforeCanceled,afterCanceled,beforeForce,afterForce,originalCloseSegmentIds:closed.map(row=>row.id),
        unaffectedPageStillOpen:true,existingSegmentsUnchanged:true,positiveActiveSegmentsNonOverlapping:true},...final},null,2));
    console.log('Shared V2 actual entry evidence: '+directory);
  } finally {if(fixture)await fixture.context.close();await new Promise(resolve=>server.close(resolve));}
});
