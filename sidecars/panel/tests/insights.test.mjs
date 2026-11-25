import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  shardIndexForSession,
  parseTranscriptSummaryStream,
  buildInsightsOverview,
  InsightsScanner,
} from '../insights.mjs';

const ID1 = 'aaaaaaaa-1111-2222-3333-444444444444';
const ID2 = 'bbbbbbbb-1111-2222-3333-444444444444';

test('shardIndexForSession deterministically maps IDs into 64 shards', () => {
  const s1 = shardIndexForSession(ID1);
  const s2 = shardIndexForSession(ID1.toUpperCase());
  assert.equal(s1, s2);
  assert.ok(Number.isInteger(s1) && s1 >= 0 && s1 < 64);
});

test('parseTranscriptSummaryStream discards large bodies while extracting tokens, skills, tools, commands and project', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-insights-stream-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'transcript.jsonl');
  const huge = 'X'.repeat(512 * 1024);
  const lines = [
    JSON.stringify({ step_index: 0, type: 'USER_INPUT', created_at: '2026-11-21T08:00:00Z', content: 'prompt ' + huge }),
    JSON.stringify({
      step_index: 1,
      type: 'PLANNER_RESPONSE',
      created_at: '2026-11-21T08:00:05Z',
      model: 'gemini-4-hydrogen-high',
      input_tokens: 2000,
      cache_read_tokens: 8000,
      output_tokens: 500,
      content: 'answer',
      thinking: 'thought',
      tool_calls: [
        { name: 'read_file', args: { Path: '"/Users/mac/.gemini/config/skills/tabbit/SKILL.md"' } },
        { name: 'run_command', args: { CommandLine: 'git status', cwd: '/Users/mac/Code/agy-context-dashboard' } },
      ],
    }),
  ].join('\n') + '\n';
  await writeFile(file, lines);

  const summary = await parseTranscriptSummaryStream(file, ID1);
  assert.equal(summary.rounds, 1);
  assert.equal(summary.modelCalls, 1);
  assert.equal(summary.toolCalls, 2);
  assert.equal(summary.activeMs, 5000);
  assert.equal(summary.tokens.uncached, 2000);
  assert.equal(summary.tokens.cacheRead, 8000);
  assert.equal(summary.tokens.output, 500);
  assert.equal(summary.tokens.total, 10500);
  assert.equal(summary.lastContextTokens, 10000);
  assert.equal(summary.project, 'agy-context-dashboard');
  assert.deepEqual(summary.skills, { tabbit: 1 });
  assert.deepEqual(summary.tools, { read_file: 1, run_command: 1 });
  assert.deepEqual(summary.commands, { git: 1 });
  assert.equal(JSON.stringify(summary).includes('XXXX'), false);
});

test('InsightsScanner uses 64-shard incremental cache and builds filtered/sorted overview', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ag-insights-scan-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const brainRoot = join(root, 'brain');
  const cacheDir = join(root, 'cache');

  await mkdir(join(brainRoot, ID1, '.system_generated', 'logs'), { recursive: true });
  await mkdir(join(brainRoot, ID2, '.system_generated', 'logs'), { recursive: true });
  await writeFile(join(brainRoot, ID1, '.system_generated', 'logs', 'transcript.jsonl'),
    JSON.stringify({ step_index: 0, type: 'USER_INPUT', created_at: '2026-11-21T08:00:00Z', content: 'hi' }) + '\n' +
    JSON.stringify({ step_index: 1, type: 'PLANNER_RESPONSE', created_at: '2026-11-21T08:00:10Z', model: 'claude-sonnet-4-6', input_tokens: 1000, cache_read_tokens: 3000, output_tokens: 200 }) + '\n');
  await writeFile(join(brainRoot, ID2, '.system_generated', 'logs', 'transcript.jsonl'),
    JSON.stringify({ step_index: 0, type: 'USER_INPUT', created_at: '2026-11-20T08:00:00Z', content: 'hi' }) + '\n' +
    JSON.stringify({ step_index: 1, type: 'PLANNER_RESPONSE', created_at: '2026-11-20T08:00:10Z', model: 'Unknown', input_tokens: 500, cache_read_tokens: 500, output_tokens: 100 }) + '\n');

  const scanner1 = new InsightsScanner({ brainRoot, cacheDir, useWorker: true });
  const ov1 = await scanner1.overview({
    liveSummaries: { [ID1]: { summary: 'Live Chat', status: 'CASCADE_RUN_STATUS_IDLE', lastModifiedTime: '2026-11-21T08:00:10Z', stepCount: 2 } },
    accountCredits: { planName: 'Pro', availablePromptCredits: 500, availableFlowCredits: 100 },
  });
  assert.equal(ov1.cacheInfo.parsedNow, 2);
  assert.equal(ov1.cacheInfo.cacheHits, 0);
  assert.equal(ov1.kpis.totalSessions, 2);
  assert.equal(ov1.kpis.activeSessions, 1);
  assert.equal(ov1.kpis.archivedSessions, 1);
  assert.equal(ov1.kpis.pricedSessions, 1);
  assert.equal(ov1.kpis.totalSessionsForPricing, 2);
  assert.equal(ov1.last7Days.length, 7);
  assert.equal(ov1.heatmap.length, 112);
  assert.deepEqual(ov1.sessions[0].activeDates, ['2026-11-21']);
  assert.deepEqual(ov1.sessions[1].activeDates, ['2026-11-20']);

  const scanner2 = new InsightsScanner({ brainRoot, cacheDir, useWorker: false });
  const ov2 = await scanner2.overview({
    liveSummaries: { [ID1]: { summary: 'Live Chat', status: 'CASCADE_RUN_STATUS_IDLE', lastModifiedTime: '2026-11-21T08:00:10Z', stepCount: 2 } },
    status: 'archived',
    sort: 'tokens',
  });
  assert.equal(ov2.cacheInfo.parsedNow, 0);
  assert.equal(ov2.cacheInfo.cacheHits, 2);
  assert.equal(ov2.sessions.length, 1);
  assert.equal(ov2.sessions[0].id, ID2);
  assert.equal(ov2.sessions[0].estimatedCostUsd, null);

  const direct = buildInsightsOverview([], {});
  assert.equal(direct.kpis.totalSessions, 0);
  assert.equal(direct.kpis.estimatedCostUsd, null);
});

