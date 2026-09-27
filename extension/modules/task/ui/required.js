const MODULE_ID = 'task-management-v1';
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
function entries(spec = {}) {
  return [
    ...(spec.hosts || []).map((value) => ({ type: '域名范围', value, href: `https://${value}/` })),
    ...(spec.urlRules || []).map((rule) => ({ type: rule.match === 'path_prefix' ? '路径范围' : '精确页面', value: rule.url, href: rule.url })),
    ...(spec.specialTargets || []).map((target) => ({ type: ({ video:'YouTube 视频', playlist:'YouTube 播放列表', channel:'YouTube 频道' })[target.type] || 'YouTube 对象', value: target.canonicalTarget, href: target.canonicalTarget })),
  ];
}
function taskHtml(task) {
  const resources = entries(task.resourceSpec);
  const required = Math.max(0, Number(task.requiredSeconds || 0));
  const completed = Math.max(0, Number(task.completedSeconds || 0));
  const remainingMinutes = Math.max(0, Math.ceil(Number(task.remainingSeconds || required - completed) / 60));
  const ratio = required > 0 ? Math.min(100, Math.round(completed / required * 100)) : 0;
  return '<article class="task-card required-task-card"><div class="task-card-head"><div><span class="task-state">必须完成</span><strong>' + escapeHtml(task.name || '未命名任务') + '</strong><small>剩余 ' + remainingMinutes + ' 分钟 · ' + resources.length + ' 项允许资源</small></div><span class="progress-number">' + ratio + '%</span></div>' +
    '<div class="progress-track" aria-label="任务进度"><span style="width:' + ratio + '%"></span></div>' +
    '<div class="task-resource-list">' + (resources.length
      ? resources.map((item) => '<a class="resource-link" href="' + escapeHtml(item.href) + '"><span class="resource-type">' + escapeHtml(item.type) + '</span><code>' + escapeHtml(item.value) + '</code><span class="open-resource">打开 ›</span></a>').join('')
      : '<p class="error">该任务没有有效允许资源。</p>') + '</div></article>';
}
const model = await chrome.runtime.sendMessage({ optionalModuleId: MODULE_ID, type: 'GET_TASK_READ_MODEL' }).catch(() => ({}));
const tasks = model.enforcingTasks || [];
document.getElementById('task-list').innerHTML = tasks.length ? tasks.map(taskHtml).join('') : '<div class="empty-state"><strong>任务状态正在刷新</strong><span>稍后重试或返回上一页。</span></div>';
document.getElementById('back-btn').onclick = () => history.back();
document.getElementById('details-btn').onclick = () => { location.href = chrome.runtime.getURL('modules/task/ui/admin.html'); };