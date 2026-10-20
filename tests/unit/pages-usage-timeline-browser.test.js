const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('@playwright/test');

const root = path.resolve(__dirname, '../..');
const output = process.env.TOC_VISUAL_OUTPUT || path.join(os.tmpdir(), 'toc-usage-timeline-visual');
const date = '2026-10-20';
const dayStart = Date.parse(`${date}T00:00:00+08:00`);
const segment = (id, startMinute, endMinute, kind, deviceId) => ({
  id, date, deviceId, targetKey:id==='e'?'object:a':`object:${id}`, channel: 'active', targetClassificationAtTime: kind,
  quotaBucketAtTime: kind === 'pending_composite' ? 'composite' : kind,
  startMs: dayStart + startMinute * 60000, endMs: dayStart + endMinute * 60000,
  durationSeconds: 51,
});

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const windowsChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(windowsChrome) ? { executablePath: windowsChrome } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    await page.goto(pathToFileURL(path.join(root, 'pages/index.html')).href, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      showScreen('main');
      document.querySelectorAll('.page').forEach(node => node.classList.remove('active'));
      document.getElementById('page-stats').classList.add('active');
    });
    const view = {
      kind: 'web', range: { mode: 'day', from: date, to: date, label: date },
      totalSeconds: 720, categoryTotals: { study: 300, composite: 100, rest: 220, other: 100 },
      weekSummarySeries: [], chartSeries: [], targetRows: [
        {key:'object:a',label:'同名网站',category:'study',targetClassificationAtTime:'study',rangeSeconds:300,todaySeconds:300,weekSeconds:300},
        {key:'object:b',label:'同名网站',category:'composite',targetClassificationAtTime:'composite',rangeSeconds:100,todaySeconds:100,weekSeconds:400},
        {key:'object:missing',label:'无已上传时段网站',category:'other',targetClassificationAtTime:'other',rangeSeconds:10,todaySeconds:10,weekSeconds:10},
      ], categoryRows: [],
      meta: { syncLabel: '示例统计', deviceScope: { selected: '', label: '全部设备', options: [] } },
    };
    const rows = [
      segment('a', 72, 104, 'study', 'device-a'),
      segment('b', 138, 185, 'composite', 'device-a'),
      segment('c', 151, 172, 'rest', 'device-b'),
      segment('d', 547, 563, 'pending_composite', 'device-a'),
      segment('e', 558, 585, 'study', 'device-b'),
      segment('f', 857, 891, 'rest', 'device-a'),
      segment('g', 868, 898, 'study', 'device-b'),
      segment('h', 1100, 1130, 'other', 'device-a'),
    ];
    await page.evaluate(({ view, rows }) => {
      cloudUsageState.deviceId = '';
      renderCloudUsageView(view);
      renderCloudUsageTimeline(view, { segments: rows, complete: true });
    }, { view, rows });
    assert.equal(await page.locator('.usage-interval-hour').count(), 24);
    assert.equal(await page.locator('.usage-interval-mark.pending').count(), 0);
    assert.equal(await page.locator('#cloud-usage-timeline-legend > span').count(), 4);
    assert.deepEqual(await page.locator('#cloud-usage-timeline-legend > span').allTextContents(),['学习','复合','休息','其他']);
    for (const bucket of ['study','composite','rest','other'])
      assert.ok(await page.locator(`.usage-interval-mark.${bucket}`).count()>0);
    assert.equal(await page.locator('#cloud-usage-total').innerText(), '12分');
    const overlap = await page.locator('.usage-interval-hour').nth(14).locator('.usage-interval-mark').evaluateAll(nodes =>
      nodes.map(node => ({ left: node.style.left, width: node.style.width })));
    assert.equal(overlap.length, 2);
    assert.notEqual(overlap[0].left, overlap[1].left);
    await page.locator('[data-cloud-usage-key="object:a"]').click();
    assert.equal(await page.locator('.usage-interval-mark.is-selected').count(),2,'同对象跨设备均高亮');
    assert.ok(await page.locator('.usage-interval-mark.is-muted').count()>0);
    await page.locator('[data-cloud-usage-sort="week"]').click();
    assert.equal(await page.locator('#cloud-usage-table tbody tr').first().getAttribute('data-cloud-usage-key'),'object:b');
    assert.equal(await page.locator('.usage-interval-mark.is-selected').count(),2,'排序保持选择');
    await page.locator('[data-cloud-usage-key="object:a"]').click();
    assert.equal(await page.locator('.usage-interval-mark.is-muted').count(),0,'再次点击取消');
    await page.locator('[data-cloud-usage-key="object:b"]').click();
    assert.equal(await page.locator('.usage-interval-mark.is-selected').count(),2,'同名不同对象不混淆，跨小时两段');
    await page.locator('#cloud-usage-clear-selection').click();
    assert.equal(await page.locator('.usage-interval-mark.is-selected').count(),0);
    await page.locator('[data-cloud-usage-key="object:missing"]').click();
    assert.match(await page.locator('#cloud-usage-selection-empty').innerText(),/没有该对象/);
    await page.locator('[data-cloud-usage-key="object:a"]').click();
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('#cloud-usage-main-scroll').evaluate(node => node.scrollWidth > node.clientWidth), true);
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });

    await page.evaluate(view => renderCloudUsageTimeline(view, { segments: [], complete: false }), view);
    assert.match(await page.locator('#cloud-usage-main-chart').innerText(), /时段图不完整/);
    assert.match(await page.locator('#cloud-usage-selection-empty').innerText(),/没有该对象/,'不完整与无匹配提示同时保留');
    assert.equal(await page.locator('#cloud-usage-total').innerText(), '12分');
    await page.evaluate(({view,rows})=>{
      window.fixtureTimelineRows=rows;
      currentProfileId='fixture-child-a';
      cloudUsageState.ledger='web';cloudUsageState.mode='day';
      buildCloudUsageView=async()=>({...view,range:{...view.range,mode:cloudUsageState.mode}});
      window.timelineResolvers=[];
      fetchCloudUsageTimelineSegments=()=>new Promise(resolve=>window.timelineResolvers.push(resolve));
      window.firstTimelineRead=renderStatsPage();
    },{view,rows});
    await page.waitForFunction(()=>window.timelineResolvers.length===1);
    await page.evaluate(()=>{
      currentProfileId='fixture-child-b';cloudUsageState.detail=null;
      window.secondTimelineRead=renderStatsPage();
    });
    await page.waitForFunction(()=>window.timelineResolvers.length===2);
    await page.evaluate(async()=>{
      timelineResolvers[1]({segments:[fixtureTimelineRows[1]],complete:true});await secondTimelineRead;
      timelineResolvers[0]({segments:[fixtureTimelineRows[0]],complete:true});await firstTimelineRead;
    });
    assert.equal(await page.locator('[data-usage-target-key="object:a"]').count(),0,'旧孩子迟到分段不得覆盖新请求');
    await page.locator('[data-cloud-usage-key="object:b"]').click();
    await page.locator('[data-cloud-usage-mode="week"]').click();
    assert.equal(await page.evaluate(()=>cloudUsageState.detail),null,'日周切换清除选择');
    for(const selector of ['#cloud-usage-prev','#cloud-usage-next','#cloud-usage-today']){
      await page.evaluate(()=>{cloudUsageState.detail={kind:'target',key:'object:b'};});
      await page.locator(selector).click();
      assert.equal(await page.evaluate(()=>cloudUsageState.detail),null,'日期切换清除选择');
    }
    await page.evaluate(()=>{
      cloudUsageState.detail={kind:'target',key:'object:b'};
      const device=document.getElementById('cloud-usage-device');
      device.innerHTML='<option value="">全部设备</option><option value="device-a">测试设备</option>';
    });
    await page.locator('#cloud-usage-device').selectOption('device-a');
    assert.equal(await page.evaluate(()=>cloudUsageState.detail),null,'设备切换清除选择');
    await page.evaluate(view => renderCloudUsageView({ ...view, range: { ...view.range, mode: 'week' } }), view);
    assert.equal(await page.locator('#cloud-usage-timeline-legend').isHidden(), true);
    assert.equal(await page.locator('#cloud-usage-main-chart').getAttribute('class'), 'usage-stack-chart');
    await page.evaluate(view => renderCloudUsageView({ ...view, kind: 'media' }), view);
    assert.equal(await page.locator('#cloud-usage-timeline-legend').isHidden(), true);
    console.log('pages-usage-timeline-browser: PASS');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
