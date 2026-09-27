/* Parent-only derived review UI; no access classification or accounting writes. */
(() => {
  const style = document.createElement('style');
  style.textContent = `
    .composite-review-section{padding:20px 0;margin:20px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
    .composite-review-section h3{font-size:18px;margin-bottom:10px}
    .composite-review-note{color:var(--muted);font-size:13px;line-height:1.6;margin:10px 0}
    .composite-review-controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .composite-review-section details{border-top:1px solid var(--border);padding:12px 0}
    .composite-review-section summary{cursor:pointer;line-height:1.6;overflow-wrap:anywhere}
    .composite-page-row{padding:14px 0;border-bottom:1px solid var(--border);overflow-wrap:anywhere;font-size:13px;line-height:1.7}
    .composite-page-fields{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
    .composite-page-fields select,.composite-page-fields input{max-width:100%;min-width:0;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)}
    .composite-page-fields input{flex:1 1 200px}
    @media(max-width:600px){.composite-page-fields{align-items:stretch}.composite-page-fields input{flex-basis:100%}.composite-review-section{padding:16px 0}}
  `;
  document.head.append(style);
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  let loadSequence = 0;
  let loadedProfile = null;
  const isCurrent = (profileId, sequence) => profileId === currentProfileId && sequence === loadSequence;
  window.resetCompositeReviews = () => {
    ++loadSequence;
    loadedProfile = null;
    document.getElementById('composite-review-list').replaceChildren();
    document.getElementById('composite-review-usage').replaceChildren();
    document.getElementById('composite-review-enabled').checked = false;
    document.getElementById('composite-review-save').disabled = true;
    status('请选择孩子并读取复核配置。');
  };
  const status = (text) => { document.getElementById('composite-review-status').textContent = text; };
  const profilePath = (profileId) => `/profiles/${encodeURIComponent(profileId)}/composite-reviews/v1`;

  async function renderDetail(profileId, review, container, sequence) {
    container.replaceChildren(el('p', '正在读取证据…'));
    try {
      const detail = await api(`${profilePath(profileId)}/${encodeURIComponent(review.id)}`);
      if (!isCurrent(profileId, sequence)) return;
      review = detail.review;
      container.replaceChildren();
      container.append(el('p', `更正后复合用量 ${fmtSecs(review.total_seconds)} · 纳入分析用量 ${fmtSecs(detail.rawSeconds)} · 无法归属 ${fmtSecs(detail.unassignedSeconds)}`));
      container.append(el('p', detail.complete ? '证据完整' : '证据不完整，不能据此断言完整使用内容', 'composite-review-note'));
      if (detail.publishedRawDeltaSeconds !== 0) container.append(el('p', `单账与纳入分析原始账差额：${detail.publishedRawDeltaSeconds} 秒（不是调账）`));
      const deviceDetails = el('details'); deviceDetails.append(el('summary', '设备证据与数据截止点'));
      for (const [index, device] of detail.devices.entries()) deviceDetails.append(el('p', `设备 ${index + 1} · ${new Date(device.cutoff).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} 北京时间 · ${device.evidenceStatus} · 纳入分析 ${fmtSecs(device.rawSeconds)}`));
      container.append(deviceDetails);
      for (const page of detail.pages) {
        const row = el('div', undefined, 'composite-page-row');
        row.append(el('strong', page.title || '未取得标题'), el('div', `${page.host}${page.path}`), el('div', fmtSecs(page.seconds)));
        row.append(el('div', `建议：${{ study: '学习', rest: '休息', unknown: '无法判断' }[page.suggestion.verdict]}；${page.suggestion.reason}`, 'composite-review-note'));
        const fields = el('div', undefined, 'composite-page-fields'), verdict = el('select');
        verdict.setAttribute('aria-label', '页面复核意见');
        for (const [value, label] of [['', '尚未复核'], ['study', '学习'], ['rest', '休息'], ['unknown', '无法判断']]) {
          const option = el('option', label); option.value = value; verdict.append(option);
        }
        verdict.value = page.opinion?.verdict || '';
        const reason = el('input'); reason.maxLength = 300; reason.placeholder = '复核理由（可选，请勿填写敏感信息）'; reason.value = page.opinion?.reason || ''; reason.setAttribute('aria-label', '复核理由');
        const save = el('button', '保存意见', 'btn-add'); save.type = 'button';
        save.onclick = async () => {
          if (!verdict.value || !isCurrent(profileId, sequence)) return;
          save.disabled = true;
          try {
            await api(`${profilePath(profileId)}/${encodeURIComponent(review.id)}/opinion`, 'POST', { pageKey: page.pageKey, verdict: verdict.value, reason: reason.value });
            if (isCurrent(profileId, sequence)) {
              toast('意见已保存；记账和配额不变');
              await window.loadCompositeReviews();
            }
          } catch { if (isCurrent(profileId, sequence)) toast('保存失败，请刷新重试', false); } finally { save.disabled = false; }
        };
        fields.append(verdict, reason, save); row.append(fields); container.append(row);
      }
      if (review.details_deleted_at) container.append(el('p', '页面详情已清除；使用账本保持不变。'));
      else {
        const remove = el('button', '删除页面详情', 'btn-add'); remove.type = 'button';
        remove.onclick = async () => {
          if (!isCurrent(profileId, sequence) || !confirm('删除此项全部页面详情？使用时长和原始账本不会被删除。')) return;
          remove.disabled = true;
          try { await api(`${profilePath(profileId)}/${encodeURIComponent(review.id)}`, 'DELETE'); if (isCurrent(profileId, sequence)) await window.loadCompositeReviews(); }
          catch { if (isCurrent(profileId, sequence)) toast('删除失败，请稍后重试', false); }
          finally { remove.disabled = false; }
        };
        container.append(remove);
      }
    } catch { if (isCurrent(profileId, sequence)) container.replaceChildren(el('p', '证据暂不可用，请刷新重试。')); }
  }

  window.loadCompositeReviews = async () => {
    const profileId = currentProfileId, sequence = ++loadSequence;
    loadedProfile = null;
    document.getElementById('composite-review-save').disabled = true;
    if (!profileId) { window.resetCompositeReviews(); return; }
    document.getElementById('composite-review-enabled').checked = remoteConfig?.compositeReviewConfig?.enabled === true;
    status('正在读取云端已确认用量…');
    const list = document.getElementById('composite-review-list'); list.replaceChildren();
    document.getElementById('composite-review-usage').replaceChildren();
    try {
      const data = await api(profilePath(profileId));
      if (sequence !== loadSequence || profileId !== currentProfileId) return;
      loadedProfile = profileId;
      document.getElementById('composite-review-enabled').checked = data.enabled === true;
      document.getElementById('composite-review-save').disabled = !Number.isInteger(remoteConfigVersion);
      status(`${data.enabled ? '已开启' : '已关闭'} · 云端已确认账；不包含设备未上传用量 · 不完整证据会单列`);
      const usage = document.getElementById('composite-review-usage');
      for (const site of data.usage) usage.append(el('p', `${site.site} · 今日 ${fmtSecs(site.todaySeconds)} · 本周 ${fmtSecs(site.weekSeconds)}`));
      for (const review of data.reviews) {
        const details = el('details'), content = el('div');
        details.append(el('summary', `${review.date} · ${review.site} · ${fmtSecs(review.total_seconds)} · ${review.details_deleted_at ? '详情已清除' : review.reviewed_at ? '已复核' : '待复核 / 证据待核验'}`), content);
        details.addEventListener('toggle', () => { if (details.open && !content.childNodes.length && isCurrent(profileId, sequence)) void renderDetail(profileId, review, content, sequence); });
        list.append(details);
      }
      if (!data.reviews.length) list.append(el('p', '暂无达到复核线的复合网站。'));
    } catch { if (sequence === loadSequence) status('复核数据暂不可用；现有管控与记账不受影响。'); }
  };
  document.getElementById('composite-review-refresh').onclick = () => void window.loadCompositeReviews();
  document.getElementById('composite-review-save').onclick = async () => {
    const enabled = document.getElementById('composite-review-enabled').checked, profileId = currentProfileId;
    const sequence = loadSequence;
    if (!profileId || loadedProfile !== profileId) return;
    if (enabled && remoteConfig?.compositeReviewConfig?.enabled !== true && !confirm('启用后会记录复合网站脱敏路径与标题，并在达到 30 分钟后上传。是否确认启用当前孩子的页面分析？')) return;
    document.getElementById('composite-review-save').disabled = true;
    try {
      await saveProfileConfig({ compositeReviewConfig: { enabled } }, 'composite_review_settings');
      if (!isCurrent(profileId, sequence)) return;
      const config = await api(`/profiles/${encodeURIComponent(profileId)}/config`);
      if (!isCurrent(profileId, sequence)) return;
      applyProfileConfigResponse(config);
      await window.loadCompositeReviews();
      if (profileId === currentProfileId) toast('页面分析配置已保存');
    } catch { if (isCurrent(profileId, sequence)) toast('保存失败，请刷新档案后重试', false); }
    finally { if (isCurrent(profileId, sequence)) document.getElementById('composite-review-save').disabled = false; }
  };
})();
