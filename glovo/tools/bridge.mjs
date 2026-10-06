#!/usr/bin/env node
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, methods } from './bridge-client.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const journalPath = resolve(directory, '../reports/transport.jsonl');
const argv = process.argv.slice(2);
function flag(name, fallback) {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value.`);
  argv.splice(index, 2); return value;
}
const save = flag('--save'), inputFile = flag('--input-file'), panelMode = flag('--panel', 'visible'), dock = flag('--dock', 'left');
const [command, ...args] = argv;
const help = `Glovo adapter 0.4.2 — existing glovo-webmcp Chrome session
  inject --panel hidden|visible|collapsed --dock left|right
  call <method> [JSON] [--input-file file.json] [--save result.json]
  evidence basket.png [--save evidence.json]
  cleanup additions.json [--save cleanup.json]
  report report.json [--input-file notes.json]
  schema | eval script.js | snapshot | screenshot image.png
Methods: ${methods.join(', ')}
All calls append mechanical results/timings to glovo/reports/transport.jsonl.
See glovo/AGENT.md for a short batch-shopping example.`;
async function writeJson(path, value) {
  const absolute = resolve(path); await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`); return absolute;
}
if (!command || ['help', '--help', '-h'].includes(command)) {
  console.log(help);
} else {
  const client = createClient(), startedAt = new Date().toISOString(), start = performance.now();
  let value, callInput, error;
  try {
    switch (command) {
      case 'inject':
        if (!['visible', 'hidden', 'collapsed'].includes(panelMode) || !['left', 'right'].includes(dock)) throw new Error('Invalid panel mode or dock.');
        value = await client.inject({ panel: panelMode, dock }); break;
      case 'call':
        callInput = inputFile ? JSON.parse(await readFile(resolve(inputFile), 'utf8')) : args[1] === undefined ? undefined : JSON.parse(args[1]);
        value = await client.call(args[0], callInput); break;
      case 'schema': value = await client.call('describe'); break;
      case 'eval': value = await client.runtime(await readFile(resolve(args[0]), 'utf8')); break;
      case 'snapshot': value = await client.send('snapshot', {}); break;
      case 'screenshot': value = await client.send('screenshot', args[0] ? { path: resolve(args[0]) } : {}); break;
      case 'evidence': {
        if (!args[0]) throw new Error('evidence needs an image path.');
        value = await client.evidence(resolve(args[0]));
        value.evidencePath = await writeJson(save || `${args[0]}.json`, value); break;
      }
      case 'cleanup': {
        const addition = JSON.parse(await readFile(resolve(args[0]), 'utf8'));
        if (addition.status !== 'complete') throw new Error('The addition has an unknown/partial outcome. Read the basket and reconcile it before cleanup.');
        const receiptIds = addition.results.filter(result => result.status === 'added').map(result => result.receiptId);
        value = await client.call('removeMany', { receiptIds }); break;
      }
      case 'report': {
        const notes = inputFile ? JSON.parse(await readFile(resolve(inputFile), 'utf8')) : [];
        value = await client.call('getReport', { refresh: true, notes });
        let transports = [];
        try { transports = (await readFile(journalPath, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(entry => entry.sessionId === value.sessionId); }
        catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
        value.transport = [...transports, { sessionId: client.sessionId, command: 'report', startedAt,
          endedAt: new Date().toISOString(), durationMs: performance.now() - start, transport: client.transport, status: 'complete' }];
        const path = await writeJson(args[0] || save || resolve(directory, `../reports/${value.sessionId}.json`), value);
        value = { path, eventCount: value.events.length, receiptCount: value.receipts.length, mutationPending: value.mutationPending, finalBasket: value.finalBasket }; break;
      }
      default: throw new Error(help);
    }
    if (save && !['evidence', 'report'].includes(command)) await writeJson(save, value);
  } catch (failure) { error = failure; }
  const entry = { sessionId: client.sessionId, command, method: command === 'call' ? args[0] : undefined,
    startedAt, endedAt: new Date().toISOString(), durationMs: performance.now() - start, transport: client.transport,
    status: error ? 'error' : value?.status || 'complete', error: error?.message };
  // Persist public store summaries, not arbitrary eval code/results, raw snapshots, or global basket data.
  if (command === 'call' && !['getCart', 'getOperationLog', 'getReport', 'suggest'].includes(args[0])) { entry.input = callInput; entry.result = error?.result || value; }
  if (command === 'evidence') entry.result = value;
  await mkdir(dirname(journalPath), { recursive: true });
  await appendFile(journalPath, `${JSON.stringify(entry)}\n`);
  if (error) {
    console.error(JSON.stringify({ error: error.message, code: error.code, result: error.result, journalPath })); process.exitCode = 1;
  } else {
    console.log(JSON.stringify(value));
    if (['unknown', 'partial'].includes(value?.status)) process.exitCode = 2;
  }
}
