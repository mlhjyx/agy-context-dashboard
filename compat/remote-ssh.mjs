import { createServer, request } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { chmodSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gzip, gunzip } from 'node:zlib';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
const HOST_CHARS = /^[A-Za-z0-9._:@\[\]-]+$/;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REMOTE_HOST_LEN = 160;
const MAX_REMOTE_RESPONSE_BYTES = 1048576;

export function createUnreachableTracker({ cooldownMs = 12000, now = Date.now } = {}) {
  const failedAt = new Map();
  return {
    isCoolingDown(key) {
      if (!key) return false;
      const at = failedAt.get(key);
      if (at === undefined) return false;
      if (now() - at < cooldownMs) return true;
      failedAt.delete(key);
      return false;
    },
    markFailed(key) {
      if (key) failedAt.set(key, now());
    },
    markOk(key) {
      if (key) failedAt.delete(key);
    },
  };
}

export function sanitizeRemoteHost(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/^ssh:\s*/i, '').trim();
  if (!cleaned || cleaned.length > MAX_REMOTE_HOST_LEN) return null;
  if (!HOST_CHARS.test(cleaned)) return null;
  return cleaned;
}

export function parseSshTarget(value) {
  const cleaned = sanitizeRemoteHost(value);
  if (!cleaned) return null;
  let user = null;
  let hostPart = cleaned;
  const atIdx = cleaned.lastIndexOf('@');
  if (atIdx !== -1) {
    user = cleaned.slice(0, atIdx);
    hostPart = cleaned.slice(atIdx + 1);
    if (!user || user.startsWith('-') || !/^[A-Za-z0-9._-]+$/.test(user)) return null;
  }
  if (!hostPart || hostPart.startsWith('-')) return null;

  let host = hostPart;
  let port = null;
  if (hostPart.startsWith('[')) {
    const m = hostPart.match(/^\[([0-9A-Fa-f:.]+)\](?::(\d{1,5}))?$/);
    if (!m) return null;
    host = m[1];
    if (m[2] !== undefined) {
      const p = Number(m[2]);
      if (!Number.isInteger(p) || p < 1 || p > 65535) return null;
      port = p;
    }
  } else {
    const firstColon = hostPart.indexOf(':');
    const lastColon = hostPart.lastIndexOf(':');
    if (firstColon !== -1 && firstColon === lastColon) {
      const h = hostPart.slice(0, firstColon);
      const pStr = hostPart.slice(firstColon + 1);
      if (!h || h.startsWith('-') || !/^\d{1,5}$/.test(pStr)) return null;
      const p = Number(pStr);
      if (!Number.isInteger(p) || p < 1 || p > 65535) return null;
      host = h;
      port = p;
    } else if (hostPart.includes('[') || hostPart.includes(']')) {
      return null;
    }
  }
  if (!host || host.startsWith('-')) return null;
  return {
    target: user ? `${user}@${host}` : host,
    port,
  };
}

export function validateBridgePort(value) {
  if (value === null || value === undefined || value === '') return null;
  const port = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;
  return port;
}

export function validateBridgeSocketPath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 220) return null;
  if (!/^\/[A-Za-z0-9._/@+-]+(?:\/[A-Za-z0-9._/@+-]+)*\.sock$/.test(trimmed)) return null;
  if (trimmed.split('/').some(seg => seg === '..' || seg === '.')) return null;
  return trimmed;
}

export function validateLoopbackEndpoint(raw) {
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw < 1 || raw > 65535) return null;
    return { hostname: '127.0.0.1', port: raw, origin: `http://127.0.0.1:${raw}` };
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 128) return null;
  if (/^\d+$/.test(trimmed)) {
    const port = Number(trimmed);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { hostname: '127.0.0.1', port, origin: `http://127.0.0.1:${port}` };
  }
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  if (parsed.pathname && parsed.pathname !== '/') return null;
  const host = parsed.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) return null;
  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { hostname: '127.0.0.1', port, origin: `http://127.0.0.1:${port}` };
}

export function resolveRemoteEndpoint(remoteHost, settings) {
  const host = sanitizeRemoteHost(remoteHost);
  if (!host) return null;
  const endpoints = settings?.remoteEndpoints;
  if (!endpoints || typeof endpoints !== 'object' || Array.isArray(endpoints)) return null;

  const lookup = new Map();
  for (const [rawKey, rawVal] of Object.entries(endpoints)) {
    if (typeof rawKey !== 'string') continue;
    const trimmedKey = rawKey.trim();
    if (trimmedKey === '*') {
      lookup.set('*', { key: '*', value: rawVal });
      continue;
    }
    const cleanKey = sanitizeRemoteHost(trimmedKey);
    if (cleanKey) lookup.set(cleanKey.toLowerCase(), { key: trimmedKey, value: rawVal });
  }

  const lower = host.toLowerCase();
  const candidates = [lower];
  const atIdx = lower.lastIndexOf('@');
  if (atIdx > 0 && atIdx < lower.length - 1) {
    candidates.push(lower.slice(atIdx + 1));
  }
  candidates.push('*');

  for (const cand of candidates) {
    const entry = lookup.get(cand);
    if (!entry) continue;
    const endpoint = validateLoopbackEndpoint(entry.value);
    if (endpoint) return { endpoint, matchKey: entry.key };
  }
  return null;
}

