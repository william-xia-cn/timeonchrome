'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'extension/admin/admin.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'extension/admin/admin.html'), 'utf8');
function fn(name) {
  let start = source.indexOf(`function ${name}(`);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  assert(start >= 0, name);
  const open = source.indexOf(') {', start) + 2;
  let depth = 1, end = open + 1;
  for (; depth; end++) { if (source[end] === '{') depth++; else if (source[end] === '}') depth--; }
  return source.slice(start, end);
}
const renderers = source.slice(source.indexOf('function usageCategoryLabel('), source.indexOf('let statsReadSequence ='));
const scope = { profileId: 'fixture-child', deviceId: 'fixture-device', bindingToken: 'synthetic' };
const day = { kind: 'web', totalSeconds: 780, range: { mode: 'day', from: '2026-10-21', to: '2026-10-21', label: '2026-10-21' },
  categoryTotals: { study: 180, composite: 300, rest: 240, other: 60 }, categoryKeys: ['study', 'composite', 'rest', 'other'],
  chartSeries: [], categoryRows: [], targetRows: [], weekSummarySeries: [], hourlyRead: { available: false } };
function context() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', hidden: false, value: '', classList: { toggle() {} } });
    return elements.get(id);
  };
  const c = { console, JSON, usageAnalysisState: { ledger: 'web', mode: 'day', date: '2026-10-21' },
    statsReadSequence: 0, applicationStatsReading: false, usageAnalysisLastView: null, config: {},
    document: { getElementById: element, querySelectorAll: () => [], querySelector: element },
    renderRestUsageSummary: async () => {}, setStatsPageError: () => {}, getAdminDateKey: () => '2026-10-22',
    readWebHourlyContext: async () => scope, getAdminUsageAnalysisView: async () => structuredClone(day),
    renderUsageAnalysisView: value => c.renders.push(value), renders: [] };
  vm.createContext(c); vm.runInContext(fn('renderStatsPage'), c);
  return c;
}
(async () => {
  const c = context(); let finish;
  c.readWebHourlyHistory = () => new Promise(resolve => { finish = resolve; });
  const pending = c.renderStatsPage(); await new Promise(r => setImmediate(r));
  assert.equal(c.renders[0].totalSeconds, 780); assert.match(c.renders[0].hourlyNotice, /正在读取/);
  finish({ ...day, hourlyNotice: '已上传小时统计' }); await pending;
  assert.equal(c.renders.length, 2); assert.equal(c.renders[1].totalSeconds, 780);
  const stale = context(); let staleFinish;
  stale.readWebHourlyHistory = () => new Promise(r => { staleFinish = r; });
  const old = stale.renderStatsPage(); await new Promise(r => setImmediate(r));
  stale.statsReadSequence++; staleFinish(day); await old; assert.equal(stale.renders.length, 1);
  const rebound = context(); let nextScope = scope;
  rebound.readWebHourlyContext = async () => nextScope;
  rebound.readWebHourlyHistory = async () => { nextScope = { ...scope, deviceId: 'changed' }; return day; };
  await rebound.renderStatsPage(); assert.equal(rebound.renders.length, 1);
  assert.match(html, /id="usage-analysis-hourly-notice" role="status" hidden/);
  console.log('Admin hourly controller: 4/4 passed (pending total, successful render, stale sequence, binding change)');
  if (!process.argv.includes('--serve-preview')) return;
  const adapter = fs.readFileSync(path.join(root, 'extension/stats/web-hourly-history.js'), 'utf8').replace(/export /g, '');
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
  const page = html.slice(html.indexOf('    <div class="page active" id="page-stats">'), html.indexOf('    <!-- 系统管理 -->'));
  const script = `
    ${adapter}
    ${fn('formatSeconds')} ${fn('escHtml')} ${fn('escAttr')}
    const DAY_NAMES=['周日','周一','周二','周三','周四','周五','周六'];
    const APPLICATION_CATEGORY_LABELS={};
    let usageAnalysisState={ledger:'web',mode:'day',date:'2026-10-21',listMode:'targets',query:'',detail:null};
    let usageAnalysisLastView=null, config={}, statsReadSequence=0, applicationStatsReading=false;
    ${renderers}
    const base=${JSON.stringify(day)};
    base.meta={syncLabel:'隔离示例数据 · 不连接真实家庭'};
    base.totalLabel='网页使用时间';
    base.weekSummarySeries=['10-19','10-20','10-21','10-22','10-23','10-24','10-25'].map((label,i)=>({label,categories:i===2?base.categoryTotals:{study:0,composite:0,rest:0,other:0}}));
    const fixtureScope=${JSON.stringify(scope)};
    const getAdminDateKey=()=> '2026-10-22';
    const readWebHourlyContext=async()=>fixtureScope;
    const getAdminUsageAnalysisView=async ({mode,date})=>{
      const selected=date||getAdminDateKey();
      const value=structuredClone(base);value.range={mode,from:selected,to:selected,label:selected};
      if(mode==='week') value.chartSeries=value.weekSummarySeries;
      if(selected===getAdminDateKey()&&mode==='day') {
        value.chartSeries=cloudWebHourSeries([{date:selected,device_id:fixtureScope.deviceId,channel:'active',hour:9,quota_bucket:'study',duration_seconds:780}],selected,fixtureScope.deviceId);
        value.hourlyRead={available:true,complete:true,pending:true};
      }
      return value;
    };
    const readWebHourlyHistory=createWebHourlyHistoryReader({readContext:readWebHourlyContext,today:getAdminDateKey,request:async()=>{
      if(new URLSearchParams(location.search).has('failure')) throw Error('fixture offline');
      return {ok:true,json:async()=>({stats:['study','composite','rest','other'].map((quota_bucket,i)=>({date:'2026-10-21',device_id:fixtureScope.deviceId,channel:'active',hour:8+i,quota_bucket,duration_seconds:[180,300,240,60][i]}))})};
    }});
    const renderRestUsageSummary=async()=>{};
    const setStatsPageError=()=>{};
    ${fn('renderStatsPage')}
    document.querySelectorAll('[data-usage-range-mode]').forEach(button=>button.onclick=()=>{usageAnalysisState.mode=button.dataset.usageRangeMode;return renderStatsPage();});
    document.getElementById('usage-analysis-today').onclick=()=>{usageAnalysisState.date=null;return renderStatsPage();};
    document.getElementById('usage-analysis-prev').onclick=()=>{usageAnalysisState.date='2026-10-21';return renderStatsPage();};
    for(const id of ['usage-rest-today-total','usage-rest-week-total']) document.getElementById(id).textContent='隔离示例';
    document.querySelectorAll('[id$="-parts"]').forEach(el=>el.textContent='不连接真实家庭');
    window.previewReady=renderStatsPage();
  `;
  const preview = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>历史小时图隔离预览</title><style>${css}\nbody{display:block;padding:20px}#page-stats{display:block;max-width:1400px;margin:auto}</style><body>${page}<script>${script}</script></body></html>`;
  const server = require('node:http').createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(preview); });
  server.listen(64341, '127.0.0.1', () => console.log('Isolated actual Admin preview: http://127.0.0.1:64341/'));
})();
