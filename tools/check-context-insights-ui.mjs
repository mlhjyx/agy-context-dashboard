// Real browser regression for Side Panel Issue #34 P1-Panel/P2/P3 and Issue #29 Phase 2:
// - 8-category host composition bar & list view toggle
// - Interactive GetTokenBase drilldown (Rules / Skills / nested MCP tools)
// - Trend Total vs Delta toggle + compaction reclaimed markers
// - Lazy On-Demand Session Audit (Files, Commands, Steps + filters + jump-to-step)
// - Lazy Cross-Session Insights tab (KPIs, 7d bars, heatmap toggle, distributions, session jump)
// - Trilingual switching (en / zh-CN / zh-TW) & zero Trusted Types CSP errors
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { panelAppSource, panelPageSource } from '../sidecars/panel/panel-source.mjs';
import { trajectoryMetrics } from '../sidecars/panel/metrics.mjs';
import { compositionMetrics, tokenBaseMetrics, hostContextMetrics, attachTokenBase, attachHostContextUsage } from '../sidecars/panel/composition.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const createTheme = createRequire(import.meta.url)('../compat/theme.cjs');
const cidA = '11111111-1111-1111-1111-111111111111';
const cidB = '22222222-2222-2222-2222-222222222222';

const tokenBase = tokenBaseMetrics({
  customizationTokenBase: {
    totalTokens: 16489,
    groups: [
      { name: 'Rules', type: 'TOKEN_TYPE_RULES', numTokens: 6642, children: [{ name: '/Users/mac/.gemini/AGENTS.md', numTokens: 2767 }, { name: '/Users/mac/.gemini/config/rules/team-resident.md', numTokens: 3875 }] },
      { name: 'Skills', type: 'TOKEN_TYPE_SKILLS', numTokens: 9347, children: [
        { name: 'tabbit', numTokens: 210 },
        { name: 'team-github-bilingual', numTokens: 185 },
        { name: 'lark-drive', numTokens: 170 },
        { name: 'lark-wiki', numTokens: 160 },
        { name: 'openviking-skills', numTokens: 150 },
        { name: 'ov-kanban', numTokens: 140 },
        { name: 'team-retro', numTokens: 130 },
        { name: 'team-orca-collab', numTokens: 120 },
      ] },
      { name: 'Subagents', type: 'TOKEN_TYPE_SUBAGENTS', numTokens: 340, children: [{ name: 'research', numTokens: 120 }] },
      { name: 'Mcp Tools', type: 'TOKEN_TYPE_MCP_TOOLS', numTokens: 160, children: [{ name: 'openviking', numTokens: 102, children: [{ name: 'find', numTokens: 2 }, { name: 'remember', numTokens: 4 }] }] },
    ],
  },
  customizationBudget: 20000,
  remainingBudget: 3511,
  rulesBudget: 20000,
  remainingRulesBudget: 13358,
});

const hostUsage = hostContextMetrics({
  contextWindowUsage: {
    estimatedTokensUsed: 120000,
    maxContextTokens: 512000,
    tokenGroups: [
      { name: 'System Prompt', type: 'TOKEN_TYPE_SYSTEM_PROMPT', numTokens: 5200 },
      { name: 'Mcp Tools', type: 'TOKEN_TYPE_MCP_TOOLS', numTokens: 160 },
      { name: 'Subagents', type: 'TOKEN_TYPE_SUBAGENTS', numTokens: 340 },
      { name: 'Skills', type: 'TOKEN_TYPE_SKILLS', numTokens: 9347 },
      { name: 'Plugins', type: 'TOKEN_TYPE_PLUGINS', numTokens: 1400 },
      { name: 'Rules', type: 'TOKEN_TYPE_RULES', numTokens: 6642 },
      { name: 'Tools', type: 'TOKEN_TYPE_TOOLS', numTokens: 7400 },
      { name: 'Chat Messages', type: 'TOKEN_TYPE_CHAT_MESSAGES', numTokens: 89511 },
    ],
  },
});