export function fetchRemoteMetrics(endpoint, input = {}, { timeoutMs = 8000, requestFn = request } = {}) {
  const valid = validateLoopbackEndpoint(endpoint?.origin || endpoint);
  if (!valid) return Promise.resolve({ ok: false, kind: 'invalid', error: 'Invalid loopback endpoint' });

  const params = new URLSearchParams();
  if (typeof input.conversationId === 'string' && input.conversationId) params.set('conversationId', input.conversationId);
  if (input.force === true) params.set('force', '1');
  if (input.quotaRefresh === true) params.set('quotaRefresh', '1');
  if (input.contextDetail === true) params.set('contextDetail', '1');
  if (input.usageSync === true) params.set('usageSync', '1');
  if (input.usageOnly === true) params.set('usageOnly', '1');
  if (input.usageScope === 'local' || input.usageScope === 'account') params.set('usageScope', input.usageScope);
  const qs = params.toString();
  const path = qs ? `/api/metrics?${qs}` : '/api/metrics';

  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const req = requestFn(
      {
        hostname: valid.hostname,
        port: valid.port,
        path,
        method: 'GET',
        headers: {
          Host: `127.0.0.1:${valid.port}`,
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
        },
      },
      res => {
        const chunks = [];
        let bytes = 0;
        res.on('data', chunk => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
          bytes += buf.length;
          if (bytes > MAX_REMOTE_RESPONSE_BYTES) {
            req.destroy(new Error('Remote metrics response too large'));
            finish({ ok: false, kind: 'payload', error: 'Remote metrics response too large' });
            return;
          }
          chunks.push(buf);
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            finish({ ok: false, kind: 'http', statusCode: res.statusCode, error: `Remote metrics HTTP ${res.statusCode}` });
            return;
          }
          const rawBuf = Buffer.concat(chunks, bytes);
          const parseJson = text => {
            try {
              const parsed = JSON.parse(text);
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                finish({ ok: false, kind: 'payload', error: 'Invalid remote metrics payload' });
                return;
              }
              finish({ ok: true, data: parsed });
            } catch {
              finish({ ok: false, kind: 'payload', error: 'Malformed remote metrics JSON' });
            }
          };
          const encoding = String(res.headers?.['content-encoding'] || '').trim().toLowerCase();
          if (encoding === 'gzip') {
            gunzip(rawBuf, { maxOutputLength: MAX_REMOTE_RESPONSE_BYTES }, (err, decoded) => {
              if (err) {
                finish({ ok: false, kind: 'payload', error: 'Malformed remote metrics gzip payload' });
                return;
              }
              parseJson(decoded.toString('utf8'));
            });
            return;
          }
          parseJson(rawBuf.toString('utf8'));
        });
        res.on('error', err => finish({ ok: false, kind: 'transport', error: err?.message || 'Remote response error' }));
      },
    );
    req.on('error', err => finish({ ok: false, kind: 'transport', error: err?.message || 'Remote connection failed' }));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Remote metrics timeout'));
      finish({ ok: false, kind: 'timeout', error: 'Remote metrics timeout' });
    });
    req.end();
  });
}

export function mergeRemoteMetrics({
  remoteData,
  localBase = null,
  remoteHost,
  liveComposerModel = null,
  transport = null,
  preferences,
  theme,
  orchestratorSettings,
  integration,
  update,
}) {
  const host = sanitizeRemoteHost(remoteHost) || String(remoteHost || '');
  const remoteGroups = Array.isArray(remoteData?.groups) && remoteData.groups.length > 0 ? remoteData.groups : null;
  const localGroups = Array.isArray(localBase?.groups) ? localBase.groups : [];
  const groups = remoteGroups || localGroups;
  return {
    connection: remoteData?.connection || localBase?.connection || 'live',
    groups,
    speed: remoteData?.speed ?? null,
    ...(remoteData?.collection ? { collection: remoteData.collection } : {}),
    ...(remoteData?.sessionError ? { sessionError: remoteData.sessionError } : {}),
    ...(remoteData?.error ? { error: remoteData.error } : {}),
    ...(liveComposerModel ? { composerModel: liveComposerModel } : remoteData?.composerModel ? { composerModel: remoteData.composerModel } : {}),
    ...(remoteData?.usage ? { usage: remoteData.usage } : localBase?.usage ? { usage: localBase.usage } : {}),
    preferences,
    theme,
    orchestratorSettings,
    integration,
    update,
    remoteSession: { host, mode: 'connected', ...(transport ? { transport } : {}) },
  };
}

export function buildRemoteFallbackMetrics({
  localBase = null,
  remoteHost,
  reason = 'unconfigured',
  preferences,
  theme,
  orchestratorSettings,
  integration,
  update,
}) {
  const host = sanitizeRemoteHost(remoteHost) || String(remoteHost || '');
  return {
    connection: localBase?.connection || 'live',
    groups: Array.isArray(localBase?.groups) ? localBase.groups : [],
    speed: null,
    ...(localBase?.error ? { error: localBase.error } : {}),
    ...(localBase?.usage ? { usage: localBase.usage } : {}),
    preferences,
    theme,
    orchestratorSettings,
    integration,
    update,
    remoteSession: {
      host,
      mode: 'fallback',
      reason: reason === 'unreachable' ? 'unreachable' : 'unconfigured',
    },
  };
}

const STEP_TYPE_NAMES = {
  4: 'CORTEX_STEP_TYPE_RUN_COMMAND',
  14: 'CORTEX_STEP_TYPE_USER_INPUT',
  15: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE',
  30: 'CORTEX_STEP_TYPE_CHECKPOINT',
  33: 'CORTEX_STEP_TYPE_CONTEXT_COMPACTION',
};
const STEP_STATUS_NAMES = {
  1: 'CORTEX_STEP_STATUS_PENDING',
  2: 'CORTEX_STEP_STATUS_RUNNING',
  3: 'CORTEX_STEP_STATUS_DONE',
  6: 'CORTEX_STEP_STATUS_CANCELED',
  7: 'CORTEX_STEP_STATUS_ERROR',
  8: 'CORTEX_STEP_STATUS_GENERATING',
};
const RUN_STATUS_NAMES = {
  1: 'CASCADE_RUN_STATUS_IDLE',
  2: 'CASCADE_RUN_STATUS_RUNNING',
  3: 'CASCADE_RUN_STATUS_CANCELLED',
};

