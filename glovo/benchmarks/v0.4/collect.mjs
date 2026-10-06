import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(join(directory, 'config.json'), 'utf8'));
const sessions = join(homedir(), '.codex/sessions', config.date.replaceAll('-', '/'));
const results = [];
const seconds = (start, end) => (Date.parse(end) - Date.parse(start)) / 1000;
const textOutput = output => typeof output === 'string' ? output : Array.isArray(output)
  ? output.filter(item => typeof item.text === 'string').map(item => item.text).join('\n') : '';
let grades = {};
try { grades = JSON.parse(await readFile(join(directory, 'grading.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }

for (const filename of await readdir(sessions)) {
  if (!filename.endsWith('.jsonl')) continue;
  const records = (await readFile(join(sessions, filename), 'utf8')).trim().split('\n').flatMap(raw => {
    try { return [JSON.parse(raw)]; } catch { return []; }
  });
  const meta = records.find(record => record.type === 'session_meta')?.payload;
  const spawn = meta?.source?.subagent?.thread_spawn;
  const definition = config.runs.find(run => spawn?.agent_path?.split('/').at(-1) === run.name);
  if (spawn?.parent_thread_id !== config.parentThreadId || !definition) continue;
  const started = records.find(record => record.type === 'event_msg' && record.payload?.type === 'task_started');
  const latestStart = records.findLast(record => record.type === 'event_msg' && record.payload?.type === 'task_started');
  const completion = records.findLast(record => record.type === 'event_msg' && ['task_complete', 'turn_aborted'].includes(record.payload?.type));
  const finished = completion && (!latestStart || Date.parse(completion.timestamp) > Date.parse(latestStart.timestamp)) ? completion : null;
  const usage = records.findLast(record => record.type === 'event_msg' && record.payload?.type === 'token_count' && record.payload.info)?.payload.info.total_token_usage;
  const context = records.find(record => record.type === 'turn_context')?.payload;
  const startedAt = started?.timestamp || meta.timestamp, completedAt = finished?.timestamp || null;
  const outputs = new Map(records.filter(record => record.type === 'response_item' && ['custom_tool_call_output', 'function_call_output'].includes(record.payload?.type))
    .map(record => [record.payload.call_id, record]));
  let previous = startedAt;
  const calls = records.filter(record => record.type === 'response_item' && ['custom_tool_call', 'function_call'].includes(record.payload?.type)).map((record, index) => {
    const output = outputs.get(record.payload.call_id), endedAt = output?.timestamp;
    const call = { index: index + 1, tool: [record.payload.namespace, record.payload.name].filter(Boolean).join('.'),
      startedAt: record.timestamp, completedAt: endedAt || null, durationSeconds: endedAt ? seconds(record.timestamp, endedAt) : null,
      precedingGapSeconds: seconds(previous, record.timestamp),
      input: record.payload.input || (record.payload.namespace === 'collaboration' ? '[coordination arguments omitted]' : record.payload.arguments || ''),
      output: textOutput(output?.payload.output) };
    if (endedAt) previous = endedAt;
    return call;
  });
  const comment = records.findLast(record => record.type === 'response_item' && record.payload?.role === 'assistant'
    && ['commentary', 'final'].includes(record.payload.channel));
  let report = null;
  try { report = JSON.parse(await readFile(join(directory, `run-${definition.run}-report.json`), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const result = { ...definition, agentPath: spawn.agent_path, threadId: meta.id, logPath: join(sessions, filename),
    model: context?.model, reasoningEffort: context?.effort || context?.reasoning_effort,
    startedAt, completedAt, completionType: finished?.payload.type || null,
    elapsedSeconds: completedAt ? seconds(startedAt, completedAt) : null,
    usage: usage || null, uncachedInputTokens: usage ? usage.input_tokens - usage.cached_input_tokens : null,
    uncachedInputPlusOutputTokens: usage ? usage.input_tokens - usage.cached_input_tokens + usage.output_tokens : null,
    toolCalls: calls.length, observedToolWaitSeconds: calls.reduce((sum, call) => sum + (call.durationSeconds || 0), 0),
    modelResponses: records.filter(record => record.type === 'token_usage_record').length,
    textOutputCharacters: calls.reduce((sum, call) => sum + call.output.length, 0),
    latestCommentary: comment ? textOutput(comment.payload.content).slice(0, 700) : null,
    grade: grades[definition.run] || null, report };
  results.push(result);
  await writeFile(join(directory, `trace-run-${definition.run}.json`), JSON.stringify({ summary: { ...result, report: undefined }, calls }, null, 2) + '\n');
  if (completedAt) {
    const transcript = [`Observable tool transcript, v0.4 benchmark run ${definition.run}`, '', `Source: [${filename}](${result.logPath})`, '',
      'Tool inputs and text outputs only; internal reasoning and image payloads are omitted.', ''];
    for (const call of calls) transcript.push(`### Call ${call.index}: ${call.tool}`, '',
      `UTC ${call.startedAt} → ${call.completedAt}; duration ${call.durationSeconds?.toFixed(3)}s; preceding gap ${call.precedingGapSeconds.toFixed(3)}s.`, '',
      'Input:', '````javascript', call.input, '````', '', 'Output:', '````text', call.output, '````', '');
    await writeFile(join(directory, `transcript-run-${definition.run}.md`), transcript.join('\n'));
  }
}
results.sort((a, b) => a.run - b.run);
await writeFile(join(directory, 'measurements.json'), JSON.stringify({ measuredAt: new Date().toISOString(),
  tokenMeasurement: 'Final cumulative token_count.total_token_usage; cached input included, reasoning already included in output.',
  timeMeasurement: 'Logged task_started to final task_complete/turn_aborted; coordinator activity excluded.', runs: results }, null, 2) + '\n');
console.log(JSON.stringify(results.map(({ run, condition, completedAt, elapsedSeconds, usage, uncachedInputPlusOutputTokens, toolCalls, grade }) =>
  ({ run, condition, completedAt, elapsedSeconds, totalTokens: usage?.total_tokens, uncachedInputPlusOutputTokens, toolCalls, score: grade?.score ?? null })), null, 2));
