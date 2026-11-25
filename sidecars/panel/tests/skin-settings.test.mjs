import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  BAR_COLOR_KEYS,
  THEME_MODES,
  CACHE_HIT_TONES,
  PreferencesStore,
  validateBarColors,
  validateThemeMode,
  validateCacheHitTone,
} from '../../../compat/preferences.mjs';

const require = createRequire(import.meta.url);
const createDashboardI18n = require('../../../compat/i18n.cjs');
const createAgPulseTheme = require('../../../compat/theme.cjs');

test('PreferencesStore persists barColors, themeMode, and cacheHitTone preferences safely', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-pulse-colors-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'preferences.json');
  const store = new PreferencesStore({ file });

  const initial = await store.get();
  assert.equal(initial.barColors, undefined);
  assert.equal(initial.themeMode, undefined);
  assert.equal(initial.cacheHitTone, undefined);
  assert.deepEqual(BAR_COLOR_KEYS, ['speed', 'token', 'quota', 'context']);

  await store.set({ barColors: { speed: '#7C3AED', token: '#16a34a', context: null } });
  const reloaded = await new PreferencesStore({ file }).get();
  assert.deepEqual(reloaded.barColors, { speed: '#7c3aed', token: '#16a34a' });

  await store.set({ barColors: {} });
  const cleared = await new PreferencesStore({ file }).get();
  assert.deepEqual(cleared.barColors, {});

  for (const themeMode of THEME_MODES) {
    await store.set({ themeMode });
    const modeReloaded = await new PreferencesStore({ file }).get();
    assert.equal(modeReloaded.themeMode, themeMode);
  }
  for (const tone of CACHE_HIT_TONES) {
    await store.set({ cacheHitTone: tone });
    const toneReloaded = await new PreferencesStore({ file }).get();
    assert.equal(toneReloaded.cacheHitTone, tone);
  }

  for (const badColors of ['purple', ['red'], { badKey: '#ffffff' }, { speed: 'not-a-color' }, { token: '#12345' }, { quota: 'rgb(1,2,3)' }]) {
    assert.throws(() => validateBarColors(badColors), /Invalid bar color/i);
    await assert.rejects(() => store.set({ barColors: badColors }), /Invalid bar color/i);
  }
  for (const badMode of ['sepia', '', null, 123]) {
    assert.throws(() => validateThemeMode(badMode), /Invalid theme mode preference/);
    await assert.rejects(() => store.set({ themeMode: badMode }), /Invalid theme mode preference/);
  }
  for (const badTone of ['green', '', null, true]) {
    assert.throws(() => validateCacheHitTone(badTone), /Invalid cache hit tone preference/);
    await assert.rejects(() => store.set({ cacheHitTone: badTone }), /Invalid cache hit tone preference/);
  }

  await writeFile(file, JSON.stringify({
    schema: 1,
    language: 'zh-CN',
    barColors: { speed: '#0284C7', quota: 'javascript:alert(1)', bogus: '#ffffff' },
    themeMode: 'night',
    cacheHitTone: 'rainbow',
    revision: 5,
  }));
  const recovered = await store.get();
  assert.equal(recovered.language, 'zh-CN');
  assert.deepEqual(recovered.barColors, { speed: '#0284c7' });
  assert.equal(recovered.themeMode, undefined);
  assert.equal(recovered.cacheHitTone, undefined);
});

test('runtime bridges whitelist barColors, themeMode, and cacheHitTone preferences', async () => {
  for (const rel of ['../../../compat/ipc-host.cjs', '../../../compat/runtime-ui.mjs']) {
    const src = await readFile(new URL(rel, import.meta.url), 'utf8');
    assert.ok(src.includes("'barColors'"), `${rel} must whitelist barColors`);
    assert.ok(src.includes("'themeMode'"), `${rel} must whitelist themeMode`);
    assert.ok(src.includes("'cacheHitTone'"), `${rel} must whitelist cacheHitTone`);
  }
});