export function buildRendererTrajectoryProbe(cascadeId, { paginatedOnly = false, timeBudgetMs = 180, maxPages = 12 } = {}) {
  const cid = typeof cascadeId === 'string' ? cascadeId.trim() : '';
  if (!GUID_RE.test(cid)) throw new Error('Invalid conversation ID');
  const safeBudget = Number.isFinite(timeBudgetMs) ? Math.max(40, Math.min(2000, Math.floor(timeBudgetMs))) : 180;
  const safePages = Number.isFinite(maxPages) ? Math.max(1, Math.min(64, Math.floor(maxPages))) : 12;
  return `(async (cid, opts) => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    const isLs = v => Boolean(v && typeof v === 'object' && typeof v.getUserStatus === 'function' && (typeof v.getCascadeTrajectoryGeneratorMetadata === 'function' || typeof v.getCascadeTrajectory === 'function'));
    const findLs = () => {
      try {
        const ref = g.__agPulseRemoteLsRef;
        const cached = ref && (typeof ref.deref === 'function' ? ref.deref() : ref);
        if (isLs(cached)) return cached;
      } catch {}
      const root = document.getElementById('root') || document.body;
      if (!root) return null;
      const fk = Object.keys(root).find(k => k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'));
      if (!fk || !root[fk]) return null;
      const q = [root[fk]], seen = new Set();
      let visited = 0;
      while (q.length && visited < 6000) {
        const f = q.shift();
        if (!f || seen.has(f)) continue;
        seen.add(f);
        visited++;
        const v = f.memoizedProps && f.memoizedProps.value;
        if (isLs(v)) {
          try { g.__agPulseRemoteLsRef = typeof WeakRef === 'function' ? new WeakRef(v) : v; } catch {}
          return v;
        }
        if (f.child) q.push(f.child);
        if (f.sibling) q.push(f.sibling);
      }
      return null;
    };
    const ls = findLs();
    if (!ls) return null;
    const toIso = v => {
      if (v === undefined || v === null || v === '') return undefined;
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'bigint') {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return undefined;
        const d = new Date(n > 1e11 ? n : n * 1000);
        return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
      }
      if (typeof v === 'object' && v.seconds !== undefined) {
        const ms = Number(v.seconds) * 1000 + Math.floor(Number(v.nanos ?? 0) / 1e6);
        const d = new Date(ms);
        return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
      }
      return undefined;
    };
    const toDur = v => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === 'number' || typeof v === 'string') return v;
      if (typeof v === 'bigint') return Number(v);
      if (typeof v === 'object' && (v.seconds !== undefined || v.nanos !== undefined)) {
        return { seconds: Number(v.seconds ?? 0), nanos: Number(v.nanos ?? 0) };
      }
      return undefined;
    };
    const toIntStr = v => (v === undefined || v === null ? undefined : String(v));
    const mapUsage = u => u && typeof u === 'object' ? {
      model: u.model !== undefined ? Number(u.model) : undefined,
      inputTokens: toIntStr(u.inputTokens),
      outputTokens: toIntStr(u.outputTokens),
      thinkingOutputTokens: toIntStr(u.thinkingOutputTokens),
      responseOutputTokens: toIntStr(u.responseOutputTokens),
      cacheReadTokens: toIntStr(u.cacheReadTokens),
      cacheWriteTokens: toIntStr(u.cacheWriteTokens),
      apiProvider: u.apiProvider,
      responseId: typeof u.responseId === 'string' && u.responseId ? u.responseId : undefined,
      messageId: typeof u.messageId === 'string' && u.messageId ? u.messageId : undefined,
    } : undefined;
    const mapGroups = groups => Array.isArray(groups) ? groups.slice(0, 16).map(gr => ({
      name: typeof gr?.name === 'string' ? gr.name.slice(0, 64) : '',
      type: typeof gr?.type === 'string' ? gr.type.slice(0, 48) : '',
      source: typeof gr?.source === 'string' ? gr.source.slice(0, 48) : '',
      numTokens: Number(gr?.numTokens ?? gr?.tokens ?? 0),
    })) : undefined;
    const projectStep = s => {
      const m = s?.metadata || {};
      const pr = s?.plannerResponse;
      return {
        type: s?.type,
        status: s?.status,
        metadata: {
          createdAt: toIso(m.createdAt),
          startedAt: toIso(m.startedAt),
          completedAt: toIso(m.completedAt),
          viewableAt: toIso(m.viewableAt),
          finishedGeneratingAt: toIso(m.finishedGeneratingAt),
          ...(m.toolCall?.name ? { toolCall: { name: String(m.toolCall.name).slice(0, 80) } } : {}),
          ...(m.toolSource !== undefined ? { toolSource: String(m.toolSource) } : {}),
          ...(m.modelUsage ? { modelUsage: mapUsage(m.modelUsage) } : {}),
        },
        ...(pr ? {
          plannerResponse: {
            ...(Array.isArray(pr.toolCalls) ? { toolCalls: pr.toolCalls.map(() => ({})) } : {}),
            ...(typeof pr.response === 'string' && pr.response.trim() ? { response: '_' } : {}),
          },
        } : {}),
      };
    };
    const projectGen = gm => {
      const cm = gm?.metadata?.case === 'chatModel' ? gm.metadata.value : (gm?.chatModel || gm?.metadata?.value);
      if (!cm || typeof cm !== 'object') return null;
      const cwm = cm.chatStartMetadata?.contextWindowMetadata;
      const custom = cm.customMetadata || {};
      const modelId = (typeof custom.model_enum === 'string' && custom.model_enum)
        || (typeof cm.responseModel === 'string' && cm.responseModel)
        || (typeof cm.modelDisplayName === 'string' && cm.modelDisplayName)
        || (cm.model !== undefined ? String(cm.model) : '');
      const retryInfos = Array.isArray(cm.retryInfos)
        ? cm.retryInfos.filter(r => r?.usage).map(r => ({ usage: mapUsage(r.usage) }))
        : undefined;
      return {
        stepIndices: Array.isArray(gm.stepIndices) ? gm.stepIndices.map(Number).filter(Number.isInteger) : [],
        chatModel: {
          model: modelId,
          responseModel: typeof cm.responseModel === 'string' ? cm.responseModel : undefined,
          modelDisplayName: typeof cm.modelDisplayName === 'string' ? cm.modelDisplayName : undefined,
          timeToFirstToken: toDur(cm.timeToFirstToken),
          streamingDuration: toDur(cm.streamingDuration),
          usage: mapUsage(cm.usage),
          ...(retryInfos && retryInfos.length ? { retryInfos } : {}),
          ...(cm.chatStartMetadata ? {
            chatStartMetadata: {
              createdAt: toIso(cm.chatStartMetadata.createdAt),
              ...(cwm ? {
                contextWindowMetadata: {
                  estimatedTokensUsed: Number(cwm.estimatedTokensUsed ?? 0),
                  maxContextTokens: Number(cwm.maxContextTokens ?? 0),
                  ...(cwm.tokenBreakdown?.groups ? { tokenBreakdown: { groups: mapGroups(cwm.tokenBreakdown.groups) } } : {}),
                },
              } : {}),
            },
          } : {}),
        },
      };
    };

    const yieldTick = () => new Promise(r => setTimeout(r, 0));
    const hasPaginatedMeta = typeof ls.getCascadeTrajectoryGeneratorMetadata === 'function';
    const hasPaginatedSteps = typeof ls.getCascadeTrajectorySteps === 'function';
    if (hasPaginatedMeta) {
      const key = cid.toLowerCase();
      if (!(g.__agPulseRemoteTrajCache instanceof Map)) g.__agPulseRemoteTrajCache = new Map();
      const cacheMap = g.__agPulseRemoteTrajCache;
      let entry = cacheMap.get(key);
      if (!entry) {
        entry = { steps: [], generatorMetadata: [], status: null };
        cacheMap.set(key, entry);
        while (cacheMap.size > 4) cacheMap.delete(cacheMap.keys().next().value);
      } else {
        cacheMap.delete(key);
        cacheMap.set(key, entry);
      }
      const started = Date.now();
      let pages = 0;
      let partial = false;
      let genOffset = Math.max(0, entry.generatorMetadata.length - 1);
      const nextGens = entry.generatorMetadata.slice(0, genOffset);
      while (pages < opts.maxPages) {
        if (pages > 0 && Date.now() - started >= opts.timeBudgetMs) { partial = true; break; }
        let page;
        try {
          page = await ls.getCascadeTrajectoryGeneratorMetadata({ cascadeId: cid, generatorMetadataOffset: genOffset, includeMessages: false });
        } catch {
          return null;
        }
        pages++;
        const rawItems = Array.isArray(page?.generatorMetadata || page?.generatorMetadatas)
          ? (page.generatorMetadata || page.generatorMetadatas)
          : [];
        if (!rawItems.length) break;
        for (const item of rawItems) {
          const projected = projectGen(item);
          if (projected) nextGens.push(projected);
        }
        genOffset += rawItems.length;
        if (Date.now() - started >= opts.timeBudgetMs) { partial = true; break; }
        await yieldTick();
      }
      entry.generatorMetadata = nextGens;

      if (hasPaginatedSteps && !partial) {
        let stepOffset = Math.max(0, entry.steps.length - 8);
        const nextSteps = entry.steps.slice(0, stepOffset);
        while (pages < opts.maxPages) {
          if (Date.now() - started >= opts.timeBudgetMs) { partial = true; break; }
          let page;
          try {
            page = await ls.getCascadeTrajectorySteps({ cascadeId: cid, stepOffset, trajectoryVerbosity: 3 });
          } catch {
            break;
          }
          pages++;
          const rawSteps = Array.isArray(page?.steps) ? page.steps : [];
          if (!rawSteps.length) break;
          for (const st of rawSteps) nextSteps.push(projectStep(st));
          stepOffset += rawSteps.length;
          if (Date.now() - started >= opts.timeBudgetMs) { partial = true; break; }
          await yieldTick();
        }
        entry.steps = nextSteps;
      }

      if (!entry.generatorMetadata.length && !entry.steps.length) return null;
      return {
        paginated: true,
        partial,
        status: entry.status,
        numTotalSteps: entry.steps.length,
        numTotalGeneratorMetadata: entry.generatorMetadata.length,
        trajectory: {
          cascadeId: key,
          steps: entry.steps,
          generatorMetadata: entry.generatorMetadata,
        },
      };
    }

    if (opts.paginatedOnly || typeof ls.getCascadeTrajectory !== 'function') return null;
    let res;
    try { res = await ls.getCascadeTrajectory({ cascadeId: cid }); } catch { return null; }
    const traj = res && res.trajectory;
    if (!traj || typeof traj !== 'object') return null;
    const steps = Array.isArray(traj.steps) ? traj.steps.map(projectStep) : [];
    const generatorMetadata = Array.isArray(traj.generatorMetadata) ? traj.generatorMetadata.map(projectGen).filter(Boolean) : [];
    return {
      paginated: false,
      status: res.status,
      numTotalSteps: Number(res.numTotalSteps ?? steps.length),
      numTotalGeneratorMetadata: Number(res.numTotalGeneratorMetadata ?? generatorMetadata.length),
      trajectory: {
        cascadeId: cid.toLowerCase(),
        steps,
        generatorMetadata,
      },
    };
  })(${JSON.stringify(cid)}, ${JSON.stringify({ paginatedOnly: Boolean(paginatedOnly), timeBudgetMs: safeBudget, maxPages: safePages })})`;
}

