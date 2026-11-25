// Non-invasive, restart-free host UI localization with WeakMap restoration.
module.exports = function createHostI18n(options = {}) {
  const TRANSLATABLE_ATTRS = ['aria-label', 'title', 'placeholder', 'alt', 'data-tooltip'];
  const MAX_TEXT_LENGTH = 1200;
  const MAX_PATTERN_TEXT_LENGTH = 400;
  const MAX_BUILTIN_KEY_LENGTH = 1200;
  const MAX_BUILTIN_VALUE_LENGTH = 1500;
  const MAX_BUILTIN_PATTERN_SOURCE_LENGTH = 400;
  const MAX_OVERRIDE_ENTRIES = 2000;
  const MAX_KEY_LENGTH = 200;
  const MAX_VALUE_LENGTH = 400;
  const PRUNE_MIN_REFS = 2048;
  const UNSAFE_TEXT_RE = /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/;
  const METADATA_KEYS = new Set(['$schema', 'schema', 'license', 'locale', 'version', '_comment', 'sources', 'patterns', 'exact', 'scoped']);

  const IMMUTABLE_SELECTOR = [
    '.monaco-editor',
    '.monaco-diff-editor',
    '.view-lines',
    '.view-line',
    '.monaco-list',
    '.explorer-viewlet',
    '.scm-view',
    '.tabs-container',
    '.monaco-breadcrumbs',
    '.xterm',
    '.terminal',
    '[data-testid="bottom-terminal-panel"]',
    '[data-testid="overview-panel-row-terminal"]',
    'code',
    'pre',
    'kbd',
    'samp',
    'style',
    'script',
    'noscript',
    'template',
    'svg',
    'math',
    'canvas',
    '.hljs',
    '.code-block',
    '[data-markdown-root]',
    '[data-testid="user-message-content"]',
    '[data-testid="user-message-bubble"]',
    '.agy-user-bubble',
    '[data-testid="user-input-step"]',
    '.prose',
    '.markdown',
    '.markdown-body',
    '[data-uri^="file:"]',
    '[data-uri^="vscode-"]',
    '.inline-pill[data-uri]',
    'a.inline-pill[href^="file:"]',
    'a.inline-pill[href^="vscode-"]',
    '[class*="group/file-title"]',
    '[data-testid="conversation-row-sidebar"] .truncate',
    '[data-testid="conversation-row-history"] .truncate',
    '.agy-sidebar-row .truncate',
    '[data-testid="breadcrumb-segment"]',
    '[data-testid="conversation-navigator-turn"]',
    '[data-testid="model-selector-trigger"]',
    '[data-model-base]',
    '[data-testid="model-selector-orchestrator-model"]',
    '[data-testid="settings-nav-item-Account"]',
    '[data-testid="workspace-customizations-view"] .truncate',
    '[data-testid="customization-card"] .truncate',
    '[data-testid="mcp-server-row"] .font-medium',
    '[data-pulse-widget]',
    '[data-ag-pulse-bar]',
    '[id^="ag-pulse-status-bar"]',
    '#usage-dashboard',
    '#plugin-update-dialog',
    'iframe',
    'frame',
    'webview',
    'object',
    'embed',
    '[data-testid*="teamwork-frame"]',
    '[data-teamwork-frame]',
    '[data-ag-i18n-ignore]',
    '[data-ag-localization-skip]',
  ].join(',');

  const KNOWN_SETTINGS_NAV_IDS = new Set([
    'settings-nav-item-General',
    'settings-nav-item-App',
    'settings-nav-item-Appearance',
    'settings-nav-item-Shortcuts',
    'settings-nav-item-Notifications',
    'settings-nav-item-Models',
    'settings-nav-item-Browser',
    'settings-nav-item-Conversations',
    'settings-nav-item-Provide Feedback',
  ]);

  const MODEL_MENU_SELECTOR = [
    '[data-testid="model-selector-panel"]',
    '[data-testid="model-selector-header"]',
    '[data-testid="model-selector-item"]',
    '[data-testid="model-selector-orchestrator"]',
    '[data-testid="model-selector-effort-option"]',
    '[role="menu"]',
    '[role="menubar"]',
    '[role="menuitem"]',
    '[role="menuitemradio"]',
    '[role="menuitemcheckbox"]',
    '[role="listbox"]',
    '[role="option"]',
    '[role="radiogroup"]',
    '[role="radio"]',
    '[data-radix-popper-content-wrapper]',
    '[data-floating-ui-portal]',
    '[data-base-ui-portal]',
  ].join(',');

  const IMMUTABLE_TAGS = new Set([
    'CODE', 'PRE', 'KBD', 'SAMP', 'STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE',
    'SVG', 'MATH', 'CANVAS', 'IFRAME', 'FRAME', 'WEBVIEW', 'OBJECT', 'EMBED',
  ]);
  const EDITABLE_TAGS = new Set(['TEXTAREA', 'INPUT', 'SELECT', 'OPTION']);

  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  const win = options.window || doc?.defaultView || (typeof window !== 'undefined' ? window : null);
  const ObserverImpl = options.MutationObserver || win?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
  const Filter = options.NodeFilter || win?.NodeFilter || (typeof NodeFilter !== 'undefined'
    ? NodeFilter
    : { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 });
  const allowNested = options.allowNested === true;
  const makeRef = typeof WeakRef === 'function' ? value => new WeakRef(value) : value => ({ deref: () => value });

  const isPathOrUrl = trimmed => {
    if (/^(?:https?|wss?|file|vscode-[a-z0-9-]+|mailto|data|blob):/i.test(trimmed)) return true;
    if (/^(?:[a-zA-Z]:[\\/]|\\\\)/.test(trimmed)) return true;
    if (/^(?:~\/|\.\.?\/|\/[^\s])/.test(trimmed)) return true;
    if (/^[^\s]+\/[^\s]+$/.test(trimmed) || /^[^\s]+\\[^\s]+$/.test(trimmed)) return true;
    if (/^[\w.-]+\.(?:js|mjs|cjs|ts|tsx|jsx|py|go|rs|json|md|css|html|yml|yaml|toml|sh|ps1|txt|log|asar)$/i.test(trimmed)) return true;
    return false;
  };

  const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  const normalizeKey = text => text
    .replace(/\u2026/g, '...')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function normalizeOverrides(raw) {
    const cleaned = new Map();
    if (!isPlainObject(raw)) return cleaned;
    const sources = [];
    if (isPlainObject(raw.exact)) sources.push(raw.exact);
    sources.push(raw);
    for (const source of sources) {
      for (const [rawKey, rawValue] of Object.entries(source)) {
        if (cleaned.size >= MAX_OVERRIDE_ENTRIES) break;
        if (source === raw && METADATA_KEYS.has(rawKey)) continue;
        if (typeof rawKey !== 'string') continue;
        const key = rawKey.trim();
        if (!key || key.length > MAX_KEY_LENGTH || UNSAFE_TEXT_RE.test(key) || isPathOrUrl(key)) continue;
        if (rawValue === null || rawValue === false) {
          cleaned.set(key, null);
          continue;
        }
        if (typeof rawValue !== 'string') continue;
        const value = rawValue.trim();
        if (!value || value.length > MAX_VALUE_LENGTH || UNSAFE_TEXT_RE.test(value)) continue;
        cleaned.set(key, value);
      }
    }
    return cleaned;
  }

  function loadScopedMap(rawScoped) {
    const map = new Map();
    if (!isPlainObject(rawScoped)) return map;
    for (const [rawKey, rawValue] of Object.entries(rawScoped)) {
      if (typeof rawKey !== 'string' || typeof rawValue !== 'string') continue;
      const key = rawKey.trim(), value = rawValue.trim();
      if (!key || !value || key.length > MAX_KEY_LENGTH || value.length > MAX_VALUE_LENGTH) continue;
      map.set(key, value);
    }
    return map;
  }

  function compileDictionary(baseDict, overrideInput) {
    const exactMap = new Map();
    const lowerMap = new Map();
    const compiledPatterns = [];
    if (isPlainObject(baseDict)) {
      const exactSource = isPlainObject(baseDict.exact) ? baseDict.exact : baseDict;
      for (const [rawKey, rawValue] of Object.entries(exactSource)) {
        if (exactSource === baseDict && METADATA_KEYS.has(rawKey)) continue;
        if (typeof rawKey !== 'string' || typeof rawValue !== 'string') continue;
        const key = rawKey.trim(), value = rawValue.trim();
        if (!key || !value || key.length > MAX_BUILTIN_KEY_LENGTH || value.length > MAX_BUILTIN_VALUE_LENGTH) continue;
        exactMap.set(key, value);
        if (key.length >= 10 || /\s/.test(key)) {
          const low = normalizeKey(key).toLowerCase();
          if (!lowerMap.has(low)) lowerMap.set(low, value);
        }
      }
      if (Array.isArray(baseDict.patterns)) {
        for (const item of baseDict.patterns) {
          if (!isPlainObject(item)) continue;
          const src = typeof item.source === 'string' ? item.source : (typeof item.regex === 'string' ? item.regex : '');
          if (!src || typeof item.replacement !== 'string') continue;
          if (src.length > MAX_BUILTIN_PATTERN_SOURCE_LENGTH || item.replacement.length > MAX_BUILTIN_VALUE_LENGTH) continue;
          try {
            compiledPatterns.push({ regex: new RegExp(src), replacement: item.replacement });
          } catch { /* Ignore malformed built-in pattern defensively. */ }
        }
      }
    }
    const modelMenuMap = loadScopedMap(baseDict?.scoped?.modelMenu);
    const badgeMap = loadScopedMap(baseDict?.scoped?.badge);
    const overrideMap = normalizeOverrides(overrideInput);
    for (const [key, value] of overrideMap) {
      exactMap.set(key, value);
      if (value !== null && (key.length >= 10 || /\s/.test(key))) {
        lowerMap.set(normalizeKey(key).toLowerCase(), value);
      }
    }
    return { exactMap, lowerMap, modelMenuMap, badgeMap, overrideMap, compiledPatterns };
  }

  const baseDictionary = options.dictionary ?? win?.__agPulseHostI18nDict ?? {};
  let overrideData = options.overrides || null;
  let { exactMap, lowerMap, modelMenuMap, badgeMap, overrideMap, compiledPatterns } = compileDictionary(baseDictionary, overrideData);

  const origText = new WeakMap();
  const origAttrs = new WeakMap();
  const trackedTextRefs = new Set();
  const trackedElementRefs = new Set();
  let nextTextPrune = PRUNE_MIN_REFS;
  let nextElementPrune = PRUNE_MIN_REFS;
  let observer = null;
  let enabled = false;

  const trackText = node => {
    if (trackedTextRefs.size >= nextTextPrune) {
      for (const ref of trackedTextRefs) {
        if (ref.deref() === undefined) trackedTextRefs.delete(ref);
      }
      nextTextPrune = Math.max(PRUNE_MIN_REFS, trackedTextRefs.size * 2);
    }
    trackedTextRefs.add(makeRef(node));
  };
  const trackElement = el => {
    if (trackedElementRefs.size >= nextElementPrune) {
      for (const ref of trackedElementRefs) {
        if (ref.deref() === undefined) trackedElementRefs.delete(ref);
      }
      nextElementPrune = Math.max(PRUNE_MIN_REFS, trackedElementRefs.size * 2);
    }
    trackedElementRefs.add(makeRef(el));
  };

  const hasClass = (el, cls) => typeof el?.classList?.contains === 'function'
    ? el.classList.contains(cls)
    : Boolean(el?.classList?.has?.(cls));

  const previousSiblingNode = node => {
    if (!node) return null;
    if (node.previousSibling !== undefined) return node.previousSibling;
    const kids = node.parentNode?.childNodes;
    if (!kids || typeof kids.indexOf !== 'function') return null;
    const idx = kids.indexOf(node);
    return idx > 0 ? kids[idx - 1] : null;
  };

  function isOwnImmutableElement(cur) {
    if (!cur || cur.nodeType !== 1) return true;
    const tag = cur.tagName ? cur.tagName.toUpperCase() : '';
    if (IMMUTABLE_TAGS.has(tag)) return true;
    if (typeof cur.matches === 'function') {
      try {
        if (cur.matches(IMMUTABLE_SELECTOR)) return true;
      } catch { /* Fall back to explicit attribute checks below. */ }
    }
    if (typeof cur.hasAttribute === 'function') {
      const testId = cur.getAttribute('data-testid') || '';
      if (cur.hasAttribute('data-markdown-root') || cur.hasAttribute('data-pulse-widget')
        || cur.hasAttribute('data-ag-pulse-bar') || cur.hasAttribute('data-ag-i18n-ignore')
        || cur.hasAttribute('data-ag-localization-skip') || cur.hasAttribute('data-model-base')
        || (cur.hasAttribute('data-effort') && testId !== 'model-selector-effort-option')
        || cur.hasAttribute('data-teamwork-frame')) return true;
      if (testId === 'model-selector-trigger' || testId === 'model-selector-orchestrator-model') return true;
      if (testId.startsWith('settings-nav-item-') && !KNOWN_SETTINGS_NAV_IDS.has(testId)) return true;
      if (tag === 'NAV' && cur.getAttribute('aria-label') === 'File path breadcrumbs') return true;
      if (hasClass(cur, 'text-muted-foreground')
        && (hasClass(cur, 'line-clamp-2') || hasClass(cur, 'leading-relaxed'))
        && typeof cur.closest === 'function'
        && cur.closest('[data-testid="workspace-customizations-view"], [data-testid="customization-card"]')) return true;
      const id = cur.getAttribute('id') || '';
      if (id.startsWith('ag-pulse-status-bar') || id === 'usage-dashboard' || id === 'plugin-update-dialog') return true;
      const uri = cur.getAttribute('data-uri') || '';
      if (uri.startsWith('file:') || uri.startsWith('vscode-')) return true;
    }
    return false;
  }

  function isImmutableElement(el) {
    if (!el || el.nodeType !== 1) return true;
    if (typeof el.closest === 'function') {
      try {
        if (el.closest(IMMUTABLE_SELECTOR)) return true;
      } catch { /* Fall back to ancestor check below if selector engine differs. */ }
    }
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
      const tag = cur.tagName ? cur.tagName.toUpperCase() : '';
      if (IMMUTABLE_TAGS.has(tag)) return true;
      if (typeof cur.hasAttribute === 'function') {
        const testId = cur.getAttribute('data-testid') || '';
        if (cur.hasAttribute('data-markdown-root') || cur.hasAttribute('data-pulse-widget')
          || cur.hasAttribute('data-ag-pulse-bar') || cur.hasAttribute('data-ag-i18n-ignore')
          || cur.hasAttribute('data-ag-localization-skip') || cur.hasAttribute('data-model-base')
          || (cur.hasAttribute('data-effort') && testId !== 'model-selector-effort-option')
          || cur.hasAttribute('data-teamwork-frame')) return true;
        if (testId === 'model-selector-trigger' || testId === 'model-selector-orchestrator-model') return true;
        if (testId.startsWith('settings-nav-item-') && !KNOWN_SETTINGS_NAV_IDS.has(testId)) return true;
        if (tag === 'NAV' && cur.getAttribute('aria-label') === 'File path breadcrumbs') return true;
        if (hasClass(cur, 'text-muted-foreground')
          && (hasClass(cur, 'line-clamp-2') || hasClass(cur, 'leading-relaxed'))
          && typeof cur.closest === 'function'
          && cur.closest('[data-testid="workspace-customizations-view"], [data-testid="customization-card"]')) return true;
        const id = cur.getAttribute('id') || '';
        if (id.startsWith('ag-pulse-status-bar') || id === 'usage-dashboard' || id === 'plugin-update-dialog') return true;
        const uri = cur.getAttribute('data-uri') || '';
        if (uri.startsWith('file:') || uri.startsWith('vscode-')) return true;
      }
    }
    return false;
  }

  function isTextEditable(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el.isContentEditable === true) return true;
    if (typeof el.closest === 'function') {
      try {
        if (el.closest('textarea,input,select,option')) return true;
        const ce = el.closest('[contenteditable]');
        if (ce) {
          const val = String(ce.getAttribute('contenteditable') || '').toLowerCase();
          if (val === '' || val === 'true' || val === 'plaintext-only') return true;
        }
      } catch {}
    }
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
      const tag = cur.tagName ? cur.tagName.toUpperCase() : '';
      if (EDITABLE_TAGS.has(tag)) return true;
      if (typeof cur.hasAttribute === 'function' && cur.hasAttribute('contenteditable')) {
        const val = String(cur.getAttribute('contenteditable') || '').toLowerCase();
        if (val === 'false') return false;
        if (val === '' || val === 'true' || val === 'plaintext-only') return true;
      }
    }
    return false;
  }

  function inModelMenuContext(el) {
    if (!el || typeof el.closest !== 'function') return false;
    try {
      return Boolean(el.closest(MODEL_MENU_SELECTOR));
    } catch {
      return false;
    }
  }

  function isBadgeContext(el) {
    if (!el || typeof el.closest !== 'function') return false;
    try {
      const pill = el.closest('.rounded-full');
      return Boolean(pill && !pill.closest('button, [role="button"]'));
    } catch {
      return false;
    }
  }

  function lookupExact(candidate, element) {
    if (overrideMap.has(candidate)) return overrideMap.get(candidate);
    if (element) {
      if (modelMenuMap.has(candidate) && inModelMenuContext(element)) return modelMenuMap.get(candidate);
      if (badgeMap.has(candidate) && isBadgeContext(element)) return badgeMap.get(candidate);
    }
    if (exactMap.has(candidate)) return exactMap.get(candidate);
    return undefined;
  }

  function translateCore(trimmed, element) {
    const direct = lookupExact(trimmed, element);
    if (direct !== undefined) return direct;

    const norm = normalizeKey(trimmed);
    if (norm !== trimmed) {
      const normHit = lookupExact(norm, element);
      if (normHit !== undefined) return normHit;
      const ellipHit = lookupExact(norm.replace(/\.\.\./g, '…'), element);
      if (ellipHit !== undefined) return ellipHit;
    }

    if (norm.length >= 10 || /\s/.test(norm)) {
      const low = norm.toLowerCase();
      if (lowerMap.has(low)) return lowerMap.get(low);
    }

    const shortcutMatch = norm.match(/^(?:(Shortcut|Remove shortcut) (.+?) for|Add shortcut for) (.+)$/);
    if (shortcutMatch) {
      const action = shortcutMatch[3];
      const actionCn = lookupExact(action, null) || lowerMap.get(normalizeKey(action).toLowerCase());
      if (typeof actionCn === 'string' && actionCn) {
        if (shortcutMatch[1] === 'Shortcut') return `快捷键 ${shortcutMatch[2]}：${actionCn}`;
        if (shortcutMatch[1] === 'Remove shortcut') return `移除 ${actionCn} 的快捷键 ${shortcutMatch[2]}`;
        return `为${actionCn}添加快捷键`;
      }
    }

    const resetShortcutMatch = norm.match(/^Reset (.+) to default$/);
    if (resetShortcutMatch) {
      const action = resetShortcutMatch[1];
      const actionCn = lookupExact(action, null) || lowerMap.get(normalizeKey(action).toLowerCase());
      if (typeof actionCn === 'string' && actionCn) return `将${actionCn}恢复为默认设置`;
    }

    if (trimmed.length <= MAX_PATTERN_TEXT_LENGTH) {
      for (const entry of compiledPatterns) {
        if (entry.regex.test(trimmed)) return trimmed.replace(entry.regex, entry.replacement);
        if (norm !== trimmed && entry.regex.test(norm)) return norm.replace(entry.regex, entry.replacement);
      }
    }

    const puncMatch = norm.match(/^([\w\s\-'’/()]+?)([:：…\.？\?!！]+)$/);
    if (puncMatch) {
      const base = puncMatch[1].trim();
      const punc = puncMatch[2];
      if (base.length >= 2 && /[a-zA-Z]/.test(base) && overrideMap.get(base) !== null) {
        const baseHit = lookupExact(base, element);
        if (typeof baseHit === 'string' && baseHit) {
          const zhPunc = punc === ':' ? '：' : (punc === '.' && /[\u4e00-\u9fa5]$/.test(baseHit) ? '。' : punc);
          return baseHit + zhPunc;
        }
      }
    }

    return undefined;
  }

  function translate(rawText, { attrName = null, element = null } = {}) {
    if (typeof rawText !== 'string' || !rawText) return null;
    const trimmed = rawText.trim();
    if (!trimmed || trimmed.length > MAX_TEXT_LENGTH) return null;
    // Host permission/editor onBlur checks exact aria-label === "Cancel".
    if (attrName === 'aria-label' && trimmed === 'Cancel') return null;
    if (isPathOrUrl(trimmed)) return null;

    let result = translateCore(trimmed, element);
    if (result === null) return null;

    if (result === undefined && (trimmed.includes('. ') || trimmed.includes('? ') || trimmed.includes('! '))) {
      const parts = trimmed.split(/([.!?]\s+)/);
      if (parts.length >= 3) {
        let anyTranslated = false;
        let allTranslated = true;
        const out = [];
        for (const part of parts) {
          const pt = part.trim();
          if (!pt || /^[.!?]+$/.test(pt)) {
            out.push(part.replace(/\.\s*/g, '。').replace(/\?\s*/g, '？').replace(/!\s*/g, '！'));
            continue;
          }
          let hit = translateCore(pt, element);
          if (hit === undefined && !/[.!?]$/.test(pt)) hit = translateCore(pt + '.', element);
          if (typeof hit === 'string' && hit) {
            anyTranslated = true;
            out.push(hit.replace(/。$/, ''));
          } else {
            allTranslated = false;
            break;
          }
        }
        if (anyTranslated && allTranslated) result = out.join('').trim();
      }
    }

    if (typeof result !== 'string' || !result || result === trimmed) return null;
    const lead = rawText.match(/^\s*/)[0];
    const trail = rawText.match(/\s*$/)[0];
    return lead + result + trail;
  }

  function translateTextNode(node) {
    if (!node || node.nodeType !== 3) return false;
    const current = node.nodeValue;
    const existing = origText.get(node);
    if (existing) {
      if (current === existing.translated) return false;
    }
    const parent = node.parentElement || null;
    const prev = previousSiblingNode(node);
    let next = null;
    if (current.trim() === '.' && prev) {
      const prevText = prev.textContent || '';
      const prevCjk = /[\u4e00-\u9fa5]/.test(prevText)
        || (prev.nodeType === 1 && !isImmutableElement(prev) && /[\u4e00-\u9fa5]/.test(translate(prevText, { element: prev }) || ''));
      if (prevCjk) next = current.replace('.', '。');
    } else {
      next = translate(current, { element: parent });
    }
    if (next === null) {
      if (existing) origText.delete(node);
      return false;
    }
    origText.set(node, { original: current, translated: next });
    trackText(node);
    node.nodeValue = next;
    return true;
  }

  function translateAttribute(el, attrName) {
    if (!el || el.nodeType !== 1 || !TRANSLATABLE_ATTRS.includes(attrName)) return false;
    if (typeof el.getAttribute !== 'function' || typeof el.setAttribute !== 'function') return false;
    const current = el.getAttribute(attrName);
    const map = origAttrs.get(el);
    if (current === null) {
      if (map) {
        map.delete(attrName);
        if (!map.size) origAttrs.delete(el);
      }
      return false;
    }
    const existing = map?.get(attrName);
    if (existing && current === existing.translated) return false;
    const next = translate(current, { attrName, element: el });
    if (next === null) {
      if (map) {
        map.delete(attrName);
        if (!map.size) origAttrs.delete(el);
      }
      return false;
    }
    let targetMap = map;
    if (!targetMap) {
      targetMap = new Map();
      origAttrs.set(el, targetMap);
    }
    targetMap.set(attrName, { original: current, translated: next });
    trackElement(el);
    el.setAttribute(attrName, next);
    return true;
  }

  const isInsideEditableDescendant = el => Boolean(el?.parentElement && isTextEditable(el.parentElement));

  function processSingleElement(el) {
    if (isInsideEditableDescendant(el)) return;
    for (const attr of TRANSLATABLE_ATTRS) translateAttribute(el, attr);
    if (!isTextEditable(el) && el.childNodes) {
      const nodes = el.childNodes;
      if (nodes.length > 1) {
        let allText = true;
        for (let i = 0; i < nodes.length; i++) {
          if (!nodes[i] || nodes[i].nodeType !== 3) { allText = false; break; }
        }
        if (allText) {
          let combined = '';
          let anyRecorded = false;
          for (let i = 0; i < nodes.length; i++) {
            const cur = nodes[i];
            const rec = origText.get(cur);
            if (rec && cur.nodeValue === rec.translated) {
              anyRecorded = true;
              combined += rec.original;
            } else {
              combined += cur.nodeValue || '';
            }
          }
          if (!anyRecorded) {
            const combinedNext = translate(combined, { element: el });
            if (combinedNext !== null && combinedNext !== combined) {
              const first = nodes[0];
              origText.set(first, { original: first.nodeValue || '', translated: combinedNext });
              trackText(first);
              first.nodeValue = combinedNext;
              for (let i = 1; i < nodes.length; i++) {
                const cur = nodes[i];
                origText.set(cur, { original: cur.nodeValue || '', translated: '' });
                trackText(cur);
                cur.nodeValue = '';
              }
              return;
            }
          }
        }
      }
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i] && nodes[i].nodeType === 3) translateTextNode(nodes[i]);
      }
    }
  }

  function processElementTree(startEl) {
    if (!startEl || startEl.nodeType !== 1 || isImmutableElement(startEl)) return;
    processSingleElement(startEl);
    if (typeof doc?.createTreeWalker === 'function') {
      const walker = doc.createTreeWalker(startEl, Filter.SHOW_ELEMENT, {
        acceptNode(node) {
          return isOwnImmutableElement(node) ? Filter.FILTER_REJECT : Filter.FILTER_ACCEPT;
        },
      });
      for (let cur = walker.nextNode(); cur; cur = walker.nextNode()) {
        processSingleElement(cur);
      }
      return;
    }
    const stack = Array.from(startEl.children || []);
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || cur.nodeType !== 1 || isOwnImmutableElement(cur)) continue;
      processSingleElement(cur);
      if (cur.children) {
        for (let i = cur.children.length - 1; i >= 0; i--) stack.push(cur.children[i]);
      }
    }
  }

  function resolveRoot() {
    return options.root || doc?.body || doc?.documentElement || null;
  }

  function restoreAll() {
    for (const ref of trackedTextRefs) {
      const node = ref.deref();
      if (!node) continue;
      const rec = origText.get(node);
      if (rec && node.nodeValue === rec.translated) node.nodeValue = rec.original;
      origText.delete(node);
    }
    trackedTextRefs.clear();
    nextTextPrune = PRUNE_MIN_REFS;

    for (const ref of trackedElementRefs) {
      const el = ref.deref();
      if (!el) continue;
      const map = origAttrs.get(el);
      if (map) {
        for (const [attr, rec] of map) {
          if (el.getAttribute(attr) === rec.translated) el.setAttribute(attr, rec.original);
        }
        origAttrs.delete(el);
      }
    }
    trackedElementRefs.clear();
    nextElementPrune = PRUNE_MIN_REFS;
  }

  const deferredElements = [];
  let deferredFrame = null;
  const canScheduleFrame = typeof win?.requestAnimationFrame === 'function';
  const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

  function clearDeferred() {
    deferredElements.length = 0;
    if (deferredFrame !== null && typeof win?.cancelAnimationFrame === 'function') {
      win.cancelAnimationFrame(deferredFrame);
    }
    deferredFrame = null;
  }

  function drainDeferred() {
    deferredFrame = null;
    if (!enabled || !deferredElements.length) {
      deferredElements.length = 0;
      return;
    }
    const deadline = nowMs() + 6;
    while (deferredElements.length) {
      const el = deferredElements.shift();
      if (el && el.isConnected !== false) processElementTree(el);
      if (deferredElements.length && nowMs() >= deadline) {
        deferredFrame = win.requestAnimationFrame(drainDeferred);
        return;
      }
    }
  }

  function handleMutations(records) {
    if (!enabled || !Array.isArray(records) || !records.length) return;
    const seenElements = new Set();
    const seenText = new Set();
    const deadline = canScheduleFrame ? nowMs() + 8 : Infinity;
    let elementsProcessed = 0;
    for (const record of records) {
      if (!record || !record.target) continue;
      if (record.type === 'characterData') {
        const textNode = record.target;
        if (textNode.nodeType !== 3 || seenText.has(textNode)) continue;
        seenText.add(textNode);
        const parent = textNode.parentElement;
        if (!parent || isImmutableElement(parent) || isTextEditable(parent)) continue;
        translateTextNode(textNode);
      } else if (record.type === 'attributes') {
        const el = record.target;
        if (el.nodeType !== 1 || isImmutableElement(el) || isInsideEditableDescendant(el)) continue;
        if (record.attributeName) translateAttribute(el, record.attributeName);
      } else if (record.type === 'childList') {
        const parent = record.target;
        if (parent.nodeType !== 1 || isImmutableElement(parent)) continue;
        const parentEditable = isTextEditable(parent);
        for (const added of record.addedNodes || []) {
          if (!added) continue;
          if (added.nodeType === 3) {
            if (!seenText.has(added) && !parentEditable) {
              seenText.add(added);
              translateTextNode(added);
            }
          } else if (added.nodeType === 1 && !parentEditable && !seenElements.has(added)) {
            seenElements.add(added);
            if (canScheduleFrame && elementsProcessed >= 32 && nowMs() >= deadline) {
              if (deferredElements.length < 4096) deferredElements.push(added);
            } else {
              elementsProcessed++;
              processElementTree(added);
            }
          }
        }
      }
    }
    if (deferredElements.length && deferredFrame === null && canScheduleFrame) {
      deferredFrame = win.requestAnimationFrame(drainDeferred);
    }
  }

  function startObserver(root) {
    if (observer || !ObserverImpl || !root) return;
    observer = new ObserverImpl(handleMutations);
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRS,
    });
  }

  function stopObserver() {
    clearDeferred();
    if (!observer) return;
    try { observer.takeRecords?.(); } catch {}
    observer.disconnect();
    observer = null;
  }

  function setEnabled(next) {
    const target = next === true;
    if (target === enabled) return enabled;
    if (target) {
      if (win && win !== win.top && !allowNested) return false;
      const root = resolveRoot();
      if (!root) return false;
      enabled = true;
      processElementTree(root);
      startObserver(root);
      return true;
    }
    enabled = false;
    stopObserver();
    restoreAll();
    return false;
  }

  function setOverrides(nextOverrides) {
    overrideData = nextOverrides || null;
    ({ exactMap, lowerMap, modelMenuMap, badgeMap, overrideMap, compiledPatterns } = compileDictionary(baseDictionary, overrideData));
    if (enabled) {
      stopObserver();
      restoreAll();
      const root = resolveRoot();
      if (root) {
        processElementTree(root);
        startObserver(root);
      }
    }
  }

  function stats() {
    let translatedTextNodes = 0;
    for (const ref of trackedTextRefs) {
      if (ref.deref()) translatedTextNodes++;
    }
    let translatedAttributes = 0;
    for (const ref of trackedElementRefs) {
      const el = ref.deref();
      if (el) translatedAttributes += origAttrs.get(el)?.size || 0;
    }
    return { enabled, translatedTextNodes, translatedAttributes };
  }

  function dispose() {
    setEnabled(false);
  }

  if (options.enabled === true) setEnabled(true);

  return {
    get enabled() { return enabled; },
    setEnabled,
    setOverrides,
    translate,
    isExcludedElement: isImmutableElement,
    stats,
    dispose,
  };
};