test('i18n exposes trilingual barColors, themeMode & settings keys and connects controllers', async () => {
  const keys = [
    'pulseSettings', 'pulseSettingsTitle', 'pulseSettingsSubtitle',
    'settingsSectionTheme', 'settingsSectionBar', 'settingsSectionGeneral',
    'settingsMode', 'modeAuto', 'modeLight', 'modeDark', 'themeModeSaveFailed',
    'barColorSpeed', 'barColorToken', 'barColorQuota', 'barColorContext',
    'barColorDefault', 'barColorPick', 'barColorsSaveFailed',
    'cacheHitToneLabel', 'cacheHitToneAccent', 'cacheHitToneSemantic',
    'cacheHitToneHint', 'cacheHitToneSaveFailed', 'settingsBack', 'settingsClose',
  ];
  for (const locale of ['en', 'zh-CN', 'zh-TW']) {
    const i18n = createDashboardI18n(locale);
    for (const k of keys) {
      assert.notEqual(i18n.t(k), k, `missing ${k} in ${locale}`);
      assert.ok(i18n.t(k).length > 0);
    }
  }

  const i18n = createDashboardI18n('zh-CN');
  let cachedColors = null;
  const colorCtrl = i18n.connectBarColors({
    initial: { speed: '#315fc4' },
    cache: v => { cachedColors = v; },
    write: async input => ({ barColors: input.barColors, revision: 1 }),
  });
  assert.deepEqual(colorCtrl.colors, { speed: '#315fc4' });
  await colorCtrl.setColor('token', '#7C3AED');
  assert.deepEqual(colorCtrl.colors, { speed: '#315fc4', token: '#7c3aed' });
  assert.deepEqual(cachedColors, { speed: '#315fc4', token: '#7c3aed' });
  await colorCtrl.setColor('speed', null);
  assert.deepEqual(colorCtrl.colors, { token: '#7c3aed' });
  await colorCtrl.reset();
  assert.deepEqual(colorCtrl.colors, {});
  colorCtrl.dispose();

  let cachedMode = null;
  const modeCtrl = i18n.connectThemeMode({
    initial: null,
    cache: v => { cachedMode = v; },
    write: async input => ({ themeMode: input.themeMode, revision: 2 }),
  });
  assert.equal(modeCtrl.value, 'auto');
  await modeCtrl.choose('light');
  assert.equal(modeCtrl.value, 'light');
  assert.equal(cachedMode, 'light');
  modeCtrl.dispose();

  let cachedTone = null;
  const toneCtrl = i18n.connectCacheHitTone({
    initial: null,
    cache: v => { cachedTone = v; },
    write: async input => ({ cacheHitTone: input.cacheHitTone, revision: 3 }),
  });
  assert.equal(toneCtrl.value, 'accent');
  await toneCtrl.choose('semantic');
  assert.equal(toneCtrl.value, 'semantic');
  assert.equal(cachedTone, 'semantic');
  toneCtrl.dispose();
});

test('theme avoids outer skin presets and inline widget keeps transparent default bar + per-item colors', async () => {
  const theme = createAgPulseTheme();
  assert.equal(theme.SKIN_PRESETS, undefined);
  assert.equal(theme.shadowCss().includes('--pulse-bar-'), false);
  assert.deepEqual(theme.BAR_COLOR_KEYS, ['speed', 'token', 'quota', 'context']);
  assert.deepEqual(theme.normalizeBarColors({ speed: '#7C3AED', token: 'bad', extra: '#000000' }), { speed: '#7c3aed' });
  assert.equal(theme.normalizeThemeMode('light'), 'light');
  assert.equal(theme.normalizeThemeMode('bogus'), 'auto');

  const widgetSrc = await readFile(new URL('../../../compat/inline-widget.cjs', import.meta.url), 'utf8');
  assert.ok(widgetSrc.includes('.cache-hit[data-tone=high]{color:var(--pulse-accent)}'));
  assert.ok(widgetSrc.includes(':host([data-cache-hit-tone=semantic]) .cache-hit[data-tone=high]{color:var(--pulse-success,var(--pulse-accent))}'));
  assert.ok(widgetSrc.includes('--pulse-bar-speed'));
  assert.ok(widgetSrc.includes('--pulse-bar-token'));
  assert.ok(widgetSrc.includes('--pulse-bar-quota'));
  assert.ok(widgetSrc.includes('--pulse-bar-context'));
  assert.equal(widgetSrc.includes('data-pulse-bar-skinned'), false);
  assert.equal(widgetSrc.includes('SKIN_PRESETS'), false);
  assert.ok(widgetSrc.includes("settingsDialog.id='pulse-settings-dialog'"));
  assert.ok(widgetSrc.includes("aria-modal','false'"));
  assert.equal(widgetSrc.includes('.showModal('), false);
  assert.equal(widgetSrc.includes('quota-settings-toggle'), false);
  assert.ok(widgetSrc.includes("settingsToggleBtn.id='pulse-settings-toggle'"));
  assert.ok(widgetSrc.includes(':host([data-pulse-theme="light"]) .settings-dialog'));
});
