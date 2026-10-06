import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const date = '2026/10/05';
const parentThreadId = process.env.CODEX_THREAD_ID;
const sessions = join(homedir(), '.codex', 'sessions', date);
const order = ['glovo_ui_1', 'glovo_ui_2', 'glovo_adapter_3', 'glovo_adapter_4'];
const results = [];
for (const filename of await readdir(sessions)) {
  if (!filename.endsWith('.jsonl')) continue;
  const lines = (await readFile(join(sessions, filename), 'utf8')).trim().split('\n');
  const records = [];
  for (const line of lines) { try { records.push(JSON.parse(line)); } catch {} }
  const metadata = records.find(record => record.type === 'session_meta')?.payload;
  const spawn = metadata?.source?.subagent?.thread_spawn;
  const name = spawn?.agent_path?.split('/').at(-1);
  if (spawn?.parent_thread_id !== parentThreadId || !order.includes(name)) continue;
  const started = records.find(record => record.type === 'event_msg' && record.payload?.type === 'task_started');
  const latestStarted = records.findLast(record => record.type === 'event_msg' && record.payload?.type === 'task_started');
  const completion = records.findLast(record => record.type === 'event_msg' && ['task_complete', 'turn_aborted'].includes(record.payload?.type));
  const completed = completion && (!latestStarted || Date.parse(completion.timestamp) > Date.parse(latestStarted.timestamp)) ? completion : null;
  const usage = records.findLast(record => record.type === 'event_msg' && record.payload?.type === 'token_count' && record.payload.info)?.payload.info.total_token_usage;
  const context = records.find(record => record.type === 'turn_context')?.payload;
  const number = order.indexOf(name) + 1;
  let report;
  try { report = JSON.parse(await readFile(join(directory, `run-${number}-report.json`), 'utf8')); } catch {}
  const startTime = started?.timestamp || metadata.timestamp;
  const endTime = completed?.timestamp;
  results.push({ run: number, condition: number < 3 ? 'UI only' : 'Adapter', agentPath: spawn.agent_path, threadId: metadata.id,
    model: context?.model, reasoningEffort: context?.effort || context?.reasoning_effort,
    startedAt: startTime, completedAt: endTime || null,
    elapsedSeconds: endTime ? (Date.parse(endTime) - Date.parse(startTime)) / 1000 : null,
    usage: usage || null, uncachedInputTokens: usage ? usage.input_tokens - usage.cached_input_tokens : null,
    report: report || null,
  });
}
results.sort((a, b) => a.run - b.run);
const data = { measuredAt: new Date().toISOString(), tokenMeasurement: 'Final cumulative Codex token_count.total_token_usage for each fresh agent; input includes cached input, output includes reasoning output.',
  timeMeasurement: 'UTC task_started (session timestamp fallback) to task_complete/turn_aborted in each agent log; includes setup and report.', runs: results };
await writeFile(join(directory, 'measurements.json'), `${JSON.stringify(data, null, 2)}\n`);
console.log(JSON.stringify(data, null, 2));