test('parseTranscriptSummaryStream resolves .worktrees paths cleanly without creating a .worktrees project bucket', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ag-insights-wt-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'transcript.jsonl');
  await writeFile(file, [
    JSON.stringify({
      step_index: 0,
      type: 'PLANNER_RESPONSE',
      created_at: '2026-11-21T08:00:00Z',
      tool_calls: [
        { name: 'read_file', args: { Path: '/Users/mac/Code/.worktrees/scratch/a.js' } },
        { name: 'run_command', args: { CommandLine: 'npm test', cwd: '/Users/mac/Code/demo-repo/.worktrees/feat-x' } },
      ],
    }),
  ].join('\n') + '\n');
  const summary = await parseTranscriptSummaryStream(file, ID1);
  assert.equal(summary.project, 'demo-repo');
});

test('buildInsightsOverview applies date filter before 200-session truncation and aligns activeDates with log days', () => {
  const summaries = [];
  for (let i = 0; i < 204; i++) {
    const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
    summaries.push({
      id,
      project: 'demo-repo',
      lastAt: `2026-11-22T0${i % 9}:00:00Z`,
      firstAt: `2026-11-22T0${i % 9}:00:00Z`,
      rounds: 1,
      steps: 1,
      totalTokens: 1000,
      days: { '2026-11-22': { sessions: 1, totalTokens: 1000 } },
    });
  }
  // Session #205 on older date + UTC boundary session whose modifiedAt is Nov 1 UTC (= Nov 2 Asia/Shanghai)
  const oldId = '00000000-0000-4000-8000-999999999999';
  summaries.push({
    id: oldId,
    project: 'old-proj',
    lastAt: '2026-10-01T12:00:00Z',
    firstAt: '2026-10-01T12:00:00Z',
    rounds: 1,
    steps: 1,
    totalTokens: 500,
    days: { '2026-10-01': { sessions: 1, totalTokens: 500 } },
  });
  const tzId = '00000000-0000-4000-8000-888888888888';
  summaries.push({
    id: tzId,
    project: 'tz-proj',
    lastAt: '2026-11-01T17:00:00Z',
    firstAt: '2026-11-01T17:00:00Z',
    rounds: 1,
    steps: 1,
    totalTokens: 700,
    days: { '2026-11-02': { sessions: 1, totalTokens: 700 } },
  });

  const unfiltered = buildInsightsOverview(summaries, { now: Date.parse('2026-11-22T12:00:00Z') });
  assert.equal(unfiltered.kpis.totalSessions, 206);
  assert.equal(unfiltered.totalMatchingSessions, 206);
  assert.equal(unfiltered.sessions.length, 200);

  const filteredOld = buildInsightsOverview(summaries, { now: Date.parse('2026-11-22T12:00:00Z'), date: '2026-10-01' });
  assert.equal(filteredOld.kpis.totalSessions, 206);
  assert.equal(filteredOld.totalMatchingSessions, 1);
  assert.equal(filteredOld.sessions.length, 1);
  assert.equal(filteredOld.sessions[0].id, oldId);

  const filteredNov01 = buildInsightsOverview(summaries, { now: Date.parse('2026-11-22T12:00:00Z'), date: '2026-11-01' });
  assert.equal(filteredNov01.totalMatchingSessions, 0);
  const filteredNov02 = buildInsightsOverview(summaries, { now: Date.parse('2026-11-22T12:00:00Z'), date: '2026-11-02' });
  assert.equal(filteredNov02.sessions[0].id, tzId);
  assert.deepEqual(filteredNov02.sessions[0].activeDates, ['2026-11-02']);
});
