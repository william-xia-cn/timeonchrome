// Isolated mock preview of the production stats renderer. No extension profile or cloud requests.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const admin = fs.readFileSync(path.join(root, 'extension/admin/admin.js'), 'utf8');
const renderer = admin.slice(admin.indexOf('function setupUsageAnalysisControls()'), admin.indexOf('function computeOverview(data)'));
const escaping = admin.slice(admin.indexOf('function escHtml(s)'), admin.indexOf('function escAttr(s)'))
  + admin.slice(admin.indexOf('function escAttr(s)'), admin.indexOf('function escAttr(s)') + 300).split('\n}')[0] + '\n}';
const formatter = admin.slice(admin.indexOf('function formatSeconds(secs)'), admin.indexOf('function formatSeconds(secs)') + 450).split('\n}')[0] + '\n}';
const bootstrap = `
import { getAdminApplicationUsageAnalysisView, applicationUsageErrorMessage, APPLICATION_CATEGORY_LABELS }
  from '/extension/stats/application-usage-read-model.js';
const usageAnalysisState = { ledger:'application', mode:'day', date:null, listMode:'targets', query:'', detail:null };
let usageAnalysisLastView = null, config = {};
const DAY_NAMES = ['周日','周一','周二','周三','周四','周五','周六'];
${escaping}
${formatter}
${admin.slice(admin.indexOf('function setStatsPageError(message)'), admin.indexOf('function setSettlementsPageError(message)'))}
const getAdminUsageAnalysisView = async () => ({ ...await getAdminApplicationUsageAnalysisView(), kind:'web', totalLabel:'网页使用（mock）' });
const getAdminMediaUsageAnalysisView = async () => ({ ...await getAdminApplicationUsageAnalysisView(), kind:'media', totalLabel:'媒体使用（mock）' });
window.mockAppMode = new URL(location.href).searchParams.get('mode') || 'online';
window.previewQueryCount = 0;
const originalSetInterval = window.setInterval;
window.setInterval = (fn, delay) => { if (delay === 60000) { window.previewTick = fn; return 0; } return originalSetInterval(fn, delay); };
const originalNow = Date.now;
const now = Date.parse('2026-09-26T12:00:00+08:00'); Date.now = () => now;
window.previewRuntimeListeners = [];
window.chrome = { runtime: { id:'mock-preview', onMessage: {addListener: listener => window.previewRuntimeListeners.push(listener)}, sendMessage: async ({query}) => {
  window.previewQueryCount++;
  if (window.mockAppMode === 'missing') return {ok:false,errorCode:'native_host_unavailable'};
  if (window.mockAppMode === 'offline') return {ok:false,errorCode:'runtime_service_unavailable'};
  if (window.mockAppMode === 'slow') await new Promise(resolve => setTimeout(resolve, 250));
  const dates = Array.from({length:7}, (_, i) => new Date(Date.parse(query.fromDate+'T00:00:00+08:00')+i*86400000+8*3600000).toISOString().slice(0,10));
  const active = dates.includes('2026-09-26');
  const values = active ? {study:300000,composite:1200501,restrictedEntertainment:2400000,unclassified:60000,unknown:2000} : {};
  const total = Object.values(values).reduce((n,v)=>n+v,0);
  const days = dates.map(date => ({date,totalMs:date==='2026-09-26'?total:0,complete:true,reasonCodes:[],categoriesMs:date==='2026-09-26'?values:{},
    hours:Array.from({length:24},(_,hour)=>{
      const categoriesMs = date==='2026-09-26' ? hour===9 ? Object.fromEntries(Object.entries(values).filter(([key])=>key!=='composite')) : hour===10 ? {composite:values.composite} : {} : {};
      return {hour,totalMs:Object.values(categoriesMs).reduce((n,v)=>n+v,0),categoriesMs};
    })}));
  const names = ['Visual Studio Code','记事本','Aimlabs','Fixture 工具','历史应用'];
  const applications = Object.entries(values).map(([classification, value],i)=>({key:String(i+1).padStart(64,'0'),name:names[i],classifications:[classification],totalMs:value,
    dailyMs:Object.fromEntries(dates.map(date=>[date,date==='2026-09-26'?value:0]))}));
  return {ok:true,applicationUsage:{fromDate:query.fromDate,toDate:query.toDate,revision:'a'.repeat(64),computedAtMs:now,lastSettledAtMs:now-60000,
    complete:true,reasonCodes:[],totalMs:total,days,applications,nextOffset:null}};
} } };
${renderer}
document.querySelector('#login-screen').style.display='none';
document.querySelector('#main-screen').style.display='block';
document.querySelectorAll('.page').forEach(e=>e.classList.remove('active'));
document.querySelector('#page-stats').classList.add('active');
document.querySelector('#sync-status').textContent='隔离 mock 数据，不连接家庭或云端';
setupUsageAnalysisControls();
await renderStatsPage();
window.appPreview = {render: options => renderStatsPage(options), state:usageAnalysisState};
window.previewReady = true;
`;
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/preview.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(bootstrap); return; }
  const relative = pathname === '/' ? 'extension/admin/admin.html' : pathname.startsWith('/icons/') ? 'extension' + pathname : decodeURIComponent(pathname).slice(1);
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  const types = {'.html':'text/html','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  if (pathname === '/') response.end(fs.readFileSync(file, 'utf8').replace('<script type="module" src="admin.js"></script>', '<script type="module" src="/preview.js"></script>'));
  else response.end(fs.readFileSync(file));
});
server.listen(43187, '127.0.0.1', () => console.log('Isolated application usage preview: http://127.0.0.1:43187/'));
