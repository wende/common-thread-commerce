import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const seconds = (a, b) => (Date.parse(b) - Date.parse(a)) / 1000;
const round = n => Number(n.toFixed(3));
const traces = await Promise.all([1, 2, 3, 4].map(async run =>
  JSON.parse(await readFile(join(here, `trace-run-${run}.json`), 'utf8'))));
const boundaries = [[7, 53, 55, 66], [11, 43, 45, 55], [5, 8, 10, 13], [6, 10, 12, 15]];
const labels = ['Setup', 'Search, configure, add, and confirm four products', 'Native basket screenshot and image inspection', 'Cleanup, empty screenshot, and image inspection', 'Report and final checks'];
const runs = [];
for (const [index, trace] of traces.entries()) {
  const { summary, calls } = trace;
  const endpoints = [summary.startedAt, ...boundaries[index].map(n => calls[n - 1].completedAt), summary.completedAt];
  const phases = labels.map((phase, i) => {
    const selected = calls.filter(c => c.completedAt > endpoints[i] && c.completedAt <= endpoints[i + 1]);
    return { phase, startedAt: endpoints[i], endedAt: endpoints[i + 1], elapsedSeconds: round(seconds(endpoints[i], endpoints[i + 1])),
      outerToolIntervalsSeconds: round(selected.reduce((s, c) => s + c.durationSeconds, 0)), callIndices: selected.map(c => c.index) };
  });
  assert.ok(Math.abs(phases.reduce((s, p) => s + p.elapsedSeconds, 0) - summary.elapsedSeconds) < 0.002);
  const run = { run: index + 1, condition: summary.condition, elapsedSeconds: summary.elapsedSeconds,
    outerToolIntervalsSeconds: round(summary.observedToolWaitSeconds),
    outsideOuterToolIntervalsSeconds: round(summary.elapsedSeconds - summary.observedToolWaitSeconds),
    phases, textOutputCharacters: summary.textOutputCharacters,
    largestOuterToolIntervals: [...calls].sort((a, b) => b.durationSeconds - a.durationSeconds).slice(0, 6)
      .map(c => ({ callIndex: c.index, durationSeconds: c.durationSeconds })),
    largestPrecedingGaps: [...calls].sort((a, b) => b.precedingGapSeconds - a.precedingGapSeconds).slice(0, 5)
      .map(c => ({ callIndex: c.index, gapSeconds: c.precedingGapSeconds })),
    sourceTranscript: `transcript-run-${index + 1}.md`, sourceTrace: `trace-run-${index + 1}.json` };
  if (index < 2) {
    const [first, last] = index === 0 ? [27, 48] : [18, 39];
    run.shakeWorkflow = { firstCall: first, lastCall: last, calls: last - first + 1,
      elapsedSeconds: round(seconds(calls[first - 1].startedAt, calls[last - 1].completedAt)),
      leadingGapSeconds: calls[first - 1].precedingGapSeconds,
      outerToolIntervalsSeconds: round(calls.slice(first - 1, last).reduce((s, c) => s + c.durationSeconds, 0)) };
  } else {
    const report = JSON.parse(await readFile(join(here, `run-${index + 1}-report.json`), 'utf8'));
    run.inPageCoreOperations = report.events.filter(e => ['searchMany', 'addMany', 'removeMany'].includes(e.operation))
      .map(e => ({ operation: e.operation, durationMs: e.durationMs, startedAt: e.startedAt, endedAt: e.endedAt, status: e.status }));
    run.inPageCoreSeconds = round(run.inPageCoreOperations.reduce((s, e) => s + e.durationMs, 0) / 1000);
    run.adapterTransport = report.transport.map(t => ({ command: t.command, method: t.method, durationMs: t.durationMs,
      startedAt: t.startedAt, endedAt: t.endedAt, status: t.status,
      stages: t.transport.map(s => ({ action: s.action, durationMs: s.durationMs, startedAt: s.startedAt, endedAt: s.endedAt })) }));
    const focus = run.adapterTransport.flatMap(t => t.stages).filter(s => s.action === 'Emulation.setFocusEmulationEnabled');
    run.focusCalls = focus.length;
    run.focusSeconds = round(focus.reduce((s, e) => s + e.durationMs, 0) / 1000);
    run.setupAndReportingPercent = round((phases[0].elapsedSeconds + phases[4].elapsedSeconds) / run.elapsedSeconds * 100);
  }
  runs.push(run);
}
const [fast, slow] = runs.slice(2);
const extraSeconds = round(slow.elapsedSeconds - fast.elapsedSeconds);
const results = { generatedAt: new Date().toISOString(), methodology: [
  'Original trace inputs and outputs are unchanged. All phase spans include the gaps between calls.',
  'Outer tool intervals are invocation-to-return intervals. Their complement includes model processing, scheduling, text generation, and any child process that continues after a yielded exec_command.',
  'The traces do not separately identify inference, reasoning, queuing, or browser network time. In-page operations and transport intervals are nested; do not add them to the outer intervals.',
  'Run 4 setup ends after the second injection returns. The earlier phase-audit cut off at the first wrapper return, assigning the reinjection to search. This shifts 12.960 seconds between phases and does not change total runtime.',
], runs, slowerAdapterRun: { extraSeconds,
  extraOuterToolIntervalsSeconds: round(slow.outerToolIntervalsSeconds - fast.outerToolIntervalsSeconds),
  extraSetupSeconds: round(slow.phases[0].elapsedSeconds - fast.phases[0].elapsedSeconds),
  extraSetupSharePercent: round((slow.phases[0].elapsedSeconds - fast.phases[0].elapsedSeconds) / extraSeconds * 100),
  firstInjectionContinuedAfterWrapperReturnSeconds: round(seconds(traces[3].calls[4].completedAt, slow.adapterTransport[0].endedAt)),
} };
assert.equal(results.slowerAdapterRun.firstInjectionContinuedAfterWrapperReturnSeconds, 8.496);
assert.equal(fast.inPageCoreOperations.length, 3);
assert.equal(slow.inPageCoreOperations.length, 3);
await writeFile(join(here, 'bottleneck-audit.json'), JSON.stringify(results, null, 2) + '\n');

