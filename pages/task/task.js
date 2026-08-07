import {
  canonicalTaskHost,
  normalizeTaskResourceSpec,
  normalizeTaskUrlRule,
  taskResourceEntries,
  taskSpecialTargetsFromUrl,
} from './resource-editor.js';

const API_BASE = 'https://guardian-api.william-xia-cn.workers.dev';
let session = readLocal('session');
let token = session?.token || null;
let profiles = [];
let profileId = readLocal('currentProfileId') || null;
let capabilityReady = false;
let draft = { hosts: [], urlRules: [], specialTargets: [] };

const $ = (id) => document.getElementById(id);
function readLocal(key){try{return JSON.parse(localStorage.getItem('toc_'+key))}catch{return null}}
function writeLocal(key,value){localStorage.setItem('toc_'+key,JSON.stringify(value))}
function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}

async function refreshToken(){
  if(!session?.refreshToken)return false;
  const response=await fetch(`${API_BASE}/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:session.refreshToken})});
  if(!response.ok)return false;
  const data=await response.json();
  if(!data.token)return false;
  token=data.token;session={...session,token,refreshToken:data.refreshToken||session.refreshToken};writeLocal('session',session);return true;
}
async function api(path,method='GET',body=null){
  const options={method,headers:{'Content-Type':'application/json'}};
  if(token)options.headers.Authorization=`Bearer ${token}`;
  if(body!==null)options.body=JSON.stringify(body);
  let response=await fetch(API_BASE+path,options);
  if(response.status===401&&await refreshToken()){options.headers.Authorization=`Bearer ${token}`;response=await fetch(API_BASE+path,options)}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error||data.message||`HTTP ${response.status}`);error.code=data.code;error.details=data;throw error}
  return data;
}

function inputLines(){return String($('resource-input').value||'').split(/\r?\n/).map((item)=>item.trim()).filter(Boolean)}
function formatDuration(seconds){const value=Math.max(0,Math.floor(Number(seconds)||0));const h=Math.floor(value/3600);const m=Math.floor((value%3600)/60);return h?`${h}小时${m}分`:`${m}分钟`}
function formatDate(value){return value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'--'}
function statusLabel(task){if(task.lifecycleStatus==='paused')return'已暂停';if(task.lifecycleStatus==='completed')return'已完成';if(task.lifecycleStatus==='cancelled')return'已取消';return Number(task.plannedStartAt)>Date.now()?'未开始':'执行中'}
function setResourceMessage(message,error=false){$('resource-message').textContent=message;$('resource-message').classList.toggle('error',error)}
function renderResourceList(spec=draft,{removable=true,target=$('resource-draft-list')}={}){
  const entries=taskResourceEntries(spec);
  if(target===$('resource-draft-list'))$('resource-count').textContent=`${entries.length} 项`;
  if(!entries.length){target.innerHTML='<p class="empty">尚未添加允许资源。</p>';return}
  const groups=new Map();
  entries.forEach((entry)=>{if(!groups.has(entry.group))groups.set(entry.group,[]);groups.get(entry.group).push(entry)});
  target.innerHTML=[...groups.entries()].map(([group,items])=>`<section class="resource-group"><h4>${escapeHtml(group)}<span>${items.length}</span></h4>${items.map((entry)=>`<div class="resource-row"><span class="resource-type">${escapeHtml(entry.label)}</span><code>${escapeHtml(entry.value)}</code>${removable?`<button type="button" data-resource-key="${escapeHtml(entry.key)}" title="删除" aria-label="删除资源">×</button>`:''}</div>`).join('')}</section>`).join('');
  if(removable)target.querySelectorAll('[data-resource-key]').forEach((button)=>button.addEventListener('click',()=>{
    const key=button.dataset.resourceKey;
    draft={hosts:draft.hosts.filter((value)=>'host:'+value!==key),urlRules:draft.urlRules.filter((rule)=>'url:'+rule.match+':'+rule.url!==key),specialTargets:draft.specialTargets.filter((item)=>'special:'+item.platform+':'+item.type+':'+item.canonicalTarget!==key)};
    renderResourceList();
  }));
}
function addResources(){
  const kind=$('resource-kind').value;const lines=inputLines();
  if(!lines.length){setResourceMessage('请至少输入一行资源。',true);return}
  const additions={hosts:[],urlRules:[],specialTargets:[]};const errors=[];
  lines.forEach((line,index)=>{
    if(kind==='host'){const value=canonicalTaskHost(line);if(!value)errors.push(`第 ${index+1} 行不是有效域名：${line}`);else additions.hosts.push(value);return}
    if(kind==='url'){const normalized=normalizeTaskUrlRule({url:line,match:$('url-match').value});if(!normalized.ok)errors.push(`第 ${index+1} 行不是有效 URL：${line}`);else additions.urlRules.push(normalized.rule);return}
    const target=taskSpecialTargetsFromUrl(line)[0];if(!target)errors.push(`第 ${index+1} 行不是可支持的 YouTube 视频、播放列表或频道：${line}`);else additions.specialTargets.push(target);
  });
  if(errors.length){setResourceMessage(errors.join('；'),true);return}
  const before=new Set(taskResourceEntries(draft).map((entry)=>entry.key));
  const normalized=normalizeTaskResourceSpec({hosts:[...draft.hosts,...additions.hosts],urlRules:[...draft.urlRules,...additions.urlRules],specialTargets:[...draft.specialTargets,...additions.specialTargets]});
  if(!normalized.ok){setResourceMessage('资源校验失败，请检查输入。',true);return}
  draft=normalized.spec;const added=taskResourceEntries(draft).filter((entry)=>!before.has(entry.key)).length;const duplicates=lines.length-added;
  $('resource-input').value='';setResourceMessage(`已添加 ${added} 项${duplicates>0?`，跳过 ${duplicates} 个重复项。`:'。'}`);renderResourceList();
}
function updateResourceKind(){
  const kind=$('resource-kind').value;$('url-match-field').hidden=kind!=='url';
  $('resource-input').placeholder=kind==='host'?'collegeboard.org\nkhanacademy.org':kind==='url'?'https://example.com/practice':'https://www.youtube.com/watch?v=...';
}
function actionButtons(task){
  if(['completed','cancelled'].includes(task.lifecycleStatus))return'';
  const action=task.lifecycleStatus==='paused'?'resume':'pause';const label=action==='resume'?'恢复':'暂停';
  return `<div class="actions"><button data-action="${action}">${label}</button><button data-action="complete">完成</button><button class="danger" data-action="cancel">取消</button></div>`;
}
function taskRow(task){
  const required=Math.max(0,Number(task.requiredSeconds||0));const completed=Math.max(0,Number(task.completedSeconds||0));const ratio=required?Math.min(100,Math.round(completed/required*100)):0;const entries=taskResourceEntries(task.resourceSpec);
  const row=document.createElement('article');row.className='task-row';row.dataset.taskId=task.id;
  row.innerHTML=`<div class="task-head"><div><h3>${escapeHtml(task.name||'未命名任务')}</h3><span>${entries.length} 项允许资源</span></div><span class="status">${statusLabel(task)}</span></div><div class="task-meta-grid"><div class="task-meta-item"><span>计划开始</span><strong>${formatDate(task.plannedStartAt)}</strong></div><div class="task-meta-item"><span>要求时长</span><strong>${formatDuration(required)}</strong></div></div><div class="progress-label"><span>完成进度</span><strong>${formatDuration(completed)} / ${formatDuration(required)}</strong></div><div class="progress"><span style="width:${ratio}%"></span></div><div class="task-resource-list"></div>${actionButtons(task)}`;
  renderResourceList(task.resourceSpec,{removable:false,target:row.querySelector('.task-resource-list')});
  row.querySelectorAll('[data-action]').forEach((button)=>button.addEventListener('click',()=>runAction(task,button.dataset.action)));
  return row;
}
function renderTasks(tasks=[]){
  const active=tasks.filter((task)=>!['completed','cancelled'].includes(task.lifecycleStatus));const history=tasks.filter((task)=>['completed','cancelled'].includes(task.lifecycleStatus));
  $('active-summary').textContent=`${active.length} 个未结束任务`;$('active-list').replaceChildren(...(active.length?active.map(taskRow):[emptyNode('没有当前任务')]));
  $('history-count').textContent=history.length?`(${history.length})`:'';$('history-list').replaceChildren(...(history.length?history.map(taskRow):[emptyNode('暂无历史记录')]));
}
function emptyNode(text){const node=document.createElement('div');node.className='empty';node.textContent=text;return node}
function renderCapability(summary={}){
  capabilityReady=summary.canCreateTasks===true;$('create-btn').disabled=!capabilityReady;
  const online=Number(summary.onlineDeviceCount||0);const unsupported=(summary.unsupportedOnlineDevices||[]).length;
  $('capability-notice').textContent=capabilityReady?`设备能力已就绪：${online} 台在线设备支持 Task V1。`:`暂不能创建正式任务：${online?`${unsupported} 台在线设备尚未报告 Task V1 能力。`:'没有已报告 Task V1 能力的在线设备。'}`;
}
async function loadTasks(){if(!profileId)return;const result=await api(`/profiles/${encodeURIComponent(profileId)}/task-runtime/v1/tasks?includeHistory=1`);renderCapability(result.capabilitySummary||{});renderTasks(result.tasks||[])}
async function runAction(task,action){try{await api(`/profiles/${encodeURIComponent(profileId)}/task-runtime/v1/tasks/${encodeURIComponent(task.id)}/actions`,'POST',{action,expectedRevision:task.revision,actionId:crypto.randomUUID()});toast('任务状态已更新');await loadTasks()}catch(error){toast(`操作失败：${error.message}`)}}
function workerErrorMessage(error){
  const details=error?.details?.details||error?.details?.errors;
  if(!Array.isArray(details)||!details.length)return error.message;
  return details.map((item)=>`${Number.isInteger(item.index)?`第 ${item.index+1} 项`:item.field}：${item.code}${item.value?` (${item.value})`:''}`).join('；');
}
async function createTask(event){
  event.preventDefault();$('form-message').textContent='';
  const normalized=normalizeTaskResourceSpec(draft);
  if(!normalized.ok){$('form-message').textContent='请至少添加一个有效资源。';return}
  const start=Date.parse($('task-start').value);const minutes=Number($('task-duration').value);
  try{
    await api(`/profiles/${encodeURIComponent(profileId)}/task-runtime/v1/tasks`,'POST',{name:$('task-name').value,plannedStartAt:start,displayTimezone:Intl.DateTimeFormat().resolvedOptions().timeZone,requiredSeconds:Math.round(minutes*60),resourceSpec:normalized.spec});
    toast(`任务已创建，共 ${taskResourceEntries(normalized.spec).length} 项资源`);draft={hosts:[],urlRules:[],specialTargets:[]};renderResourceList();await loadTasks();
  }catch(error){$('form-message').textContent=`创建失败：${workerErrorMessage(error)}`}
}
async function selectProfile(id){profileId=id;writeLocal('currentProfileId',id);await loadTasks()}
async function init(){
  const local=new Date(Date.now()+5*60*1000);local.setMinutes(local.getMinutes()-local.getTimezoneOffset());$('task-start').value=local.toISOString().slice(0,16);
  updateResourceKind();renderResourceList();
  if(!token){$('auth-gate').classList.remove('hidden');return}
  $('task-app').classList.remove('hidden');
  try{const result=await api('/profiles');profiles=result.profiles||[];const select=$('profile-select');select.replaceChildren(...profiles.map((profile)=>{const option=document.createElement('option');option.value=profile.id;option.textContent=profile.name;return option}));profileId=profiles.some((profile)=>profile.id===profileId)?profileId:profiles[0]?.id||null;select.value=profileId||'';if(profileId)await loadTasks();else $('capability-notice').textContent='请先在家长控制台创建档案。'}catch(error){toast(`加载失败：${error.message}`)}
}
$('profile-select').addEventListener('change',(event)=>selectProfile(event.target.value).catch((error)=>toast(error.message)));
$('refresh-btn').addEventListener('click',()=>loadTasks().catch((error)=>toast(error.message)));
$('resource-kind').addEventListener('change',updateResourceKind);
$('add-resource-btn').addEventListener('click',addResources);
$('task-form').addEventListener('submit',createTask);
init();
