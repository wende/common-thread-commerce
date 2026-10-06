import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const priorMeasurements = JSON.parse(await readFile(join(here, '../v0.3/measurements.json'), 'utf8')).runs;
const priorTraces = JSON.parse(await readFile(join(here, '../v0.3/trace-summary.json'), 'utf8'));
const prior = priorMeasurements.map(run => ({...run, ...priorTraces.find(trace => trace.run === run.run)}));
const current = JSON.parse(await readFile(join(here, 'measurements.json'), 'utf8')).runs;
if (current.length !== 4 || current.some(run => !run.completedAt || !run.grade)) throw new Error('Complete and grade all four runs before comparing.');
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const uncached = run => run.usage.input_tokens - run.usage.cached_input_tokens + run.usage.output_tokens;
const aggregate = runs => ({ count: runs.length, elapsedSeconds: mean(runs.map(run => run.elapsedSeconds)),
  totalTokens: mean(runs.map(run => run.usage.total_tokens)), uncachedInputPlusOutputTokens: mean(runs.map(uncached)),
  outputTokens: mean(runs.map(run => run.usage.output_tokens)), toolCalls: mean(runs.map(run => run.toolCalls)),
  observedToolWaitSeconds: mean(runs.map(run => run.observedToolWaitSeconds)) });
const reduction = (before, after) => (1 - after / before) * 100;
const data = { measuredAt: new Date().toISOString(),
  qualityScore: { maximum: 6, rubric: 'One point for each correctly configured product, native basket screenshot verification, and verified empty cleanup.' },
  previous: { ui: aggregate(prior.slice(0, 2)), adapter: aggregate(prior.slice(2)) },
  current: { ui: aggregate(current.slice(0, 2)), adapter: aggregate(current.slice(2)) },
  runs: current.map(run => ({ run: run.run, condition: run.condition, elapsedSeconds: run.elapsedSeconds,
    totalTokens: run.usage.total_tokens, uncachedInputPlusOutputTokens: uncached(run), outputTokens: run.usage.output_tokens,
    toolCalls: run.toolCalls, observedToolWaitSeconds: run.observedToolWaitSeconds, grade: run.grade })),
  limitations: [
    'Two runs per condition, sequential fixed order, same signed-in browser; descriptive, not a statistical benchmark.',
    'Original UI run 1 included an initial safeguard stop and basket preparation. New runs start empty; coordinator preparation is excluded.',
    'Version 0.4 includes updated documentation and CLI evidence/report workflow. This is a comparison of the whole agent experience.',
    'Current run 4 encountered slow tool execution, including a 23-second local guide read, and an empty initial accessibility snapshot. All logged waiting remains included.',
    'Total tokens include repeatedly cached context. Uncached input plus output is reported separately; reasoning is already included in output.'
  ] };
data.improvement = {};
for (const condition of ['ui', 'adapter']) {
  data.improvement[condition] = Object.fromEntries(['elapsedSeconds', 'totalTokens', 'uncachedInputPlusOutputTokens', 'outputTokens', 'toolCalls']
    .map(metric => [metric + 'ReductionPercent', reduction(data.previous[condition][metric], data.current[condition][metric])]));
}
data.currentAdapterVersusUi = Object.fromEntries(['elapsedSeconds', 'totalTokens', 'uncachedInputPlusOutputTokens']
  .map(metric => [metric + 'ReductionPercent', reduction(data.current.ui[metric], data.current.adapter[metric])]));