const markdown = [
  'Latest Luna rerun: what took the most time', '',
  'Setup and reporting dominated the adapter workflow. The in-page search, four additions, and four removals took 4.075 seconds in run 3 and 16.733 seconds in run 4. Full sessions took 98.456 and 280.037 seconds. All four runs still scored 6/6.', '',
  '| Phase, including gaps between calls | UI run 1 | UI run 2 | Adapter run 3 | Adapter run 4 |',
  '|---|---:|---:|---:|---:|',
  ...labels.map((label, i) => `| ${label} | ${runs.map(r => `${r.phases[i].elapsedSeconds.toFixed(1)}s`).join(' | ')} |`), '',
  'For adapter run 3, setup plus reporting was 56.244 seconds (57.1% of the session); for run 4 it was 177.015 seconds (63.2%). Run 4 setup includes both injection attempts. The earlier phase-audit ended setup at the first wrapper return; this audit assigns the additional 12.960 seconds to setup, leaving totals unchanged.', '',
  'Concrete transcript findings', '',
  '1. Run 4 startup was the largest bottleneck: 145.817 seconds through the second injection return, versus 32.996 seconds in run 3. This accounts for 62.1% of the 181.581-second difference between the two adapter runs. Call 1, a local skill/guide read, took 23.360 seconds. Its following gap was 29.917 seconds. These observations show broad tool and scheduling variability; they do not establish its cause.', '',
  '2. Run 4 lost command status. Calls 4 and 5 printed only r.output and produced blank output. Injection call 5 returned at 15:16:38.140 UTC, while its CLI journal records successful completion at 15:16:46.636 UTC. The command was still executing for 8.496 seconds after the wrapper returned. Call 6 reinjected at 15:16:47.216 UTC and completed successfully with the same adapter session ID. This was a repeated successful injection, not evidence that the adapter failed. The snapshot has no equivalent journal, so its underlying outcome cannot be established from the blank stdout alone. The agent report described an empty response body, but the wrapper omitted the process metadata needed to support that diagnosis.', '',
  '3. Final reporting still took 23.248 / 31.198 seconds. In run 3, report call 14 itself took 0.267 seconds; the rest included a 7.128-second preceding gap, another 7.694-second gap, file listing/report reread call 15 (0.515 seconds), and 7.644 seconds to finish. Run 4 created a notes file, exported the report, then listed artifacts. Its actual report call took 1.800 seconds. Run 3 also queried receiptCount and evidence on the saved report, but neither field is present in its schema; receipts and artifact events hold that data. Those queried fields disappeared from the JSON output.', '',
  '4. Evidence transport now has visible overhead. Each screenshot command used ten WebBridge requests: six focus toggles, three Runtime.evaluate calls, and one screenshot. In run 4, basket evidence took 13.965 seconds at the CLI level; screenshot capture was 5.388 seconds and focus toggles 3.933 seconds. Its in-page preparation was 0.945 seconds. Empty evidence took 5.972 seconds at the CLI level, including 2.699 seconds for capture and 2.007 seconds for focus toggles. Across the adapter session, 26 focus calls took 31.987 seconds; the initial focus enable alone took 18.375 seconds. In run 3, 24 focus calls took only 0.518 seconds. These intervals are nested, not additive to full-session runtime.', '',
  '5. Some agent round trips remain avoidable. Run 3 call 6 combined search and initial basket read; run 4 calls 7 and 8 performed them separately. Both then wrote a product-ID input file in another call before adding. In run 3, 10.950 seconds elapsed between the search/baseline response and the start of the add call; in run 4 the corresponding span was 26.695 seconds, including its separate baseline read. Run 3 also consumed 16,037 characters of documentation and 19,831 characters of accessibility snapshot: together 74.3% of its 48,264 characters of tool text. This is a context-volume observation, not a causal latency measurement.', '',
  '6. UI-only interaction was dominated by locating and configuring the shake. Run 1 calls 27–48 covered 212.967 seconds from first call to final response, plus a 23.180-second leading gap. Run 2 calls 18–39 covered 255.171 seconds, plus a 28.049-second leading gap. Each range had 22 calls, with only 4.506 / 3.858 seconds inside returned tool intervals. They repeatedly tried accessibility filters, inspected DOM ancestors and screenshots, selected size/cup, then confirmed the basket. The full four-product addition phases took 422.174 / 420.825 seconds. UI run 1 additionally retried McDouble, briefly reaching quantity two before correcting it to one.', '',
  '| Whole session | Returned tool intervals | Outside those intervals |',
  '|---|---:|---:|',
  ...runs.map(r => `| Run ${r.run} | ${r.outerToolIntervalsSeconds.toFixed(1)}s | ${r.outsideOuterToolIntervalsSeconds.toFixed(1)}s |`), '',
  'The outside-interval column is not a measurement of pure model reasoning. It includes model processing, scheduling, output generation, and any still-running child command. Run 4 injection is a demonstrated example of the last category. The trace cannot identify the exact causes of every gap.', '',
  'Next improvements, in priority order', '',
  '1. Preserve exec_command metadata and resume any returned session_id with write_stdin; never treat blank stdout as completion or an instruction to retry. Put this pattern in the agent guide or provide an execution helper. Injection was safe to repeat here, but repeating a cart mutation could be incorrect.',
  '2. Add one documented bootstrap command that selects/navigates the existing tab, awaits readiness, injects, and returns a compact version/store/baseline summary. It should remove the full-page snapshot and separate help/tab-selection turns while retaining required skill use.',
  '3. Let batch search produce a saved, validated addition plan with explicit choices, together with the fresh baseline. Stop on ambiguity or missing choices. The agent can review the result and pass the plan directly to addMany, avoiding manual product-ID transcription and a separate file-write turn. These runs show no remaining fuzzy-search problem: all four queries matched in one search.',
  '4. Hold a single focus scope across the evidence operation, restore it in finally, combine state read with preparation, and combine artifact recording with panel restoration. For the hidden-panel path observed here, that would reduce ten transport requests to five. Keep screenshot inspection before cleanup. Optionally have add/cleanup commands capture their own evidence to remove another agent turn.',
  '5. Return a final verification summary from report: saved artifact paths and existence, consumed receipts, final basket, and native evidence matches. Offer inline notes. This would remove the notes-file/list/reparse turns while preserving the checks, and fix the saved-report/CLI-summary field confusion.', '',
  'These are proposed changes, not measured savings or new implementation. The general tool slowdown in run 4 would not disappear through adapter changes alone. Two adapter sessions are enough to identify concrete workflow costs, but not to estimate stable latency.', '',
  'Source files: transcript-run-1.md through transcript-run-4.md, their trace JSON files, and run-3-report.json / run-4-report.json. bottleneck-audit.json contains exact boundaries, call indices, and compact transport timings. This audit does not modify the adapter or any original benchmark evidence.', '',
];
await writeFile(join(here, 'bottleneck-audit.md'), markdown.join('\n'));
console.log(JSON.stringify({runs: runs.map(r => ({run: r.run, elapsedSeconds: r.elapsedSeconds, phases: r.phases.map(p => p.elapsedSeconds)})), slowerAdapterRun: results.slowerAdapterRun}));