function normalizeProvider(rawProvider, meta = {}) {
  if (typeof rawProvider === 'string' && /GOOGLE_GEMINI|OPENAI|ANTHROPIC/i.test(rawProvider)) return rawProvider;
  const hint = `${meta.modelDisplayName || ''} ${meta.responseModel || ''} ${meta.model || ''}`.toLowerCase();
  if (/\bclaude\b|anthropic|\bsonnet\b|\bopus\b|\bhaiku\b/.test(hint)) return 'API_PROVIDER_ANTHROPIC';
  if (/\bgpt\b|openai|\bo[134]\b/.test(hint)) return 'API_PROVIDER_OPENAI';
  if (/\bgemini\b|neon|carbon|argon|hydrogen|orchestrator/.test(hint) || Number(rawProvider) === 24) {
    return 'API_PROVIDER_GOOGLE_GEMINI';
  }
  return typeof rawProvider === 'string' ? rawProvider : '';
}

export function normalizeRendererTrajectory(projected, cascadeId = null) {
  if (!projected || typeof projected !== 'object' || !projected.trajectory) return null;
  const traj = projected.trajectory;
  const steps = Array.isArray(traj.steps) ? traj.steps.map(s => ({
    ...s,
    type: typeof s?.type === 'number' ? (STEP_TYPE_NAMES[s.type] || `CORTEX_STEP_TYPE_${s.type}`) : s?.type,
    status: typeof s?.status === 'number' ? (STEP_STATUS_NAMES[s.status] || `CORTEX_STEP_STATUS_${s.status}`) : s?.status,
  })) : [];
  let hostUsage = null;
  const generatorMetadata = Array.isArray(traj.generatorMetadata) ? traj.generatorMetadata.map(gm => {
    const cm = gm?.chatModel;
    if (!cm || typeof cm !== 'object') return gm;
    const usage = cm.usage ? { ...cm.usage, apiProvider: normalizeProvider(cm.usage.apiProvider, cm) } : undefined;
    const cwm = cm.chatStartMetadata?.contextWindowMetadata;
    if (cwm && Array.isArray(cwm.tokenBreakdown?.groups) && cwm.tokenBreakdown.groups.length && cwm.maxContextTokens > 0) {
      hostUsage = {
        estimatedTokensUsed: cwm.estimatedTokensUsed,
        maxContextTokens: cwm.maxContextTokens,
        tokenGroups: cwm.tokenBreakdown.groups,
      };
    }
    return {
      ...gm,
      chatModel: {
        ...cm,
        ...(usage ? { usage } : {}),
      },
    };
  }) : [];
  const rawStatus = projected.status;
  const status = typeof rawStatus === 'number'
    ? (RUN_STATUS_NAMES[rawStatus] || `CASCADE_RUN_STATUS_${rawStatus}`)
    : (typeof rawStatus === 'string' ? rawStatus : null);
  return {
    status,
    numTotalSteps: Number.isSafeInteger(projected.numTotalSteps) ? projected.numTotalSteps : steps.length,
    numTotalGeneratorMetadata: Number.isSafeInteger(projected.numTotalGeneratorMetadata) ? projected.numTotalGeneratorMetadata : generatorMetadata.length,
    trajectory: {
      cascadeId: String(traj.cascadeId || cascadeId || '').toLowerCase(),
      steps,
      generatorMetadata,
    },
    ...(hostUsage ? { hostUsage } : {}),
  };
}

