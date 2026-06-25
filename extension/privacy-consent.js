import { acceptPrivacyConsent, getPrivacyConsent, PRIVACY_POLICY_URL } from './core/privacy-consent.js';

function nextUrlFromQuery() {
  const params = new URLSearchParams(location.search);
  const next = params.get('next') || 'bind.html?welcome=1';
  if (/^https?:\/\//i.test(next)) return 'bind.html?welcome=1';
  if (next.startsWith('chrome-extension:')) return 'bind.html?welcome=1';
  return next.replace(/^\/+/, '') || 'bind.html?welcome=1';
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = text || '';
  el.style.display = text ? 'block' : 'none';
}

async function init() {
  const link = document.getElementById('privacy-link');
  if (link) link.href = PRIVACY_POLICY_URL;

  const state = await getPrivacyConsent();
  if (state.accepted) {
    location.replace(nextUrlFromQuery());
    return;
  }

  document.getElementById('decline-btn')?.addEventListener('click', () => {
    setStatus('TimeOnChrome 将保持暂停；在同意前不会启动新的计时、云同步或设备恢复。');
  });

  document.getElementById('accept-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('accept-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '正在启用...';
    }
    try {
      await acceptPrivacyConsent('privacy_consent_page');
      await chrome.runtime.sendMessage({ type: 'PRIVACY_CONSENT_ACCEPTED', source: 'privacy_consent_page' }).catch(() => null);
      location.replace(nextUrlFromQuery());
    } catch (error) {
      setStatus(`保存同意状态失败：${error?.message || '未知错误'}`);
      if (btn) {
        btn.disabled = false;
        btn.textContent = '我已阅读并同意，启用 TimeOnChrome';
      }
    }
  });
}

init().catch((error) => setStatus(error?.message || '页面初始化失败'));
