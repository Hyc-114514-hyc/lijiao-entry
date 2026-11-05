(() => {
  'use strict';
  const protocol = 'lijiao-entry-identity-v1';
  const service = 'lijiao-verified';
  const base = new URL('.', document.currentScript.src);
  const button = document.getElementById('retry');
  const status = document.getElementById('state');
  const checked = document.getElementById('checked');
  const heading = document.querySelector('h1');
  let busy = false, config, verifier;

  function canonicalTarget(value) {
    if (typeof value !== 'string' || value.length > 262 || !/^https:\/\/[a-z0-9.-]+\.cpolar\.(cn|com|io)\/?$/i.test(value)) return null;
    try {
      const url = new URL(value);
      if (url.hostname.length > 253 || !url.hostname.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return null;
      return url.origin;
    } catch { return null; }
  }

  function validConfig(value) {
    const identity = value?.identity, key = identity?.publicKey;
    return !!value && value.protocol === protocol
      && /^[a-z0-9][a-z0-9-]*\/[a-z0-9_.-]+$/i.test(value.repository || '')
      && /^[a-z0-9_.-]+$/i.test(value.branch || '')
      && /^[a-f0-9]{64}$/.test(identity?.id || '')
      && identity.algorithm === 'ECDSA-P256-SHA256'
      && key?.kty === 'EC' && key.crv === 'P-256'
      && /^[A-Za-z0-9_-]{43}$/.test(key.x || '')
      && /^[A-Za-z0-9_-]{43}$/.test(key.y || '')
      && Object.keys(key).every(name => ['kty', 'crv', 'x', 'y'].includes(name));
  }

  async function json(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let reader;
    try {
      const response = await fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'error', mode: 'cors', signal: controller.signal });
      if (!response.ok || Number(response.headers.get('content-length')) > 16384 || !response.body) throw Error('连接未就绪');
      reader = response.body.getReader();
      const decoder = new TextDecoder(); let text = '', bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.length;
        if (bytes > 16384) throw Error('响应内容过长');
        text += decoder.decode(chunk.value, { stream: true });
        if (text.length > 4096) throw Error('响应内容过长');
      }
      text += decoder.decode();
      if (text.length > 4096) throw Error('响应内容过长');
      return JSON.parse(text);
    } finally {
      if (reader) await reader.cancel().catch(() => {});
      clearTimeout(timer);
    }
  }

  async function loadConfig() {
    if (config && verifier) return;
    const url = new URL('entry-config.json', base);
    url.searchParams.set('v', String(Math.floor(Date.now() / 15000)));
    const next = await json(url);
    if (!validConfig(next)) throw Error('入口设置尚未完成');
    const key = next.identity.publicKey;
    const imported = await crypto.subtle.importKey('jwk', { kty: key.kty, crv: key.crv, x: key.x, y: key.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    config = next; verifier = imported;
  }

  async function verifyServer(target) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    const url = new URL('/api/server/identity', target);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('target', target);
    const proof = await json(url);
    if (!proof || proof.service !== service || proof.protocol !== protocol
      || proof.identityId !== config.identity.id || proof.target !== target || proof.nonce !== nonce
      || !Number.isSafeInteger(proof.issuedAt) || proof.issuedAt <= 0
      || typeof proof.signature !== 'string' || !/^[A-Za-z0-9_-]{85}[AQgw]$/.test(proof.signature)) return false;
    const decoded = atob(proof.signature.replace(/-/g, '+').replace(/_/g, '/') + '==');
    if (decoded.length !== 64) return false;
    const signature = Uint8Array.from(decoded, character => character.charCodeAt(0));
    const message = new TextEncoder().encode(`${protocol}\n${proof.identityId}\n${target}\n${nonce}\n${proof.issuedAt}`);
    // A fresh unpredictable nonce provides replay protection without depending
    // on the phone and server having identical wall clocks.
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifier, signature, message);
  }

  async function check() {
    if (busy) return;
    busy = true; button.disabled = true; checked.textContent = '正在检查…';
    let stage = 'browser';
    try {
      if (!globalThis.isSecureContext || !globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function') throw Error('浏览器无法进行安全身份验证');
      stage = 'config';
      await loadConfig();
      stage = 'address';
      const info = await json('https://raw.githubusercontent.com/' + config.repository + '/' + config.branch + '/target.json?v=' + Math.floor(Date.now() / 15000));
      stage = 'identity';
      const target = canonicalTarget(info?.target);
      if (!info || info.service !== service || info.protocol !== protocol || info.identityId !== config.identity.id || !target) {
        // Re-read trusted entry settings on the next attempt, including after
        // a deliberate identity-key rotation. Legacy address records fail closed.
        config = null; verifier = null;
        throw Error('尚未确认服务器身份');
      }
      heading.textContent = '正在连接服务器'; status.textContent = '正在验证服务器身份';
      if (!await verifyServer(target)) throw Error('尚未确认服务器身份');
      heading.textContent = '服务器身份已确认'; status.textContent = '正在进入网站'; checked.textContent = '';
      location.replace(new URL('/', target).href);
    } catch {
      if (stage === 'browser') {
        heading.textContent = '暂时无法验证服务器'; status.textContent = '浏览器不支持安全身份验证'; checked.textContent = '请使用更新版本的浏览器访问此入口。';
      } else if (stage === 'config') {
        config = null; verifier = null;
        heading.textContent = '固定入口准备中'; status.textContent = '入口设置尚未完成'; checked.textContent = '稍后会自动重新检查。';
      } else if (stage === 'identity') {
        heading.textContent = '等待服务器连接'; status.textContent = '暂时无法确认服务器身份'; checked.textContent = '身份验证通过后才会进入网站，稍后会自动重试。';
      } else {
        heading.textContent = '等待服务器连接'; status.textContent = '暂时无法取得当前网址'; checked.textContent = '稍后会继续自动检查，也可以点击重新检查。';
      }
    } finally { busy = false; button.disabled = false; }
  }
  button.addEventListener('click', check);
  setInterval(() => { if (!document.hidden) void check(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
  void check();
})();
