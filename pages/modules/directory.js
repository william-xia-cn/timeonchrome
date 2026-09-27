const list = document.getElementById('modules');
const status = document.getElementById('status');
const retry = document.getElementById('retry');

function validateModules(value) {
  if (!Array.isArray(value)) throw new Error('INVALID_DIRECTORY');
  const ids = new Set();
  return value.map(item => {
    if (!item || !['id', 'label', 'description', 'href'].every(key => typeof item[key] === 'string')) throw new Error('INVALID_MODULE');
    if (!item.id.trim() || !item.label.trim() || ids.has(item.id)) throw new Error('INVALID_MODULE');
    // Only explicit root-relative, same-origin entries; never interpret remote URLs.
    if (!/^\/(?!\/)/.test(item.href) || /[\\\s]/.test(item.href)) throw new Error('INVALID_MODULE_PATH');
    const target = new URL(item.href, location.origin);
    if (target.origin !== location.origin) throw new Error('INVALID_MODULE_ORIGIN');
    ids.add(item.id);
    return { ...item, href: target.pathname + target.search + target.hash };
  });
}

async function load() {
  retry.hidden = true;
  status.textContent = '正在加载模块目录…';
  list.replaceChildren();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('/optional-modules.json', { signal: controller.signal, cache: 'no-cache' });
    if (!response.ok) throw new Error('DIRECTORY_UNAVAILABLE');
    const entries = validateModules(await response.json());
    const cards = entries.map(item => {
      const card = document.createElement('a');
      card.className = 'card';
      card.href = item.href;
      const label = document.createElement('strong');
      label.textContent = item.label;
      const description = document.createElement('span');
      description.textContent = item.description;
      card.append(label, description);
      return card;
    });
    list.replaceChildren(...cards);
    status.textContent = entries.length ? `可用模块：${entries.length}` : '当前没有可用模块';
  } catch {
    status.textContent = '模块目录暂不可用，请重试。';
    retry.hidden = false;
  } finally {
    clearTimeout(timeout);
  }
}
retry.addEventListener('click', load);
void load();
