import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const original = JSON.parse(await readFile(join(here, '../v0.3/audit-details.json'), 'utf8'));
const summaries = [];
const seconds = (start, end) => (Date.parse(end) - Date.parse(start)) / 1000;
for (const run of [3, 4]) {
  const { summary, calls } = JSON.parse(await readFile(join(here, `trace-run-${run}.json`), 'utf8'));
  const find = term => calls.find(call => call.input.includes(term));
  const injection = find('bridge.mjs inject');
  const search = find('call searchMany'), add = find('call addMany'), cleanup = find('bridge.mjs cleanup');
  const basketImage = calls.find(call => call.input.includes('view_image') && call.input.includes(`run-${run}-adapter-basket.png`));
  const emptyImage = calls.find(call => call.input.includes('view_image') && call.input.includes(`run-${run}-adapter-empty.png`));
  assert.ok(injection && search && add && cleanup && basketImage && emptyImage);
  const endpoints = [summary.startedAt, injection.completedAt, add.completedAt, basketImage.completedAt, emptyImage.completedAt, summary.completedAt];
  const labels = ['Setup through injection', 'Search and batch addition', 'Native basket evidence and image inspection', 'Receipt cleanup and empty basket image inspection', 'Report and final checks'];
  const phases = labels.map((phase, index) => {
    const start = endpoints[index], end = endpoints[index + 1];
    const phaseCalls = calls.filter(call => call.completedAt > start && call.completedAt <= end);
    return { phase, startUtc: start, endUtc: end, elapsedSeconds: seconds(start, end),
      observedToolWaitSeconds: phaseCalls.reduce((sum, call) => sum + (call.durationSeconds || 0), 0),
      callIndices: phaseCalls.map(call => call.index) };
  });
  assert.ok(Math.abs(phases.reduce((sum, phase) => sum + phase.elapsedSeconds, 0) - summary.elapsedSeconds) < 0.001);
  const operations = Object.fromEntries([['searchMany', search], ['addMany', add], ['receiptCleanup', cleanup]].map(([name, call]) => [name, {
    callIndex: call.index, outerToolIntervalSeconds: call.durationSeconds, input: call.input,
  }]));
  const prior = original.find(item => item.run === run);
  summaries.push({ run, elapsedSeconds: summary.elapsedSeconds, toolCalls: summary.toolCalls,
    observedToolWaitSeconds: summary.observedToolWaitSeconds, phases, operations,
    comparison: { priorAdapterToolCalls: run === 3 ? 38 : 39,
      priorNativeBasketEvidenceSeconds: prior.phases[2].elapsedSeconds,
      currentNativeBasketEvidenceSeconds: phases[2].elapsedSeconds,
      priorFinalChecksAndReportSeconds: prior.phases[4].elapsedSeconds,
      currentFinalChecksAndReportSeconds: phases[4].elapsedSeconds },
    sourceTranscript: `transcript-run-${run}.md` });
}
await writeFile(join(here, 'phase-audit.json'), JSON.stringify(summaries, null, 2) + '\n');
const markdown = ['Exact adapter transcript comparison', '',
  'Both current agents issued one searchMany call, one addMany call, and one receipt cleanup call. They used the evidence command for both native screenshots and the CLI report exporter. Neither read panel.js or adapter.js. The original agents issued four separate additions and four removals, inspected panel source to close the overlay, and constructed report JSON manually.', '',
  '| Run | Tool calls, old → new | Native basket evidence + image inspection, old → new | Final checks/report, old → new |',
  '|---|---:|---:|---:|',
  ...summaries.map(item => `| ${item.run} | ${item.comparison.priorAdapterToolCalls} → ${item.toolCalls} | ${item.comparison.priorNativeBasketEvidenceSeconds.toFixed(1)}s → ${item.comparison.currentNativeBasketEvidenceSeconds.toFixed(1)}s | ${item.comparison.priorFinalChecksAndReportSeconds.toFixed(1)}s → ${item.comparison.currentFinalChecksAndReportSeconds.toFixed(1)}s |`), '',
  'The phase boundaries match the observable workflow steps: addition completes, basket screenshot is inspected, cleanup and empty screenshot are inspected, then final reporting. Setup differs slightly because the new agents validate their initial basket alongside batch search. All phases include inter-call gaps.', '',
  'Run 4 retained slow execution intervals. Its observed tool wait was ' + summaries[1].observedToolWaitSeconds.toFixed(1) + ' seconds, versus ' + summaries[0].observedToolWaitSeconds.toFixed(1) + ' seconds in run 3. This includes its 23-second local documentation read. No waiting has been removed from the headline results.', '',
  'Full inputs, outputs, UTC timestamps, and call indices are in transcript-run-3.md, transcript-run-4.md, trace-run-3.json, trace-run-4.json, and phase-audit.json. Internal reasoning and image payloads are omitted.', '',
];
await writeFile(join(here, 'phase-audit.md'), markdown.join('\n'));
console.log(JSON.stringify(summaries.map(({run,comparison})=>({run,comparison})), null, 2));