const makeSession = (id, modelName, vals) => {
  const steps = [{ type: 'CORTEX_STEP_TYPE_USER_INPUT', metadata: {} }];
  const generators = [];
  vals.forEach((v, idx) => {
    const idxStep = steps.length;
    steps.push({ type: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE', metadata: { modelUsage: { inputTokens: String(v), thinkingOutputTokens: '900', responseOutputTokens: '300', outputTokens: '1200' } } });
    generators.push({
      stepIndices: [idxStep],
      chatModel: {
        modelDisplayName: modelName,
        streamingDuration: '2s',
        timeToFirstToken: '0.5s',
        usage: { messageId: `${id}-${idx}`, inputTokens: String(Math.round(v * 0.2)), cacheReadTokens: String(Math.round(v * 0.8)), outputTokens: '1200', responseOutputTokens: '300', thinkingOutputTokens: '900', apiProvider: 'API_PROVIDER_GOOGLE_GEMINI' },
        chatStartMetadata: { contextWindowMetadata: { estimatedTokensUsed: 120000, maxContextTokens: 512000 } },
      },
    });
    if (idx === 1) steps.push({ type: 'CORTEX_STEP_TYPE_COMPACTION', metadata: {} });
  });
  const base = trajectoryMetrics({ trajectory: { cascadeId: id, steps, generatorMetadata: generators } });
  const comp = compositionMetrics({
    context: base.context,
    steps,
    generators,
    transcript: { status: 'ready', matchedSteps: steps.length, userTokens: 2500, assistantTokens: 4800, toolTokens: 35000, systemTokens: 1200, totalTokens: 43500, compactionMarkers: 1 },
  });
  return {
    ...base,
    estimatedCost: { totalUsd: 0.42, hasPriced: true, complete: true, estimated: true },
    contextComposition: comp,
  };
};

const sessions = {
  [cidA]: makeSession(cidA, 'Gemini 4 Neon (High)', [40000, 120000, 35000, 75000]),
  [cidB]: makeSession(cidB, 'Claude Sonnet 4.6 (Thinking)', [25000, 65000, 90000]),
};

const auditById = {
  [cidA]: {
    version: 1,
    conversationId: cidA,
    totalSteps: 4,
    totalFiles: 1,
    totalCommands: 1,
    counts: { user: 1, thinking: 1, tools: 2, answer: 1, compactions: 1 },
    truncated: false,
    files: [{ path: '/repo/sidecars/panel/app.js', name: 'app.js', ops: ['read', 'edit'], reads: 1, edits: 1, writes: 0, searches: 0, additions: 14, deletions: 3, stepIndices: [1, 2], lastStepIndex: 2 }],
    commands: [{ stepIndex: 3, command: 'npm test', cwd: '/repo', exitCode: 0, shell: 'zsh', durationMs: 1250, status: 'DONE' }],
    steps: [
      { index: 0, type: 'USER_INPUT', categories: ['user'], model: null, contextDeltaTokens: 400, deltaEstimated: true, label: 'User message' },
      { index: 1, type: 'PLANNER_RESPONSE', categories: ['thinking', 'tools', 'answer'], model: 'Gemini 4 Neon (High)', thinkingTokens: 900, responseTokens: 300, contextDeltaTokens: 40000, deltaEstimated: false, label: 'Tools: read_file' },
      { index: 2, type: 'CODE_ACTION', categories: ['tools'], model: 'Gemini 4 Neon (High)', contextDeltaTokens: 800, deltaEstimated: true, label: 'edit: app.js' },
      { index: 3, type: 'RUN_COMMAND', categories: ['tools'], model: 'Gemini 4 Neon (High)', contextDeltaTokens: 250, deltaEstimated: true, label: '$ npm test' },
    ],
  },
  [cidB]: {
    version: 1,
    conversationId: cidB,
    totalSteps: 2,
    totalFiles: 1,
    totalCommands: 0,
    counts: { user: 1, thinking: 1, tools: 1, answer: 1, compactions: 0 },
    truncated: false,
    files: [{ path: '/repo/sidecars/panel/store.mjs', name: 'store.mjs', ops: ['read'], reads: 1, edits: 0, writes: 0, searches: 0, additions: 0, deletions: 0, stepIndices: [1], lastStepIndex: 1 }],
    commands: [],
    steps: [
      { index: 0, type: 'USER_INPUT', categories: ['user'], model: null, contextDeltaTokens: 300, deltaEstimated: true, label: 'User message' },
      { index: 1, type: 'PLANNER_RESPONSE', categories: ['thinking', 'tools', 'answer'], model: 'Claude Sonnet 4.6 (Thinking)', thinkingTokens: 500, responseTokens: 200, contextDeltaTokens: 25000, deltaEstimated: false, label: 'read: store.mjs' },
    ],
  },
};

const insightsPayload = {
  version: 1,
  today: '2026-11-21',
  timeZone: 'Asia/Shanghai',
  accountCredits: { planName: 'Pro', tierName: 'Google AI Ultra', availablePromptCredits: 500, monthlyPromptCredits: 50000, availableFlowCredits: 100, monthlyFlowCredits: 150000 },
  kpis: {
    totalSessions: 2, activeSessions: 1, archivedSessions: 1,
    totalTokens: 540000, uncachedTokens: 108000, cacheReadTokens: 432000, cacheWriteTokens: 0, outputTokens: 8400,
    totalRounds: 9, totalModelCalls: 7, totalToolCalls: 14, totalActiveMs: 92000,
    avgCacheHitRate: 0.8, estimatedCostUsd: 1.28, pricedSessions: 2, totalSessionsForPricing: 2,
  },
  last7Days: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-11-${String(15 + i).padStart(2, '0')}`,
    sessions: i === 6 ? 2 : 1,
    totalTokens: (i + 1) * 50000,
    estimatedCostUsd: (i + 1) * 0.15,
  })),
  heatmap: Array.from({ length: 112 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 7, 3 + i));
    return {
      date: d.toISOString().slice(0, 10),
      sessions: i >= 109 ? (i === 111 ? 3 : 2) : (i % 17 === 0 ? 1 : 0),
      tokens: i >= 109 ? (i - 108) * 60000 : (i % 17 === 0 ? 25000 : 0),
    };
  }),
  composition: { uncached: 108000, cacheRead: 432000, cacheWrite: 0, output: 8400 },
  distributions: {
    projects: [{ name: 'agy-context-dashboard', sessions: 2, tokens: 540000 }],
    skills: [{ name: 'tabbit', count: 4, sessions: 2 }],
    tools: [{ name: 'read_file', count: 8 }, { name: 'run_command', count: 6 }],
    commands: [{ name: 'npm', count: 4 }, { name: 'git', count: 2 }],
    models: [],
  },
  totalMatchingSessions: 2,
  sessions: [
    { id: cidA, title: 'Session Alpha', project: 'agy-context-dashboard', model: 'Gemini 4 Neon (High)', status: 'IDLE', archived: false, rounds: 5, steps: 20, totalTokens: 320000, currentContextTokens: 120000, cacheHitRate: 0.8, estimatedCostUsd: 0.42, activeDates: ['2026-11-22'] },
    { id: cidB, title: 'Session Beta', project: 'agy-context-dashboard', model: 'Claude Sonnet 4.6', status: 'ARCHIVED', archived: true, rounds: 4, steps: 15, totalTokens: 220000, currentContextTokens: 90000, cacheHitRate: 0.8, estimatedCostUsd: 0.86, activeDates: ['2026-11-20'] },
  ],
  cacheInfo: { totalScanned: 2, parsedNow: 0, cacheHits: 2, scanMs: 12, shardCount: 64 },
};

let prefs = { language: 'en', revision: 1 };
const calls = { metrics: [], audit: [], insights: [] };
const usagePayloadLocal = {
  scope: 'local',
  accountKey: 'acct-1',
  accountAvailable: true,
  today: '2026-11-22',
  timeZone: 'Asia/Shanghai',
  firstDate: '2026-11-01',
  todayTokens: 480000,
  weekTokens: 960000,
  monthTokens: 1850000,
  totalTokens: 1850000,
  requests: 142,
  models: ['gemini-4-hydrogen-xhigh', 'claude-sonnet-4-6'],
  days: [
    {
      date: '2026-11-22',
      models: {
        'gemini-4-hydrogen-xhigh': { total: 320000, requests: 28, uncached: 40000, cacheRead: 270000, cacheWrite: 0, output: 10000 },
        'claude-sonnet-4-6': { total: 160000, requests: 14, uncached: 20000, cacheRead: 130000, cacheWrite: 5000, output: 5000 },
      },
    },
    {
      date: '2026-11-21',
      models: {
        'gemini-4-hydrogen-xhigh': { total: 480000, requests: 40, uncached: 60000, cacheRead: 405000, cacheWrite: 0, output: 15000 },
        'claude-sonnet-4-6': { total: 890000, requests: 60, uncached: 90000, cacheRead: 760000, cacheWrite: 20000, output: 20000 },
      },
    },
  ],
};
const usagePayloadAccount = {
  scope: 'account',
  accountKey: 'acct-1',
  accountAvailable: true,
  today: '2026-11-22',
  timeZone: 'Asia/Shanghai',
  firstDate: '2026-11-01',
  todayTokens: 320000,
  weekTokens: 640000,
  monthTokens: 1200000,
  totalTokens: 1200000,
  requests: 90,
  models: ['gemini-4-hydrogen-xhigh'],
  days: [
    {
      date: '2026-11-22',
      models: {
        'gemini-4-hydrogen-xhigh': { total: 320000, requests: 28, uncached: 40000, cacheRead: 270000, cacheWrite: 0, output: 10000 },
      },
    },
    {
      date: '2026-11-21',
      models: {
        'gemini-4-hydrogen-xhigh': { total: 880000, requests: 62, uncached: 80000, cacheRead: 775000, cacheWrite: 0, output: 25000 },
      },
    },
  ],
};
const windows = {
  '5h': { available: true, remaining: 0.85, resetAt: new Date(Date.now() + 3600000).toISOString() },
  weekly: { available: true, remaining: 0.72, resetAt: new Date(Date.now() + 86400000).toISOString() },
};

const html = panelPageSource().replace(
  '<head>',
  `<head><meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline'; style-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'">`,
);
const appJs = panelAppSource();
const stylesCss = await readFile(join(repo, 'sidecars/panel/styles.css'), 'utf8');
const themeCss = createTheme().css(':root');

const [i18nSrc, themeSrc, widgetSrc, surfaceSrc] = await Promise.all([
  'compat/i18n.cjs', 'compat/theme.cjs', 'compat/inline-widget.cjs', 'ide/surface.cjs',
].map(file => readFile(join(repo, file), 'utf8')));
const extract = s => s.slice(s.indexOf('module.exports = ') + 17).trim().replace(/;$/, '');
const inlineBundle = `window.__agPulseSurface=(${extract(surfaceSrc)})();window.__agPulseI18nFactory=(${extract(i18nSrc)});window.__agPulseThemeFactory=(${extract(themeSrc)});(${extract(widgetSrc)})();`;
const inlineHostHtml = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; require-trusted-types-for 'script'; trusted-types 'none'"><style>body{margin:0;background:#202124;color:#eee;font:12px Arial}.panel{width:100%;box-sizing:border-box;padding:16px}.box{border-radius:16px;background:#292a2d;padding:4px}.editor{height:40px;padding:8px}.row{display:flex;align-items:center;justify-content:space-between;gap:4px;padding:2px}.native{display:flex;flex:1;min-width:0;align-items:center;gap:1px}.model-wrap{display:flex;min-width:0;gap:4px}.model{display:flex;min-width:0;align-items:center;padding:0 8px;gap:4px;height:28px}.protected{flex:none;width:28px;height:28px;border:0;color:inherit;background:transparent}.controls{display:flex;flex:none;gap:4px}.top{height:240px}</style></head><body><div class="antigravity-agent-side-panel panel"><div class="top"></div><div id="conversation" role="region"><div id="antigravity.agentSidePanelInputBox" class="box"><div class="editor" contenteditable="true" role="combobox"></div><div class="row"><div class="native"><button class="protected">＋</button><div class="model-wrap"><button class="model" data-testid="model-selector-trigger">Gemini 4 Neon (High)</button></div></div><div class="controls"><button class="protected">➤</button></div></div></div></div></div><script>
const box=document.getElementById('antigravity.agentSidePanelInputBox'),panel=document.querySelector('.panel');
const owner={props:{cascadeId:${JSON.stringify(cidA)}},__k:[]},vnode={type:'div',__e:box,props:{id:box.id},__:owner,__k:[]};owner.__k=[vnode];panel.__k=owner;
window.agPulseHost={
  getPreferences:async()=>({language:'en',languageGuideDismissed:true,quotaDisplay:'both',revision:1}),
  setPreferences:async input=>({language:'en',languageGuideDismissed:true,quotaDisplay:'both',...input,revision:2}),
  getMetrics:async()=>window.__inlineHostMetrics,
};
</script><script defer src="/inline-bundle.js"></script></body></html>`;

let forceDegradedCidB = false;
let omitUsage = false;
let tightBudgetTokens = null;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
  if (url.pathname === '/inline-host') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(inlineHostHtml); return; }
  if (url.pathname === '/inline-bundle.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(inlineBundle); return; }
  if (url.pathname === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(stylesCss); return; }
  if (url.pathname === '/theme.css') { res.setHeader('Content-Type', 'text/css'); res.end(themeCss); return; }
  if (url.pathname === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(appJs); return; }
  if (url.pathname === '/preload.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(''); return; }
  if (url.pathname === '/api/preferences') {
    if (req.method === 'POST') {
      let body = ''; for await (const c of req) body += c;
      prefs = { ...prefs, ...JSON.parse(body), revision: prefs.revision + 1 };
    }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(prefs)); return;
  }
  if (url.pathname === '/api/metrics') {
    const cid = url.searchParams.get('conversationId') || cidA;
    const contextDetail = url.searchParams.get('contextDetail') === '1';
    const usageSync = url.searchParams.get('usageSync') === '1';
    const usageOnly = url.searchParams.get('usageOnly') === '1';
    const requestedScope = url.searchParams.get('usageScope') || prefs.usageScope || 'local';
    calls.metrics.push({ cid, contextDetail, usageSync, usageOnly, usageScope: requestedScope });
    const usagePayload = omitUsage ? null : (requestedScope === 'account' ? usagePayloadAccount : usagePayloadLocal);
    if (usageOnly) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        connection: 'live',
        groups: [{ id: 'gemini', name: 'Gemini', windows }],
        speed: null,
        usage: usagePayload,
        preferences: prefs,
      }));
      return;
    }
    if (forceDegradedCidB && cid === cidB) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        connection: 'live',
        serverTime: new Date().toISOString(),
        quotaUpdatedAt: new Date().toISOString(),
        groups: [{ id: 'gemini', name: 'Gemini', windows }],
        accountCredits: insightsPayload.accountCredits,
        preferences: prefs,
        speed: null,
        usage: usagePayload,
        sessionError: '会话暂时没有可用统计',
      }));
      return;
    }
    let speed = sessions[cid] || sessions[cidA];
    if (contextDetail) {
      const tb = tightBudgetTokens !== null ? { ...tokenBase, totalTokens: tightBudgetTokens } : tokenBase;
      speed = { ...speed, contextComposition: attachHostContextUsage(attachTokenBase(speed.contextComposition, tb), hostUsage) };
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      connection: 'live',
      serverTime: new Date().toISOString(),
      quotaUpdatedAt: new Date().toISOString(),
      groups: [{ id: 'gemini', name: 'Gemini', windows }],
      accountCredits: insightsPayload.accountCredits,
      preferences: prefs,
      speed,
      usage: usagePayload,
    }));
    return;
  }
  if (url.pathname === '/api/session-audit') {
    const cid = url.searchParams.get('conversationId') || cidA;
    calls.audit.push({ cid });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(auditById[cid] || auditById[cidA]));
    return;
  }
  if (url.pathname === '/api/insights') {
    const status = url.searchParams.get('status') || 'all';
    const sort = url.searchParams.get('sort') || 'recent';
    const date = url.searchParams.get('date') || '';
    calls.insights.push({ status, sort, date });
    let filtered = status === 'archived' ? insightsPayload.sessions.filter(s => s.archived) : insightsPayload.sessions;
    if (date) filtered = filtered.filter(s => Array.isArray(s.activeDates) && s.activeDates.includes(date));
    const total = sort === 'cost' && !date ? 201 : filtered.length;
    const rows = sort === 'cost' && !date ? filtered.slice(0, 1) : filtered;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ...insightsPayload, sessions: rows, totalMatchingSessions: total }));
    return;
  }
  res.writeHead(404); res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const launchOpts = process.env.PLAYWRIGHT_CHANNEL
  ? { channel: process.env.PLAYWRIGHT_CHANNEL, headless: true }
  : process.platform === 'win32' && !process.env.CI ? { channel: 'msedge', headless: true } : { headless: true };
const browser = await chromium.launch(launchOpts);
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 460, height: 700 } });
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(base + '/');
  await page.locator('#strip-tps').waitFor();

  // 1. Plain poll on Speed tab never triggers contextDetail, audit, or insights
  assert.equal(calls.metrics.some(c => c.contextDetail), false);
  assert.equal(calls.audit.length, 0);
  assert.equal(calls.insights.length, 0);
  assert.equal(await page.locator('#account-credits-badge').textContent(), '500P · 100F');

  // 2. Open Context tab -> 8-category breakdown + Bar/List toggle + GetTokenBase drilldown + Trend Total/Delta
  await page.locator('#context-tab').click();
  await page.locator('#panel-context-composition').waitFor({ state: 'visible' });
  await page.locator('#panel-composition-source').filter({ hasText: 'host 8-category' }).waitFor();
  assert.equal(await page.locator('#panel-composition-meter i').count(), 9); // 8 categories + remaining

  await page.locator('#comp-view-list').click();
  assert.equal(await page.locator('#panel-composition-legend').evaluate(el => el.classList.contains('is-list')), true);
  assert.match(await page.locator('#panel-composition-legend').textContent(), /System prompt.*exact/);

  await page.locator('#token-base-toggle').click();
  await page.locator('#token-base-tree').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#token-base-toggle-label').textContent(), 'Rules & skills config');
  assert.equal(await page.locator('#token-base-toggle-summary').getAttribute('data-level'), null);
  assert.equal(await page.locator('#token-base-tree .is-danger').count(), 0);
  const normalTone = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--pulse-accent)';
    document.body.append(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return {
      accent,
      summary: getComputedStyle(document.getElementById('token-base-toggle-summary')).color,
      budget: getComputedStyle(document.querySelector('#token-base-tree .drilldown-budget-pct')).color,
    };
  });
  assert.equal(normalTone.summary, normalTone.accent);
  assert.equal(normalTone.budget, normalTone.accent);
  assert.equal(await page.locator('#token-base-tree .drilldown-budget-card').count(), 2);
  const firstRule = await page.locator('#token-base-tree .drilldown-item').first().evaluate(el => ({
    name: el.querySelector('.drilldown-item-name')?.textContent,
    sub: el.querySelector('.drilldown-item-sub')?.textContent,
    title: el.getAttribute('title'),
  }));
  assert.deepEqual(firstRule, { name: 'team-resident.md', sub: '~/.gemini/config/rules', title: '/Users/mac/.gemini/config/rules/team-resident.md' });
  await page.locator('.drilldown-group-btn', { hasText: 'Skills' }).click();
  const skillsBlock = page.locator('#token-base-tree .drilldown-group').filter({ hasText: 'Skills' });
  assert.equal(await skillsBlock.locator('.drilldown-item').count(), 6);
  assert.equal(await skillsBlock.locator('.drilldown-more-btn').textContent(), 'Show 2 more');
  await skillsBlock.locator('.drilldown-more-btn').focus();
  await page.keyboard.press('Enter');
  assert.equal(await skillsBlock.locator('.drilldown-item').count(), 8);
  assert.equal(await skillsBlock.locator('.drilldown-more-btn').textContent(), 'Show less');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('drilldown-more-btn')), true);
  await skillsBlock.locator('.drilldown-more-btn').click();
  assert.equal(await skillsBlock.locator('.drilldown-item').count(), 6);
  await page.locator('.drilldown-group-btn', { hasText: 'MCP tools' }).click();
  await page.locator('.drilldown-group-btn', { hasText: 'openviking' }).click();
  assert.match(await page.locator('#token-base-tree').textContent(), /remember/);

  await page.locator('#trend-mode-delta').click();
  assert.ok(await page.locator('#panel-trend-svg .trend-bar-neg').count() >= 1);
  assert.match(await page.locator('#panel-trend-markers').textContent(), /Compaction: 120K → 35K \(-85K reclaimed\)/);

  // 3. On-Demand Session Audit (Files -> step jump, Commands, Steps + filters)
  assert.equal(calls.audit.length, 0);
  await page.locator('#context-audit-toggle').click();
  await page.locator('#panel-audit-section').waitFor({ state: 'visible' });
  await page.locator('#audit-pane-files .audit-row').first().waitFor();
  assert.equal(calls.audit.length, 1);
  assert.match(await page.locator('#audit-pane-files').textContent(), /app\.js.*\+14.*-3/);

  await page.locator('#audit-tab-commands').click();
  await page.locator('#audit-pane-commands .audit-row').first().waitFor();
  assert.match(await page.locator('#audit-pane-commands').textContent(), /npm test.*exit 0/);

  await page.locator('#audit-tab-files').click();
  await page.locator('.audit-step-link', { hasText: 'S2' }).click();
  await page.locator('#audit-pane-steps').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#audit-steps-list [data-step-index="2"]').evaluate(el => el.classList.contains('is-highlighted')), true);
  await page.locator('[data-step-filter="thinking"]').click();
  assert.equal(await page.locator('#audit-steps-list .audit-row').count(), 1);

  // 3b. Token Usage entry inside Cache card + Daily/Weekly Activity & By Model embedded tabs
  assert.equal(await page.locator('#quota-overview,#five-summary,#week-summary').count(), 0);
  await page.locator('#cache-tab').click();
  await page.locator('#panel-usage-entry').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#panel-usage-today').textContent(), '480K');
  assert.equal(await page.locator('#panel-usage-month').textContent(), '1.9M');
  await page.locator('#open-panel-activity').click();
  await page.locator('#usage-panel-view').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#view-activity-tab').getAttribute('aria-selected'), 'true');
  assert.equal(calls.metrics.some(c => c.usageSync), true);
  await page.waitForFunction(() => Boolean(document.querySelector('#usage-embed > div')?.shadowRoot?.querySelector('#heat button')));
  const activityCheck = await page.evaluate(() => {
    const sr = document.querySelector('#usage-embed > div').shadowRoot;
    const wrap = sr.querySelector('.heat-wrap');
    const firstBtn = sr.querySelector('#heat button');
    const r = firstBtn?.getBoundingClientRect();
    return {
      overviewHidden: sr.getElementById('overview').hidden,
      detailsHidden: sr.getElementById('details').hidden,
      heatCount: sr.querySelectorAll('#heat button').length,
      heatOverflow: wrap ? wrap.scrollWidth > wrap.clientWidth : true,
      cellW: r ? r.width : 0,
      cellDiff: r ? Math.abs(r.width - r.height) : 99,
      tabsHidden: sr.querySelector('.tabs-bar')?.dataset.hideTabs,
    };
  });
  assert.equal(activityCheck.overviewHidden, false);
  assert.equal(activityCheck.detailsHidden, true);
  assert.ok(activityCheck.heatCount >= 84 && activityCheck.heatCount <= 140 && activityCheck.heatCount % 7 === 0, `Expected responsive 12-20 week window in embedded sidebar, got ${activityCheck.heatCount}`);
  assert.equal(activityCheck.heatOverflow, false, 'Embedded Token activity heatmap must not overflow horizontally');
  assert.ok(activityCheck.cellW >= 12 && activityCheck.cellDiff <= 1.5, `Expected crisp square cells, got ${JSON.stringify(activityCheck)}`);
  assert.equal(activityCheck.tabsHidden, 'true');

  // Clicking "View breakdown" inside embedded Activity switches top-level panel tab to By model
  await page.evaluate(() => document.querySelector('#usage-embed > div').shadowRoot.getElementById('selection-details').click());
  await page.locator('#view-models-tab[aria-selected="true"]').waitFor();
  const modelsText = await page.evaluate(() => {
    const sr = document.querySelector('#usage-embed > div').shadowRoot;
    return {
      detailsHidden: sr.getElementById('details').hidden,
      tableText: sr.getElementById('table-body').textContent,
      totalsText: sr.getElementById('totals').textContent,
    };
  });
  assert.equal(modelsText.detailsHidden, false);
  assert.match(modelsText.tableText, /Gemini 4 Hydrogen \(XHigh\)/);
  assert.match(modelsText.tableText, /Claude Sonnet 4\.6/);
  assert.match(modelsText.totalsText, /480K/);

  // Scope switch (local -> account) uses usageOnly=1&usageScope=account and updates totals in place
  await page.evaluate(() => document.querySelector('#usage-embed > div').shadowRoot.querySelector('[data-usage-scope="account"]').click());
  await page.waitForFunction(() => document.querySelector('#usage-embed > div')?.shadowRoot?.getElementById('totals')?.textContent?.includes('320K'));
  assert.equal(calls.metrics.some(c => c.usageOnly && c.usageScope === 'account'), true);
  assert.equal(await page.locator('#view-models-tab').getAttribute('aria-selected'), 'true');
  await page.locator('#view-session-tab').click();
  await page.locator('#view-session-tab[aria-selected="true"]').waitFor();

  // 4. Cross-Session Insights tab
  assert.equal(calls.insights.length, 0);
  await page.locator('#view-insights-tab').click();
  await page.locator('#insights-view').waitFor({ state: 'visible' });
  await page.locator('#insights-kpis .kpi-card').first().waitFor();
  assert.equal(calls.insights.length, 1);
  assert.match(await page.locator('#insights-kpis').textContent(), /540K/);
  assert.match(await page.locator('#insights-kpis').textContent(), /\$1\.28/);
  assert.match(await page.locator('#insights-dist-skills').textContent(), /tabbit/);
  const distEn = await page.evaluate(() => ({
    subs: [
      document.getElementById('insights-dist-projects-sub')?.textContent?.trim() || '',
      document.getElementById('insights-dist-skills-sub')?.textContent?.trim() || '',
      document.getElementById('insights-dist-tools-sub')?.textContent?.trim() || '',
      document.getElementById('insights-dist-commands-sub')?.textContent?.trim() || '',
    ],
    items: [...document.querySelectorAll('.insights-dist-card .dist-item')].length,
    barWidths: [...document.querySelectorAll('.insights-dist-card .dist-bar > i')].map(el => el.getBoundingClientRect().width),
    projectsText: document.getElementById('insights-dist-projects')?.textContent || '',
    skillsText: document.getElementById('insights-dist-skills')?.textContent || '',
    toolsText: document.getElementById('insights-dist-tools')?.textContent || '',
    commandsText: document.getElementById('insights-dist-commands')?.textContent || '',
  }));
  assert.ok(distEn.subs.every(Boolean), `Expected non-empty dist subtotals in en: ${JSON.stringify(distEn.subs)}`);
  assert.match(distEn.subs[0], /projects.*toks/);
  assert.match(distEn.subs[1], /skills.*runs/);
  assert.match(distEn.subs[2], /tools.*calls/);
  assert.match(distEn.subs[3], /cmds.*runs/);
  assert.match(distEn.projectsText, /sess.*toks/);
  assert.match(distEn.skillsText, /runs.*sess/);
  assert.match(distEn.toolsText, /calls/);
  assert.match(distEn.commandsText, /runs/);
  assert.equal(distEn.items, 6);
  assert.ok(distEn.barWidths.length === 6 && distEn.barWidths.every(w => w > 0), `Expected positive dist-bar widths in en: ${JSON.stringify(distEn.barWidths)}`);

  await page.locator('#heatmap-metric-tokens').click();
  assert.equal(await page.locator('#heatmap-metric-tokens').getAttribute('aria-pressed'), 'true');
  const hmGeometry = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('#insights-heatmap-grid button.heatmap-cell')];
    const rects = cells.map(c => c.getBoundingClientRect());
    const maxDiff = Math.max(...rects.map(r => Math.abs(r.width - r.height)));
    const minW = Math.min(...rects.map(r => r.width));
    return {
      count: cells.length,
      maxDiff,
      minW,
      meta: document.getElementById('insights-heatmap-meta')?.textContent || '',
      months: [...document.querySelectorAll('#insights-heatmap-months span')].map(s => [s.textContent, s.style.gridColumn]),
      weekdays: [...document.querySelectorAll('#insights-heatmap-weekdays span')].map(s => s.textContent).filter(Boolean),
    };
  });
  assert.equal(hmGeometry.count, 112);
  assert.ok(hmGeometry.maxDiff <= 1.2, `Heatmap cells must be square, maxDiff=${hmGeometry.maxDiff}`);
  assert.ok(hmGeometry.minW >= 10, `Heatmap cells must fit crisply, minW=${hmGeometry.minW}`);
  assert.match(hmGeometry.meta, /Streak 3d/);
  assert.match(hmGeometry.meta, /180K tok/);
  assert.ok(hmGeometry.months.length >= 2);
  assert.equal(hmGeometry.months.find(([m]) => m === 'Sep')?.[1], '5');
  assert.deepEqual(hmGeometry.weekdays, ['M', 'W', 'F']);

  const targetCell = page.locator('#insights-heatmap-grid button.heatmap-cell[data-date="2026-11-22"]');
  await targetCell.hover();
  await page.locator('#insights-heatmap-tip').waitFor({ state: 'visible' });
  assert.match(await page.locator('#insights-heatmap-tip').textContent(), /2026-11-22.*180K tok/);
  await page.mouse.move(10, 10);
  await targetCell.focus();
  await page.locator('#insights-heatmap-tip').waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 280, height: 700 });
  await page.waitForFunction(() => {
    const tip = document.getElementById('insights-heatmap-tip');
    if (!tip || tip.hidden) return true;
    const r = tip.getBoundingClientRect();
    return r.left >= 8 && r.right <= window.innerWidth;
  }, undefined, { timeout: 2000 });
  await page.evaluate(() => document.activeElement?.blur?.());
  await targetCell.focus();
  await page.locator('#insights-heatmap-tip').waitFor({ state: 'visible' });
  const tipBoxNarrow = await page.locator('#insights-heatmap-tip').evaluate(e => {
    const r = e.getBoundingClientRect();
    return { hidden: e.hidden, left: r.left, right: r.right, iw: window.innerWidth };
  });
  assert.equal(tipBoxNarrow.hidden, false);
  assert.ok(tipBoxNarrow.left >= 8 && tipBoxNarrow.right <= tipBoxNarrow.iw, `Tooltip must stay in viewport: ${JSON.stringify(tipBoxNarrow)}`);
  await page.setViewportSize({ width: 460, height: 700 });
  await page.evaluate(() => document.activeElement?.blur?.());
  await targetCell.click();
  assert.equal(await targetCell.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#insights-date-filter').isVisible(), true);
  assert.equal(await page.locator('#insights-sessions-list .session-row').count(), 1);
  assert.match(await page.locator('#insights-sessions-list .session-row').first().textContent(), /Session Alpha/);
  await page.locator('#insights-date-filter').click();
  assert.equal(await page.locator('#insights-date-filter').isVisible(), false);
  assert.equal(await page.locator('#insights-sessions-list .session-row').count(), 2);

  // Verify pre-truncation (>200) date filter re-queries server with date parameter
  await page.locator('#insights-sort').selectOption('cost');
  await page.locator('#insights-sessions-title').filter({ hasText: '201' }).waitFor();
  assert.equal(await page.locator('#insights-sessions-list .session-row').count(), 1);
  await page.locator('#insights-heatmap-grid button.heatmap-cell[data-date="2026-11-20"]').click();
  await page.locator('#insights-sessions-list .session-row').filter({ hasText: 'Session Beta' }).waitFor();
  assert.equal(calls.insights.at(-1)?.date, '2026-11-20');
  await page.locator('#insights-date-filter').click();
  await page.locator('#insights-sessions-title').filter({ hasText: '201' }).waitFor();
  await page.locator('#insights-sort').selectOption('recent');
  await page.locator('#insights-sessions-title').filter({ hasText: 'Sessions (2)' }).waitFor();
  assert.equal(await page.locator('#insights-sessions-list .session-row').count(), 2);

  await page.locator('#insights-status-filter').selectOption('archived');
  await page.locator('#insights-sessions-list .session-row').filter({ hasText: 'Session Beta' }).waitFor();
  await page.locator('#insights-sessions-list .session-row').first().click();
  await page.locator('#context-card').waitFor({ state: 'visible' });
  await page.locator('#context-model').filter({ hasText: 'Claude Sonnet 4.6 (Thinking)' }).waitFor();
  assert.equal(await page.locator('#context-model').textContent(), 'Claude Sonnet 4.6 (Thinking)');
  await page.locator('#strip-session-reset').click();
  await page.locator('#context-model').filter({ hasText: 'Gemini 4 Neon (High)' }).waitFor();

  // 5. Language switching + narrow viewport overflow check (all 4 top-level tabs)
  await page.locator('#language-toggle').click();
  await page.locator('[data-language-menu] [data-language="zh-CN"]').click();
  await page.locator('#view-insights-tab').filter({ hasText: '全局洞察' }).waitFor();
  assert.deepEqual(
    await page.locator('.panel-view-tab').evaluateAll(els => els.map(el => ({ id: el.id, text: el.textContent, left: el.getBoundingClientRect().left }))).then(items => {
      for (let i = 1; i < items.length; i++) assert.ok(items[i].left >= items[i - 1].left);
      return items.map(i => [i.id, i.text]);
    }),
    [
      ['view-session-tab', '当前会话'],
      ['view-insights-tab', '全局洞察'],
      ['view-activity-tab', '每日/每周活动'],
      ['view-models-tab', '模型用量'],
    ],
  );
  await page.locator('#view-insights-tab').click();
  assert.match(await page.locator('#insights-kpis').textContent(), /预估费用/);

  await page.setViewportSize({ width: 280, height: 700 });
  const overflow = await page.locator('.widget').evaluate(el => el.scrollWidth > el.clientWidth);
  assert.equal(overflow, false);
  const distZh = await page.evaluate(() => ({
    subs: [
      document.getElementById('insights-dist-projects-sub')?.textContent?.trim() || '',
      document.getElementById('insights-dist-skills-sub')?.textContent?.trim() || '',
      document.getElementById('insights-dist-tools-sub')?.textContent?.trim() || '',
      document.getElementById('insights-dist-commands-sub')?.textContent?.trim() || '',
    ],
    items: [...document.querySelectorAll('.insights-dist-card .dist-item')].length,
    barWidths: [...document.querySelectorAll('.insights-dist-card .dist-bar > i')].map(el => el.getBoundingClientRect().width),
    projectsText: document.getElementById('insights-dist-projects')?.textContent || '',
    skillsText: document.getElementById('insights-dist-skills')?.textContent || '',
    toolsText: document.getElementById('insights-dist-tools')?.textContent || '',
    commandsText: document.getElementById('insights-dist-commands')?.textContent || '',
    insightsOverflow: document.getElementById('insights-view').scrollWidth > document.getElementById('insights-view').clientWidth,
  }));
  assert.ok(distZh.subs.every(Boolean), `Expected non-empty dist subtotals in zh-CN: ${JSON.stringify(distZh.subs)}`);
  assert.match(distZh.subs[0], /项目.*toks/);
  assert.match(distZh.subs[1], /技能.*次/);
  assert.match(distZh.subs[2], /工具.*次/);
  assert.match(distZh.subs[3], /命令.*次/);
  assert.match(distZh.projectsText, /会话.*toks/);
  assert.match(distZh.skillsText, /次.*会话/);
  assert.match(distZh.toolsText, /次/);
  assert.match(distZh.commandsText, /次/);
  assert.equal(distZh.items, 6);
  assert.ok(distZh.barWidths.length === 6 && distZh.barWidths.every(w => w > 0), `Expected positive dist-bar widths in zh-CN: ${JSON.stringify(distZh.barWidths)}`);
  assert.equal(distZh.insightsOverflow, false);

  await page.locator('#view-activity-tab').click();
  await page.locator('#usage-panel-view').waitFor({ state: 'visible' });
  const activityZhOverflow = await page.evaluate(() => ({
    overflow: document.querySelector('.widget').scrollWidth > document.querySelector('.widget').clientWidth,
    title: document.querySelector('#usage-embed > div').shadowRoot.getElementById('activity-title').textContent,
  }));
  assert.equal(activityZhOverflow.overflow, false);
  assert.equal(activityZhOverflow.title, 'Token 活动');

  await page.locator('#view-models-tab').click();
  await page.waitForFunction(() => document.querySelector('#usage-embed > div')?.shadowRoot?.getElementById('details')?.hidden === false);
  const modelsZhOverflow = await page.evaluate(() => ({
    overflow: document.querySelector('.widget').scrollWidth > document.querySelector('.widget').clientWidth,
    title: document.querySelector('#usage-embed > div').shadowRoot.getElementById('detail-title').textContent,
  }));
  assert.equal(modelsZhOverflow.overflow, false);
  assert.equal(modelsZhOverflow.title, '按模型统计');
  for (const [per, expectedCols] of [['week', 8], ['month', 6], ['day', 30]]) {
    await page.evaluate((p) => {
      document.querySelector('#usage-embed > div').shadowRoot.querySelector(`[data-period="${p}"]`).click();
    }, per);
    const periodCheck = await page.evaluate(() => {
      const sr = document.querySelector('#usage-embed > div').shadowRoot;
      const activeBtn = sr.getElementById('period-controls').querySelector('button[aria-pressed="true"]');
      return {
        cols: sr.querySelectorAll('#plot .bar-column').length,
        activePeriod: activeBtn?.dataset.period || null,
        firstLegend: sr.querySelector('#legend button')?.textContent || '',
        firstRowModel: sr.querySelector('#table-body tr td')?.textContent || '',
      };
    });
    assert.equal(periodCheck.cols, expectedCols, `${per} column count`);
    assert.equal(periodCheck.activePeriod, per, `${per} aria-pressed`);
    assert.equal(periodCheck.firstLegend, periodCheck.firstRowModel, `${per} legend sorted by usage`);
  }

  await page.locator('#view-session-tab').click();
  await page.locator('#context-tab').click();
  await page.locator('#token-base-tree').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#token-base-toggle-label').textContent(), '规则与技能配置');
  assert.match(await page.locator('#token-base-tree').textContent(), /配置总预算.*规则预算/);
  assert.equal(await page.locator('#context-card').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, '280px zh-CN drilldown tree must fit without horizontal overflow');

  await page.locator('#view-insights-tab').click();
  await page.locator('#insights-view').waitFor({ state: 'visible' });

  // 6. Clicking an archived row must keep Audit toggle visible even when speed is null
  forceDegradedCidB = true;
  await page.locator('#insights-sessions-list .session-row').first().click();
  await page.locator('#context-card').waitFor({ state: 'visible' });
  await page.locator('#context-model').filter({ hasText: /^—$/ }).waitFor();
  assert.equal(await page.locator('#context-audit-toggle').isVisible(), true);
  await page.locator('#context-audit-toggle').click();
  await page.locator('#panel-audit-section').waitFor({ state: 'visible' });
  await page.locator('[data-audit-tab="files"]').click();
  await page.locator('#audit-pane-files .audit-row').filter({ hasText: 'store.mjs' }).waitFor();

  // 7. Inline widget host-token-groups source omits Injection prefix and labels host categories as exact
  const inlinePage = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  inlinePage.on('pageerror', err => errors.push(err.message));
  const inlineSpeed = {
    ...sessions[cidA],
    contextComposition: attachHostContextUsage(attachTokenBase(sessions[cidA].contextComposition, tokenBase), hostUsage),
  };
  await inlinePage.addInitScript(payload => {
    window.__inlineHostMetrics = payload;
  }, {
    connection: 'live',
    serverTime: new Date().toISOString(),
    quotaUpdatedAt: new Date().toISOString(),
    groups: [{ id: 'gemini', name: 'Gemini', windows }],
    speed: inlineSpeed,
  });
  await inlinePage.goto(`${base}/inline-host`);
  await inlinePage.waitForFunction(() => document.getElementById('ag-pulse-status-bar')?.shadowRoot?.getElementById('composition-source')?.textContent);
  await inlinePage.locator('#ag-pulse-status-bar').locator('[data-card="context"]').click();
  await inlinePage.locator('#ag-pulse-status-bar').locator('#context-card').waitFor({ state: 'visible' });
  const inlineHostCheck = await inlinePage.evaluate(() => {
    const sr = document.getElementById('ag-pulse-status-bar').shadowRoot;
    const rows = [...sr.querySelectorAll('#composition-list .composition-row')];
    return {
      source: sr.getElementById('composition-source').textContent,
      titles: rows.map(r => r.getAttribute('title')),
    };
  });
  assert.equal(inlineHostCheck.source, 'host 8-category breakdown');
  assert.ok(inlineHostCheck.titles.length === 8);
  assert.ok(inlineHostCheck.titles.every(t => t && t.endsWith('· exact')), `Expected exact tag on all 8 host categories, got: ${inlineHostCheck.titles.join(', ')}`);
  await inlinePage.close();

  // 8. Cold-start open(null) -> update(usage) initializes year/anchor cleanly with zero errors
  omitUsage = true;
  const coldPage = await browser.newPage({ viewport: { width: 410, height: 680 } });
  coldPage.on('pageerror', err => errors.push(err.message));
  await coldPage.goto(base + '/');
  await coldPage.locator('#view-activity-tab').click();
  await coldPage.waitForFunction(() => document.querySelector('#usage-embed > div')?.shadowRoot?.getElementById('usage-waiting')?.hidden === false);
  omitUsage = false;
  await coldPage.locator('#refresh-button').click();
  await coldPage.waitForFunction(() => document.querySelector('#usage-embed > div')?.shadowRoot?.getElementById('year-label')?.textContent === '2026');
  await coldPage.locator('#view-models-tab').click();
  await coldPage.waitForFunction(() => (document.querySelector('#usage-embed > div')?.shadowRoot?.querySelectorAll('#plot .bar-column')?.length || 0) > 0);
  await coldPage.close();

  // 9. Exact 90% threshold: 89.5% (17900/20000) stays blue, >= 90% (18600/20000) turns danger red
  tightBudgetTokens = 17900;
  const boundaryPage = await browser.newPage({ viewport: { width: 410, height: 680 } });
  boundaryPage.on('pageerror', err => errors.push(err.message));
  await boundaryPage.goto(base + '/');
  await boundaryPage.locator('#context-tab').click();
  await boundaryPage.locator('#token-base-toggle').waitFor({ state: 'visible' });
  await boundaryPage.locator('#token-base-toggle').click();
  await boundaryPage.locator('#token-base-tree').waitFor({ state: 'visible' });
  assert.equal(await boundaryPage.locator('#token-base-toggle-summary').getAttribute('data-level'), null);
  assert.equal(await boundaryPage.locator('#token-base-tree .is-danger').count(), 0);
  await boundaryPage.close();

  tightBudgetTokens = 18600;
  const tightPage = await browser.newPage({ viewport: { width: 410, height: 680 } });
  tightPage.on('pageerror', err => errors.push(err.message));
  await tightPage.goto(base + '/');
  await tightPage.locator('#context-tab').click();
  await tightPage.locator('#token-base-toggle').waitFor({ state: 'visible' });
  await tightPage.locator('#token-base-toggle').click();
  await tightPage.locator('#token-base-tree').waitFor({ state: 'visible' });
  assert.equal(await tightPage.locator('#token-base-toggle-summary').getAttribute('data-level'), 'danger');
  assert.equal(await tightPage.locator('#token-base-tree .drilldown-budget-pct.is-danger').count(), 1);
  assert.equal(await tightPage.locator('#token-base-tree .drilldown-budget-track i.is-danger').count(), 1);
  tightBudgetTokens = null;
  await tightPage.close();

  assert.deepEqual(errors, [], 'Trusted Types CSP must produce zero page errors');
  console.log(JSON.stringify({ ok: true, auditCalls: calls.audit.length, insightsCalls: calls.insights.length, pageErrors: errors }));
} finally {
  await browser.close();
  server.close();
}