function createBridgeRequestHandler({ metrics, health = null, defaultHealth = { ok: true, mode: 'remote-bridge' } }) {
  return async (req, res) => {
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (req.headers.origin && req.headers.origin !== `http://${host}`) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end();
      return;
    }
    const url = new URL(req.url || '/', `http://${host}`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (url.pathname === '/api/health') {
      const payload = typeof health === 'function' ? await health() : defaultHealth;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
      return;
    }
    if (url.pathname === '/api/metrics' && typeof metrics === 'function') {
      try {
        const scopeParam = url.searchParams.get('usageScope');
        const rawCid = url.searchParams.get('conversationId');
        const conversationId = typeof rawCid === 'string' && GUID_RE.test(rawCid) ? rawCid : null;
        const payload = await metrics({
          conversationId,
          selectLatest: false,
          force: url.searchParams.get('force') === '1',
          quotaRefresh: url.searchParams.get('quotaRefresh') === '1',
          ...(url.searchParams.get('contextDetail') === '1' ? { contextDetail: true } : {}),
          ...(url.searchParams.get('usageSync') === '1' ? { usageSync: true } : {}),
          ...(url.searchParams.get('usageOnly') === '1' ? { usageOnly: true } : {}),
          ...(scopeParam === 'local' || scopeParam === 'account' ? { usageScope: scopeParam } : {}),
        });
        const jsonBuf = Buffer.from(JSON.stringify(payload), 'utf8');
        const acceptGzip = /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''));
        if (acceptGzip && jsonBuf.length >= 1024) {
          gzip(jsonBuf, { level: 1 }, (err, compressed) => {
            if (err) {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(jsonBuf);
              return;
            }
            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Encoding': 'gzip',
              Vary: 'Accept-Encoding',
            });
            res.end(compressed);
          });
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(jsonBuf);
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"error":"Remote metrics temporarily unavailable"}');
      }
      return;
    }
    res.writeHead(404);
    res.end();
  };
}

