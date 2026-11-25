// Browser E2E verification for Issue #60: inline status bar chip visibility toggles,
// Context ring secondary label 3-way switcher, chip reordering, >=1 visible guard,
// zero-lockout footer migration, and reset to defaults.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const extract = s => s.slice(s.indexOf('module.exports = ') + 17).trim().replace(/;$/, '');
const sources = await Promise.all(['compat/i18n.cjs', 'compat/theme.cjs', 'compat/inline-widget.cjs', 'compat/usage-ui.cjs'].map(p => readFile(join(repo, p), 'utf8')));

const cid = '11111111-1111-1111-1111-111111111111';
let prefs = { language: 'zh-CN', languageGuideDismissed: true, revision: 1 };
const snapshot = () => ({
  connection: 'live',
  serverTime: new Date().toISOString(),
  quotaUpdatedAt: new Date().toISOString(),
  preferences: prefs,
  groups: [{ id: 'gemini', name: 'Gemini', windows: { '5h': { available: true, remaining: 0.74 }, weekly: { available: true, remaining: 0.89 } } }],
  speed: {
    conversationId: cid,
    rounds: 18,
    steps: 76,
    tps: 120.5,
    e2eTps: 80.2,
    latestTps: 125.4,
    peakTps: 150.0,
    measuredRequests: 12,
    requests: 12,
    model: 'Gemini 4 Hydrogen (High)',
    counts: { output: 2400, responseOutput: 1800, thinkingOutput: 600 },
    cache: { hitRate: 0.85, totalTokens: 1200000, readTokens: 1020000, missTokens: 180000, outputTokens: 2400, measuredRequests: 12 },
    context: { usedTokens: 343000, maxTokens: 512000, usedFraction: 343000 / 512000, remainingFraction: 169000 / 512000, model: 'Gemini 4 Hydrogen (High)' },
  },
});

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#ffffff;color:#202631;font:13px sans-serif;padding:40px}
.rounded-composer{max-width:960px;margin:280px auto 0;background:#f6f7f9;padding:12px;border-radius:18px}
.editor{height:40px}.actions{display:flex;align-items:center;gap:6px}.left{display:flex;flex:1;min-width:0;gap:6px}.right{display:flex;gap:5px}button{background:transparent;border:0;color:inherit;height:28px}
</style></head><body><div class="rounded-composer"><div class="editor" contenteditable="true" role="combobox" aria-label="Message input"></div><div class="actions"><div class="left"><button aria-label="Add context">＋</button><button data-testid="model-selector-trigger">Gemini 4 Hydrogen (High)</button></div><div class="right"><button aria-label="Record voice memo">♩</button><button aria-label="Send message">➜</button></div></div></div><script>
history.replaceState({}, '', '/c/${cid}');
window.agPulseHost = {
  getMetrics: async () => await (await fetch('/api/metrics')).json(),
  getPreferences: async () => await (await fetch('/api/preferences')).json(),
  setPreferences: async input => await (await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).json(),
};
window.__agPulseI18nFactory = (${extract(sources[0])});
window.__agPulseThemeFactory = (${extract(sources[1])});
window.__agPulseUsageFactory = (${extract(sources[3])});
(${extract(sources[2])})();
</script></body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/metrics') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(snapshot())); return; }
  if (url.pathname === '/api/preferences') {
    if (req.method === 'POST') { let b = ''; for await (const c of req) b += c; prefs = { ...prefs, ...JSON.parse(b), revision: prefs.revision + 1 }; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(prefs)); return;
  }
  res.setHeader('Content-Type', 'text/html;charset=utf-8');
  res.end(html);
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch(process.platform === 'win32' && !process.env.CI ? { channel: 'msedge', headless: true } : { headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/');
  const s = page.locator('#ag-pulse-status-bar');
  await s.waitFor();
  await s.locator('[data-card=context]').waitFor({ state: 'visible' });
  await s.locator('#context-rounds').waitFor({ state: 'visible' });

  const chipOrder = () => s.locator('.bar > [data-card]').evaluateAll(els => els.map(e => e.dataset.card));
  const visibleChips = () => s.locator('.bar > [data-card]').evaluateAll(els => els.filter(e => !e.hidden).map(e => e.dataset.card));

  assert.deepEqual(await chipOrder(), ['speed', 'cache', 'quota', 'context']);
  assert.deepEqual(await visibleChips(), ['speed', 'cache', 'quota', 'context']);
  assert.equal(await s.locator('#context-rounds').isVisible(), true);
  assert.equal(await s.locator('[data-card=context] .context-label').isVisible(), false);

  // Open Context card and click Settings button to open non-modal anchored Settings popover above the bar
  await s.locator('[data-card=context]').click();
  await s.locator('#pulse-settings-toggle').click();
  await s.locator('#pulse-settings-dialog').waitFor({ state: 'visible' });
  assert.equal(await s.locator('#pulse-settings-dialog').getAttribute('data-open'), 'true');
  assert.equal(await s.locator('#pulse-settings-dialog').getAttribute('aria-modal'), 'false');
  const box = await s.locator('#pulse-settings-dialog').boundingBox();
  const barBox = await s.locator('.bar').boundingBox();
  assert.ok(box && barBox && box.y + box.height <= barBox.y + 1, `settings panel (${box?.y}+${box?.height}) must stay above bar (${barBox?.y}) without covering it`);

  // Verify bar stays transparent by default (no outer capsule) and context ring renders visibly before/during/after customization
  const initialBarBg = await s.locator('.bar').evaluate(el => getComputedStyle(el).backgroundColor);
  const initialBarBorder = await s.locator('.bar').evaluate(el => getComputedStyle(el).borderTopWidth);
  const initialCtxRingBg = await s.locator('#context-ring').evaluate(el => getComputedStyle(el).backgroundImage);
  assert.equal(initialBarBg, 'rgba(0, 0, 0, 0)');
  assert.equal(initialBarBorder, '0px');
  assert.match(initialCtxRingBg, /^conic-gradient\(/);

  await s.locator('[data-bar-color-slot=speed][data-bar-color-preset="#7c3aed"]').click();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('ag-pulse-status-bar')).getPropertyValue('--pulse-bar-speed') !== '');
  const customLightSpeed = await s.locator('#tps').evaluate(el => getComputedStyle(el).color);
  await s.locator('[data-bar-color-picker=token]').fill('#d97706');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('ag-pulse-status-bar')).getPropertyValue('--pulse-bar-token') !== '');
  await s.locator('[data-bar-color-slot=quota][data-bar-color-preset="#0284c7"]').click();
  await s.locator('[data-bar-color-slot=context][data-bar-color-preset="#16a34a"]').click();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('ag-pulse-status-bar')).getPropertyValue('--pulse-bar-context') !== '');
  const customCtxRingBg = await s.locator('#context-ring').evaluate(el => getComputedStyle(el).backgroundImage);
  assert.match(customCtxRingBg, /^conic-gradient\(/);
  assert.notEqual(customCtxRingBg, initialCtxRingBg);
  await page.waitForTimeout(100);
  assert.deepEqual(prefs.barColors, { speed: '#7c3aed', token: '#d97706', quota: '#0284c7', context: '#16a34a' });

  await s.locator('[data-theme-mode-choice=dark]').click();
  assert.equal(await s.getAttribute('data-pulse-theme'), 'dark');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('ag-pulse-status-bar')).getPropertyValue('--pulse-bar-speed') !== '');
  const customDarkSpeed = await s.locator('#tps').evaluate(el => getComputedStyle(el).color);
  assert.notEqual(customLightSpeed, customDarkSpeed);
  assert.equal(await s.locator('.bar').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  await page.waitForTimeout(80);
  assert.equal(prefs.themeMode, 'dark');

  await s.locator('[data-bar-color-default=speed]').click();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('ag-pulse-status-bar')).getPropertyValue('--pulse-bar-speed') === '');
  await page.waitForTimeout(80);
  assert.equal(prefs.barColors.speed, undefined);
  await s.locator('[data-cache-hit-tone-choice=semantic]').click();
  assert.equal(await s.getAttribute('data-cache-hit-tone'), 'semantic');
  await page.waitForTimeout(80);
  assert.equal(prefs.cacheHitTone, 'semantic');

  // Switch Context ring secondary label: rounds -> label -> compact -> rounds
  await s.locator('[data-ctx-chip-mode=label]').click();
  await s.locator('[data-card=context] .context-label').waitFor({ state: 'visible' });
  assert.equal(await s.locator('#context-rounds').isVisible(), false);

  await s.locator('[data-ctx-chip-mode=compact]').click();
  assert.equal(await s.locator('[data-card=context] .context-label').isVisible(), false);
  assert.equal(await s.locator('#context-rounds').isVisible(), false);

  await s.locator('[data-ctx-chip-mode=rounds]').click();
  await s.locator('#context-rounds').waitFor({ state: 'visible' });

  // Move 'context' up one slot -> ['speed', 'cache', 'context', 'quota']
  await s.locator('[data-bar-row="context"] [data-bar-move="-1"]').click();
  assert.deepEqual(await chipOrder(), ['speed', 'cache', 'context', 'quota']);
  assert.deepEqual(prefs.barOrder, ['speed', 'cache', 'context', 'quota']);

  // Hide speed, cache, quota -> context stays visible and its switch becomes disabled (>= 1 guard)
  for (const id of ['speed', 'cache', 'quota']) {
    await s.locator(`[data-bar-row=${id}] .bar-switch`).click();
  }
  assert.deepEqual(await visibleChips(), ['context']);
  assert.equal(await s.locator('[data-bar-row=context] .bar-switch').isDisabled(), true);

  // Re-enable speed, then hide context -> footer migrates cleanly into #speed-card (zero lockout)
  await s.locator('[data-bar-row=speed] .bar-switch').click();
  await s.locator('[data-bar-row=context] .bar-switch').click();
  assert.deepEqual(await visibleChips(), ['speed']);
  await s.locator('#pulse-settings-close').click();
  await s.locator('[data-card=speed]').click();
  await s.locator('#speed-card #pulse-settings-toggle').waitFor({ state: 'visible' });

  // Test Back button returns directly from Settings to Context card, and click outside closes Settings
  await s.locator('#speed-card #pulse-settings-toggle').click();
  await s.locator('#bar-customize-reset').click();
  assert.deepEqual(await chipOrder(), ['speed', 'cache', 'quota', 'context']);
  assert.deepEqual(await visibleChips(), ['speed', 'cache', 'quota', 'context']);
  assert.deepEqual(prefs.barColors, {});
  assert.equal(prefs.themeMode, 'auto');
  assert.equal(prefs.cacheHitTone, 'accent');
  assert.match(await s.locator('#context-ring').evaluate(el => getComputedStyle(el).backgroundImage), /^conic-gradient\(/);
  await s.locator('#pulse-settings-back').click();
  await s.locator('#context-card #pulse-settings-toggle').waitFor({ state: 'visible' });
  assert.equal(await s.locator('#pulse-settings-dialog').isVisible(), false);

  // Verify quota ring card does not render a duplicate Settings button when context is visible
  await s.locator('[data-card=quota]').click();
  await s.locator('#quota-card').waitFor({ state: 'visible' });
  assert.equal(await s.locator('#quota-card #quota-settings-toggle').count(), 0);
  assert.equal(await s.locator('#quota-card #pulse-settings-toggle').count(), 0);

  // Verify #cache-card inline hit-rate quick toggle stays visible and syncs bidirectionally with Settings
  await s.locator('[data-card=cache]').click();
  await s.locator('#cache-inline-hit-row').waitFor({ state: 'visible' });
  assert.equal(await s.locator('#cache-hit').isVisible(), true);
  await s.locator('#cache-card-hit-off').click();
  await page.waitForFunction(() => document.getElementById('ag-pulse-status-bar')?.getAttribute('data-inline-cache-hit') === 'false');
  assert.equal(await s.locator('#cache-hit').isVisible(), false);
  await s.locator('[data-card=context]').click();
  await s.locator('#pulse-settings-toggle').click();
  await s.locator('#pulse-settings-dialog').waitFor({ state: 'visible' });
  assert.equal(await s.locator('#pulse-settings-dialog [data-inline-cache-hit-choice=false]').getAttribute('aria-pressed'), 'true');
  await s.locator('#pulse-settings-dialog [data-inline-cache-hit-choice=true]').click();
  await page.waitForFunction(() => document.getElementById('ag-pulse-status-bar')?.getAttribute('data-inline-cache-hit') === 'true');
  assert.equal(await s.locator('#cache-hit').isVisible(), true);
  assert.equal(await s.locator('#cache-card-hit-on').getAttribute('aria-pressed'), 'true');

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ barCustomizeUi: true, reorder: true, labelModes: true, keepOneGuard: true, footerMigration: true, reset: true, cacheHitQuickSync: true, pageErrors: [] }));
} finally {
  await browser.close();
  server.closeAllConnections?.();
  await new Promise(r => server.close(r));
}
