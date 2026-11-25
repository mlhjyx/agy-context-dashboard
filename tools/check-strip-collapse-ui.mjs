// End-to-end headless Chromium/Chrome CDP regression for PR #84 (main composer
// model selector truncation protection) + Issue #72 (persistent minimal/full
// strip collapse). Zero external dependencies.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { accessSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CdpConnection } from '../compat/runtime-ui.mjs';
import { trajectoryMetrics } from '../sidecars/panel/metrics.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const extract = s => s.slice(s.indexOf('module.exports = ') + 17).trim().replace(/;$/, '');

function findBrowser() {
  const candidates = [
    process.env.AG_EDGE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  for (const file of candidates) {
    try { accessSync(file); return file; } catch {}
  }
  return null;
}

const BROWSER_EXE = findBrowser();
if (!BROWSER_EXE) {
  console.log('SKIP: No Chromium/Chrome/Edge executable found');
  process.exit(0);
}

async function launchBrowser(userDataDir, url) {
  const child = spawn(BROWSER_EXE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, url,
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  child.unref();
  let cdp = null;
  try {
    const port = await new Promise((resolve, reject) => {
      let errText = '';
      const timer = setTimeout(() => reject(new Error('Browser start timeout: ' + errText)), 30000);
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', chunk => {
        errText += chunk;
        const m = errText.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
        if (m) { clearTimeout(timer); resolve(Number(m[1])); }
      });
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Browser exited ' + code)); });
    });
    let target;
    for (let i = 0; i < 150; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1'));
        if (target) break;
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    if (!target) throw new Error('Page target not found');
    cdp = new CdpConnection(target.webSocketDebuggerUrl, { timeout: 30000 });
    await cdp.open();
    await cdp.command('Runtime.enable');
    await cdp.command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    return { child, cdp };
  } catch (err) {
    try { cdp?.close(); } catch {}
    try { child.kill('SIGKILL'); } catch {}
    throw err;
  }
}

const [i18nSrc, themeSrc, widgetSrc, surfaceSrc] = await Promise.all(
  ['compat/i18n.cjs', 'compat/theme.cjs', 'compat/inline-widget.cjs', 'ide/surface.cjs'].map(p => readFile(join(REPO, p), 'utf8'))
);

const id = '11111111-1111-1111-1111-111111111111';
const reset5h = new Date(Date.now() + 3 * 3600000).toISOString();
const resetWk = new Date(Date.now() + 5 * 86400000).toISOString();
const speed = trajectoryMetrics({
  trajectory: {
    cascadeId: id,
    steps: [{ type: 'USER_INPUT' }],
    generatorMetadata: [{
      chatModel: {
        modelDisplayName: 'Gemini 4 Hydrogen (Medium)',
        chatStartMetadata: { contextWindowMetadata: { estimatedTokensUsed: 310000, maxContextTokens: 500000 } },
        usage: { messageId: 'm1', inputTokens: '1000000', cacheReadTokens: '800000', outputTokens: '50000', responseOutputTokens: '50000', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI' },
        streamingDuration: '1.5s',
      },
    }],
  },
});

let prefs = { language: 'en', languageGuideDismissed: true, revision: 1 };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      connection: 'live', theme: 'light', preferences: prefs, serverTime: new Date().toISOString(),
      groups: [{ id: 'gemini', name: 'Gemini', windows: { '5h': { available: true, remaining: 0.8, resetAt: reset5h }, weekly: { available: true, remaining: 0.9, resetAt: resetWk } } }],
      speed,
    }));
    return;
  }
  if (url.pathname === '/api/preferences') {
    if (req.method === 'POST') {
      const body = await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(JSON.parse(d))); });
      prefs = { ...prefs, ...body, revision: prefs.revision + 1 };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(prefs));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#f5f7fb;color:#0f172a;font:13px sans-serif}
    .composer{width:880px;margin:0 auto;padding:12px;border-radius:14px;background:#fff;border:1px solid #ddd}
    .editor{height:36px}.actions{display:flex;align-items:center;justify-content:space-between;gap:6px}.left,.right{display:flex;align-items:center;gap:6px}
    [data-testid="model-selector-trigger"]{display:inline-flex;align-items:center;overflow:hidden;min-width:32px;max-width:100%}
    [data-testid="model-selector-trigger"] span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    button{background:transparent;border:0;color:inherit;height:28px;font:inherit;white-space:nowrap}
  </style></head><body><div class="composer"><div class="editor" contenteditable="true" role="combobox"></div><div class="actions"><div class="left"><button aria-label="Add">+</button><button data-testid="model-selector-trigger"><span>Gemini 4 Hydrogen (Medium)</span></button></div><div class="right"><button aria-label="Send">Send</button></div></div></div><script>
    history.replaceState({}, '', '/c/${id}');
    window.agPulseHost = {
      getMetrics: async () => (await fetch('/api/metrics')).json(),
      getPreferences: async () => (await fetch('/api/preferences')).json(),
      setPreferences: async input => (await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).json(),
      report: () => {},
    };
    window.__agPulseTestSurface = (${extract(surfaceSrc)})();
    window.__agPulseI18nFactory = (${extract(i18nSrc)});
    window.__agPulseThemeFactory = (${extract(themeSrc)});
    (${extract(widgetSrc)})();
  </script></body></html>`);
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const userDir = await mkdtemp(join(tmpdir(), 'ag-strip-ui-'));
let browser;
try {
  browser = await launchBrowser(userDir, `http://127.0.0.1:${port}/`);
  const evalJs = async fn => {
    const res = await browser.cdp.command('Runtime.evaluate', { expression: `(${fn})()`, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text || 'Eval failed');
    return res.result?.value;
  };
  const waitUntil = async (fn, label) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (await evalJs(fn)) return;
      await new Promise(r => setTimeout(r, 80));
    }
    throw new Error('Timeout: ' + label);
  };

  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'full', 'initial full density');

  // 0. Medium-width main composer (758px, matching real Antigravity with XHigh model)
  // keeps numbers + cache-hit visible via compact-text instead of premature icons-only.
  await evalJs(() => { document.querySelector('.composer').style.width = '758px'; });
  await waitUntil(() => ['full', 'compact-text'].includes(document.getElementById('ag-pulse-status-bar')?.dataset.density), '758px stays in text density');
  const medState = await evalJs(() => {
    const n = document.getElementById('ag-pulse-status-bar');
    const sr = n.shadowRoot;
    return {
      density: n.dataset.density,
      cacheHit: getComputedStyle(sr.getElementById('cache-hit')).display,
      tps: getComputedStyle(sr.getElementById('tps')).display,
      span: document.querySelector('[data-testid="model-selector-trigger"] span'),
    };
  });
  assert.notEqual(medState.cacheHit, 'none', 'cache-hit stays visible at 758px');
  assert.notEqual(medState.tps, 'none', 'tps stays visible at 758px');

  // 1. PR #84: shrinking main composer preserves model selector width by dropping to icons-only
  await evalJs(() => { document.querySelector('.composer').style.width = '480px'; });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'icons', 'narrow main composer drops to icons');
  const modelTruncated = await evalJs(() => {
    const span = document.querySelector('[data-testid="model-selector-trigger"] span');
    return span.scrollWidth > span.clientWidth + 1;
  });
  assert.equal(modelTruncated, false, 'model selector text must not be truncated');

  // 2. Restore width -> click #strip-toggle -> Issue #72 minimal mode persists
  await evalJs(() => { document.querySelector('.composer').style.width = '880px'; });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'full', 'restores full');
  await evalJs(() => { document.getElementById('ag-pulse-status-bar').shadowRoot.getElementById('strip-toggle').click(); });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.stripMode === 'minimal', 'switches to minimal');
  assert.equal(prefs.stripMode, 'minimal');

  const minimalState = await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    const vis = sel => getComputedStyle(sr.querySelector(sel)).display !== 'none';
    return {
      density: document.getElementById('ag-pulse-status-bar').dataset.density,
      hasIconsOnly: document.getElementById('ag-pulse-status-bar').classList.contains('icons-only'),
      speed: vis('[data-card="speed"]'),
      cache: vis('[data-card="cache"]'),
      quota: vis('[data-card="quota"]'),
      context: vis('[data-card="context"]'),
      toggle: vis('#strip-toggle'),
    };
  });
  assert.equal(minimalState.density, 'minimal');
  assert.equal(minimalState.hasIconsOnly, true);
  assert.equal(minimalState.speed, true);
  assert.equal(minimalState.cache, true);
  assert.equal(minimalState.quota, true);
  assert.equal(minimalState.context, true);
  assert.equal(minimalState.toggle, true);

  // 3. Narrow width in minimal mode degrades to minimal-icon cleanly
  await evalJs(() => { document.querySelector('.composer').style.width = '310px'; });
  await waitUntil(() => ['minimal', 'minimal-icon'].includes(document.getElementById('ag-pulse-status-bar')?.dataset.density), 'minimal degrades cleanly');

  // 4. Restore width and expand back via hover card footer button
  await evalJs(() => { document.querySelector('.composer').style.width = '880px'; });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'minimal', 'minimal recovers');
  await evalJs(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    sr.querySelector('[data-card="context"]').click();
    sr.getElementById('strip-mode-full').click();
  });
  await waitUntil(() => document.getElementById('ag-pulse-status-bar')?.dataset.density === 'full', 'expands back to full via footer toggle');
  assert.equal(prefs.stripMode, 'full');

  console.log('PASS: check-strip-collapse-ui (PR #84 + Issue #72 combined)');
} finally {
  if (browser) {
    try { browser.cdp.close(); } catch {}
    try { browser.child.kill('SIGKILL'); } catch {}
  }
  server.close();
  await rm(userDir, { recursive: true, force: true });
}
