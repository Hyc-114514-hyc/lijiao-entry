(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  const button = document.getElementById('retry');
  const status = document.getElementById('state');
  const checked = document.getElementById('checked');
  const heading = document.querySelector('h1');
  let busy = false, config;
  const validTarget = value => typeof value === 'string' && /^https:\/\/[a-z0-9.-]+\.cpolar\.(cn|com|io)\/?$/i.test(value);
  async function json(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw Error('连接未就绪');
      const text = await response.text();
      if (text.length > 4096) throw Error('网址信息不正确');
      return JSON.parse(text);
    } finally { clearTimeout(timer); }
  }
  function available(target) {
    return new Promise(resolve => {
      const image = new Image(); let done = false;
      const finish = value => { if (done) return; done = true; clearTimeout(timer); image.onload = image.onerror = null; image.src = ''; resolve(value); };
      const timer = setTimeout(() => finish(false), 6000);
      image.referrerPolicy = 'no-referrer';
      image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
      image.onerror = () => finish(false);
      image.src = new URL('/favicon.svg?entry=' + Date.now(), target).href;
    });
  }
  async function check() {
    if (busy) return;
    busy = true; button.disabled = true; checked.textContent = '正在检查…';
    try {
      config ||= await json(new URL('entry-config.json', base));
      if (!/^[a-z0-9][a-z0-9-]*\/[a-z0-9_.-]+$/i.test(config.repository || '') || !/^[a-z0-9_.-]+$/i.test(config.branch || '')) {
        config = null;
        heading.textContent = '固定入口准备中'; status.textContent = '等待完成账号连接'; checked.textContent = '发布设置完成后即可使用。'; return;
      }
      const info = await json('https://raw.githubusercontent.com/' + config.repository + '/' + config.branch + '/target.json?v=' + Math.floor(Date.now() / 15000));
      if (info.service !== 'lijiao' || !validTarget(info.target)) throw Error('尚未取得可用的网址');
      status.textContent = '正在连接服务器';
      if (await available(info.target)) {
        status.textContent = '已连接，正在进入网站';
        location.replace(new URL('/', info.target).href); return;
      }
      heading.textContent = '等待服务器连接'; status.textContent = '服务器暂未连通'; checked.textContent = '电脑启动并连通后，这里会自动进入。';
    } catch {
      heading.textContent = '等待服务器连接'; status.textContent = '暂时无法取得当前网址'; checked.textContent = '稍后会继续自动检查，也可以点击重新检查。';
    } finally { busy = false; button.disabled = false; }
  }
  button.addEventListener('click', check);
  setInterval(() => { if (!document.hidden) void check(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
  void check();
})();