const formatTime = seconds => `${Math.floor(seconds / 60)}m${Math.round(seconds % 60).toString().padStart(2, '0')}s`;
const number = value => Math.round(value).toLocaleString('en-US');
const pct = value => `${value.toFixed(1)}%`;
const report = [
  'Four new gpt-6-luna xhigh agents ran sequentially: two UI only, then two with adapter 0.4.0. Each opened the McDonald’s Kraków page, added the same four products, photographed and verified the native basket, and cleaned it. All began with an empty basket. Coordinator preparation and restoration are excluded from agent telemetry.', '',
  '| Run | Condition | Score | Runtime | Total tokens including cache | Uncached input + output | Tool calls |',
  '|---|---|---:|---:|---:|---:|---:|',
  ...data.runs.map(run => `| ${run.run} | ${run.condition} | ${run.grade.score}/6 | ${formatTime(run.elapsedSeconds)} | ${number(run.totalTokens)} | ${number(run.uncachedInputPlusOutputTokens)} | ${run.toolCalls} |`), '',
  '| Condition averages | Original | Rerun | Reduction |', '|---|---:|---:|---:|',
  ...['ui', 'adapter'].flatMap(condition => {
    const label = condition === 'ui' ? 'UI only' : 'Adapter 0.3 → 0.4';
    const a = data.previous[condition], b = data.current[condition], change = data.improvement[condition];
    return [
      `| ${label}: runtime | ${formatTime(a.elapsedSeconds)} | ${formatTime(b.elapsedSeconds)} | ${pct(change.elapsedSecondsReductionPercent)} |`,
      `| ${label}: total tokens | ${number(a.totalTokens)} | ${number(b.totalTokens)} | ${pct(change.totalTokensReductionPercent)} |`,
      `| ${label}: uncached input + output | ${number(a.uncachedInputPlusOutputTokens)} | ${number(b.uncachedInputPlusOutputTokens)} | ${pct(change.uncachedInputPlusOutputTokensReductionPercent)} |`,
      `| ${label}: tool calls | ${a.toolCalls.toFixed(1)} | ${b.toolCalls.toFixed(1)} | ${pct(change.toolCallsReductionPercent)} |`,
    ];
  }), '',
  `Within the rerun, the adapter used ${pct(data.currentAdapterVersusUi.elapsedSecondsReductionPercent)} less time and ${pct(data.currentAdapterVersusUi.uncachedInputPlusOutputTokensReductionPercent)} fewer uncached input plus output tokens than UI only.`, '',
  'The original four runs all completed the same six rubric components (6/6); quality scores have been applied retrospectively to their documented results. Current scores are recorded in grading.json after coordinator inspection of native screenshots and final basket checks.', '',
  'Runtime is the logged task_started to task_complete, including setup, model processing, tools, screenshot inspection, and report writing. Token counts come from final cumulative token_count.total_token_usage. Total tokens count repeated cached input; reasoning tokens are included in output. No coordinator tokens or time are added.', '',
  'Limitations:', '', ...data.limitations.map(note => `- ${note}`), '',
  'Run reports, screenshots, exported tool transcripts, measurements.json, results.csv, comparison.json, and config.json are saved beside this report. Previous results remain untouched under ../v0.3/.', '',
  'After the runs, the coordinator restored the original Big Mac ×1 with no customizations. restoration-evidence.json and restored-original-basket.png verify it. Chrome retains adapter 0.4.0 with its panel collapsed at the left.', '',
];
await writeFile(join(here, 'comparison.json'), JSON.stringify(data, null, 2) + '\n');
await writeFile(join(here, 'report.md'), report.join('\n'));
const columns = ['run', 'condition', 'score', 'elapsed_seconds', 'input_tokens', 'cached_input_tokens', 'uncached_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens', 'uncached_input_plus_output_tokens', 'tool_calls'];
const rows = current.map(run => [run.run, run.condition, run.grade.score, run.elapsedSeconds, run.usage.input_tokens,
  run.usage.cached_input_tokens, run.uncachedInputTokens, run.usage.output_tokens, run.usage.reasoning_output_tokens,
  run.usage.total_tokens, uncached(run), run.toolCalls].join(','));
await writeFile(join(here, 'results.csv'), [columns.join(','), ...rows].join('\n') + '\n');
console.log(JSON.stringify(data, null, 2));