export function startRemoteBridgeServer({ port, metrics, health = null, onError = null } = {}) {
  const validPort = validateBridgePort(port);
  if (!validPort) return null;
  const server = createServer(createBridgeRequestHandler({
    metrics,
    health,
    defaultHealth: { ok: true, mode: 'remote-bridge', port: validPort },
  }));
  server.on('error', err => {
    if (typeof onError === 'function') onError(err);
  });
  server.listen(validPort, '127.0.0.1');
  server.unref?.();
  return server;
}

function unlinkIfSocket(socketPath) {
  try {
    const st = lstatSync(socketPath);
    if (st.isSocket()) unlinkSync(socketPath);
    else return false;
  } catch (err) {
    if (err?.code !== 'ENOENT') return false;
  }
  return true;
}

export function startRemoteUnixBridgeServer({ socketPath, metrics, health = null, onError = null } = {}) {
  if (process.platform === 'win32') return null;
  const validPath = validateBridgeSocketPath(socketPath);
  if (!validPath) return null;
  try {
    mkdirSync(dirname(validPath), { recursive: true, mode: 0o700 });
  } catch {}
  if (!unlinkIfSocket(validPath)) return null;
  const server = createServer(createBridgeRequestHandler({
    metrics,
    health,
    defaultHealth: { ok: true, mode: 'remote-unix-bridge', socketPath: validPath },
  }));
  server.on('error', err => {
    if (typeof onError === 'function') onError(err);
  });
  server.once('listening', () => {
    try { chmodSync(validPath, 0o600); } catch {}
  });
  const origClose = server.close.bind(server);
  server.close = cb => origClose(err => {
    unlinkIfSocket(validPath);
    if (typeof cb === 'function') cb(err);
  });
  server.listen(validPath);
  server.unref?.();
  return server;
}

export function allocateLoopbackPort() {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.unref?.();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(err => {
        if (err || !port) reject(err || new Error('Failed to allocate loopback port'));
        else resolve(port);
      });
    });
  });
}

export function probeBridgeHealth(port, { timeoutMs = 450, requestFn = request } = {}) {
  const valid = validateLoopbackEndpoint(port);
  if (!valid) return Promise.resolve(false);
  return new Promise(resolve => {
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const req = requestFn(
      {
        hostname: '127.0.0.1',
        port: valid.port,
        path: '/api/health',
        method: 'GET',
        headers: { Host: `127.0.0.1:${valid.port}`, Accept: 'application/json' },
      },
      res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          if (body.length < 4096) body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) return finish(false);
          try {
            const parsed = JSON.parse(body);
            finish(parsed?.ok === true);
          } catch {
            finish(false);
          }
        });
        res.on('error', () => finish(false));
      },
    );
    req.on('error', () => finish(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      finish(false);
    });
    req.end();
  });
}

function defaultReadTunnelState(stateFile) {
  try {
    const raw = readFileSync(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function defaultWriteTunnelState(stateFile, entries) {
  try {
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify(entries), { mode: 0o600 });
  } catch {}
}

function defaultInspectPidCommand(pid) {
  if (process.platform === 'win32') return '';
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function defaultKillPid(pid) {
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

function defaultProbeRemoteSocket(parsed, { sshBin = process.env.ANTIGRAVITY_SSH_BIN || 'ssh', timeoutMs = 2500 } = {}) {
  if (process.platform === 'win32' || !parsed?.target) return Promise.resolve(null);
  const args = [
    '-T',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=4',
    '-o', 'ControlMaster=no',
    '-o', 'ControlPath=none',
    ...(parsed.port ? ['-p', String(parsed.port)] : []),
    '--',
    parsed.target,
    'sh -c \'for p in "${XDG_DATA_HOME:-$HOME/.local/share}/AntigravityPulse/bridge.sock" "$HOME/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/data/bridge.sock"; do [ -S "$p" ] && printf "%s\\n" "$p" && break; done\'',
  ];
  return new Promise(resolve => {
    execFile(sshBin, args, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const line = String(stdout || '').trim().split(/\r?\n/)[0] || '';
      resolve(validateBridgeSocketPath(line));
    });
  });
}

export class RemoteSshTunnelManager {
  constructor({
    sshBin = process.env.ANTIGRAVITY_SSH_BIN || 'ssh',
    spawnFn = spawn,
    allocatePortFn = allocateLoopbackPort,
    probeHealthFn = probeBridgeHealth,
    probeRemoteSocketFn = null,
    preferUnixSocket = process.platform !== 'win32',
    stateFile = null,
    readStateFn = defaultReadTunnelState,
    writeStateFn = defaultWriteTunnelState,
    inspectPidFn = defaultInspectPidCommand,
    killPidFn = defaultKillPid,
    now = Date.now,
    idleMs = 300000,
    readyTimeoutMs = 6000,
    probeIntervalMs = 150,
    baseCooldownMs = 15000,
    reconnectCooldownMs = 3000,
    maxCooldownMs = 120000,
  } = {}) {
    this.sshBin = sshBin;
    this.spawnFn = spawnFn;
    this.allocatePortFn = allocatePortFn;
    this.probeHealthFn = probeHealthFn;
    this.probeRemoteSocketFn = typeof probeRemoteSocketFn === 'function'
      ? probeRemoteSocketFn
      : (parsed => defaultProbeRemoteSocket(parsed, { sshBin: this.sshBin }));
    this.preferUnixSocket = Boolean(preferUnixSocket) && process.platform !== 'win32';
    this.stateFile = typeof stateFile === 'string' && stateFile ? stateFile : null;
    this.readStateFn = readStateFn;
    this.writeStateFn = writeStateFn;
    this.inspectPidFn = inspectPidFn;
    this.killPidFn = killPidFn;
    this.now = now;
    this.idleMs = idleMs;
    this.readyTimeoutMs = readyTimeoutMs;
    this.probeIntervalMs = probeIntervalMs;
    this.baseCooldownMs = baseCooldownMs;
    this.reconnectCooldownMs = reconnectCooldownMs;
    this.maxCooldownMs = maxCooldownMs;
    this.tunnels = new Map();
    this.inFlight = new Map();
    this.failures = new Map();
    this.socketCache = new Map();
    this.disposed = false;
    if (this.stateFile) this.reapOrphans();
    this.reaper = setInterval(() => this.reapIdle(), Math.min(30000, Math.max(5000, Math.floor(idleMs / 2))));
    this.reaper.unref?.();
  }

  _tunnelKey(parsed, rPort) {
    return `${parsed.target.toLowerCase()}${parsed.port ? `:${parsed.port}` : ''}/${rPort}`;
  }

  _hostKey(parsed) {
    return `${parsed.target.toLowerCase()}${parsed.port ? `:${parsed.port}` : ''}`;
  }

  _persistState() {
    if (!this.stateFile) return;
    const records = [];
    for (const entry of this.tunnels.values()) {
      const pid = entry.child?.pid;
      if (!entry.closed && Number.isInteger(pid) && pid > 1) {
        records.push({
          pid,
          host: entry.host,
          localPort: entry.endpoint.port,
          remotePort: entry.remotePort,
          forwardSpec: entry.forwardSpec,
          createdAt: entry.createdAt,
        });
      }
    }
    try {
      this.writeStateFn(this.stateFile, records);
    } catch {}
  }

  reapOrphans() {
    if (!this.stateFile) return 0;
    let reaped = 0;
    let prev = [];
    try {
      prev = this.readStateFn(this.stateFile);
    } catch {
      prev = [];
    }
    if (Array.isArray(prev)) {
      for (const item of prev) {
        const pid = Number(item?.pid);
        const localPort = Number(item?.localPort);
        const remotePort = Number(item?.remotePort);
        if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) continue;
        const expectedForward = typeof item?.forwardSpec === 'string' && item.forwardSpec.startsWith('127.0.0.1:')
          ? item.forwardSpec
          : (Number.isInteger(localPort) && Number.isInteger(remotePort) ? `127.0.0.1:${localPort}:127.0.0.1:${remotePort}` : '');
        if (!expectedForward) continue;
        let cmd = '';
        try {
          cmd = String(this.inspectPidFn(pid) || '');
        } catch {
          cmd = '';
        }
        if (/\bssh\b/i.test(cmd) && cmd.includes(expectedForward)) {
          try {
            if (this.killPidFn(pid) !== false) reaped++;
          } catch {}
        }
      }
    }
    this._persistState();
    return reaped;
  }

  _killEntry(entry) {
    if (!entry) return;
    entry.closed = true;
    try {
      entry.child?.kill?.('SIGTERM');
    } catch {}
  }

  _recordFailure(key, { soft = false } = {}) {
    const prev = this.failures.get(key) || { count: 0, until: 0 };
    const count = Math.min(prev.count + 1, 6);
    const base = soft && count === 1 ? Math.min(this.reconnectCooldownMs, this.baseCooldownMs) : this.baseCooldownMs;
    const delay = Math.min(this.maxCooldownMs, base * 2 ** (count - 1));
    this.failures.set(key, { count, until: this.now() + delay });
  }

  _clearFailure(key) {
    this.failures.delete(key);
  }

  reapIdle() {
    const cutoff = this.now() - this.idleMs;
    let changed = false;
    for (const [key, entry] of this.tunnels) {
      if (entry.ready && entry.lastUsedAt < cutoff) {
        this._killEntry(entry);
        this.tunnels.delete(key);
        changed = true;
      }
    }
    if (changed) this._persistState();
  }

  markFailed(remoteHost, remotePort = 17891, { soft = false } = {}) {
    const parsed = parseSshTarget(remoteHost);
    const rPort = validateBridgePort(remotePort) || 17891;
    if (!parsed) return;
    const key = this._tunnelKey(parsed, rPort);
    this.socketCache.delete(this._hostKey(parsed));
    const entry = this.tunnels.get(key);
    if (entry) {
      this._killEntry(entry);
      this.tunnels.delete(key);
      this._persistState();
    }
    this._recordFailure(key, { soft });
  }

  async verifyOrMarkFailed(remoteHost, remotePort = 17891, { kind = 'transport' } = {}) {
    const parsed = parseSshTarget(remoteHost);
    const rPort = validateBridgePort(remotePort) || 17891;
    if (!parsed) return false;
    const key = this._tunnelKey(parsed, rPort);
    const entry = this.tunnels.get(key);
    // Slow /api/metrics responses (timeout) or transient HTTP 5xx do not mean the
    // SSH tunnel died. Keep the healthy tunnel open instead of tearing it down.
    if (kind === 'timeout' || kind === 'http' || kind === 'payload') {
      if (entry && !entry.closed) {
        entry.lastUsedAt = this.now();
        return true;
      }
      return false;
    }
    if (entry && !entry.closed && entry.endpoint?.port) {
      const alive = await this.probeHealthFn(entry.endpoint.port, { timeoutMs: 800 }).catch(() => false);
      if (alive && !entry.closed) {
        entry.lastUsedAt = this.now();
        return true;
      }
    }
    this.markFailed(remoteHost, rPort, { soft: Boolean(entry?.ready) });
    return false;
  }

  async _resolveRemoteSocket(parsed, force) {
    if (!this.preferUnixSocket) return null;
    const hKey = this._hostKey(parsed);
    const cached = this.socketCache.get(hKey);
    if (!force && cached && this.now() < cached.expiresAt) return cached.socketPath;
    let found = null;
    try {
      const raw = await this.probeRemoteSocketFn(parsed);
      found = validateBridgeSocketPath(raw);
    } catch {
      found = null;
    }
    this.socketCache.set(hKey, { socketPath: found, expiresAt: this.now() + 60000 });
    return found;
  }

  async _spawnAndProbe(key, parsed, rPort, forwardTarget, transport) {
    let localPort;
    try {
      localPort = await this.allocatePortFn();
    } catch {
      return null;
    }
    const baseEndpoint = validateLoopbackEndpoint(localPort);
    if (!baseEndpoint) return null;
    const endpoint = { ...baseEndpoint, transport };
    const forwardSpec = `127.0.0.1:${localPort}:${forwardTarget}`;

    const args = [
      '-N',
      '-T',
      '-o', 'BatchMode=yes',
      '-o', 'ExitOnForwardFailure=no',
      '-o', 'ServerAliveInterval=15',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'ConnectTimeout=6',
      '-o', 'ControlMaster=no',
      '-o', 'ControlPath=none',
      ...(parsed.port ? ['-p', String(parsed.port)] : []),
      '-L', forwardSpec,
      '--',
      parsed.target,
    ];

    let child;
    try {
      child = this.spawnFn(this.sshBin, args, {
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      return null;
    }

    const nowTs = this.now();
    const entry = {
      key,
      host: parsed.target,
      sshPort: parsed.port,
      remotePort: rPort,
      forwardSpec,
      endpoint,
      child,
      ready: false,
      closed: false,
      createdAt: nowTs,
      lastUsedAt: nowTs,
      pending: null,
    };

    const cleanup = () => {
      entry.closed = true;
      entry.ready = false;
      if (this.tunnels.get(key) === entry) {
        this.tunnels.delete(key);
        this._persistState();
      }
    };
    child.once?.('exit', cleanup);
    child.once?.('error', cleanup);
    child.unref?.();

    this.tunnels.set(key, entry);
    this._persistState();

    const deadline = this.now() + this.readyTimeoutMs;
    const maxAttempts = Math.max(1, Math.ceil(this.readyTimeoutMs / Math.max(10, this.probeIntervalMs)) + 1);
    for (let attempt = 0; attempt < maxAttempts && !this.disposed && !entry.closed && this.now() < deadline; attempt++) {
      const ok = await this.probeHealthFn(localPort).catch(() => false);
      if (ok && !this.disposed && !entry.closed) {
        entry.ready = true;
        entry.lastUsedAt = this.now();
        this._clearFailure(key);
        this._persistState();
        return endpoint;
      }
      await new Promise(r => setTimeout(r, this.probeIntervalMs));
    }
    this._killEntry(entry);
    if (this.tunnels.get(key) === entry) this.tunnels.delete(key);
    this._persistState();
    return null;
  }

  async ensure(remoteHost, { remotePort = 17891, force = false, preferUnixSocket = this.preferUnixSocket } = {}) {
    if (this.disposed) return null;
    const parsed = parseSshTarget(remoteHost);
    const rPort = validateBridgePort(remotePort) || 17891;
    if (!parsed) return null;
    const key = this._tunnelKey(parsed, rPort);

    const existing = this.tunnels.get(key);
    if (existing && !existing.closed && existing.ready) {
      existing.lastUsedAt = this.now();
      return existing.endpoint;
    }
    if (this.inFlight.has(key)) return this.inFlight.get(key);

    const fail = this.failures.get(key);
    if (!force && fail && this.now() < fail.until) return null;

    const run = (async () => {
      if (preferUnixSocket && this.preferUnixSocket) {
        const remoteSocket = await this._resolveRemoteSocket(parsed, force);
        if (remoteSocket && !this.disposed) {
          const udsEndpoint = await this._spawnAndProbe(key, parsed, rPort, remoteSocket, 'ssh-auto-tunnel-uds');
          if (udsEndpoint) return udsEndpoint;
          // UDS forwarding may be disallowed by sshd; cache miss briefly and fall back to loopback TCP.
          this.socketCache.set(this._hostKey(parsed), { socketPath: null, expiresAt: this.now() + 120000 });
        }
      }
      if (this.disposed) return null;
      const tcpEndpoint = await this._spawnAndProbe(key, parsed, rPort, `127.0.0.1:${rPort}`, 'ssh-auto-tunnel');
      if (tcpEndpoint) return tcpEndpoint;
      this._recordFailure(key);
      return null;
    })().finally(() => {
      if (this.inFlight.get(key) === run) this.inFlight.delete(key);
    });

    this.inFlight.set(key, run);
    return run;
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.reaper);
    for (const entry of this.tunnels.values()) this._killEntry(entry);
    this.tunnels.clear();
    this.inFlight.clear();
    this.failures.clear();
    this.socketCache.clear();
    this._persistState();
  }
}
