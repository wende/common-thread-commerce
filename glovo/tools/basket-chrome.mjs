import { readFile, writeFile, rename, mkdir, unlink, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { constructBasket, createJevClient, normalizeItems } from './basket-constructor.mjs';
import { createBrowserCatalog } from './browser-catalog.mjs';
import { menuProducts, selectProducts, profileHeaders, PUBLIC_PROFILE_HEADERS } from './http-basket.mjs';
import { browserCart } from './chrome-cart.mjs';
import { openChrome, evaluate } from './chrome-driver.mjs';

const DEFAULT_URL = 'https://glovoapp.com/en/pl/krakow/stores/biedronka-express-kra';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function takeEnvironmentKey(env = process.env) {
  const key = env.OPENROUTER_API_KEY?.trim();
  delete env.OPENROUTER_API_KEY; // Keep it out of Chrome's inherited environment.
  return key || undefined;
}

export function publicRequestProfile(request) {
  if (new URL(request.url).origin !== 'https://api.glovoapp.com') return null;
  const headers = Object.fromEntries(Object.entries(request.headers || {}).map(([key, value]) => [key.toLowerCase(), value])
    .filter(([key, value]) => PUBLIC_PROFILE_HEADERS.includes(key) && typeof value === 'string'));
  try { return { headers: profileHeaders({ headers }) }; } catch { return null; }
}

export function validateStoreUrl(raw) {
  const url = new URL(raw);
  if (url.origin !== 'https://glovoapp.com' || url.username || url.password || url.hash || url.search ||
      !/^\/[a-z]{2}\/[a-z]{2}\/[a-z-]+\/stores\/[a-z0-9-]+\/?$/.test(url.pathname))
    throw new Error('Use a Glovo HTTPS store URL without a query string.');
  return { url: url.href, slug: url.pathname.split('/').filter(Boolean).at(-1) };
}

export async function secretPrompt() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('Use an interactive terminal for the hidden key prompt, or set OPENROUTER_API_KEY privately.');
  process.stdout.write('OpenRouter API key (hidden): ');
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let key = '';
    function finish(error) {
      process.stdin.off('data', onData); process.stdin.setRawMode(wasRaw); process.stdin.pause(); process.stdout.write('\n');
      if (error) reject(error); else resolve(key);
    }
    function onData(data) {
      for (const char of data.toString('utf8')) {
        if (char === '\u0003' || char === '\u0004') { finish(new Error('Cancelled; no run started.')); return; }
        if (char === '\r' || char === '\n') { finish(); return; }
        if (char === '\u007f' || char === '\b') key = key.slice(0, -1);
        else if (char >= ' ' && char <= '~') key += char;
      }
    }
    process.stdin.on('data', onData);
  });
}

export async function shoppingListPrompt({ input = process.stdin, output = process.stdout } = {}) {
  output.write('Enter your shopping list, one item per line.\nSubmit a blank line to finish (1–20 items, quantity 1 each).\n\n');
  const lines = createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
  const items = [];
  let cancelled = false;
  lines.on('SIGINT', () => { cancelled = true; lines.close(); });
  try {
    for await (const line of lines) {
      const item = line.trim();
      if (!item) break;
      items.push(item);
      if (items.length > 20) throw new Error('Enter at most 20 items; no run started.');
    }
  } finally { lines.close(); input.pause(); }
  if (cancelled) throw new Error('Cancelled; no run started.');
  if (!items.length) throw new Error('No items entered; no run started.');
  return normalizeItems(items);
}

// Uses fresh catalog metadata, rather than trusting a saved plan's names or option payloads.
export function selectedFromManifest(manifest, products, store) {
  if (manifest?.schema !== 'glovo-basket/v1' || !manifest.id || String(manifest.store?.id) !== String(store.id) ||
      String(manifest.store?.addressId) !== String(store.addressId) || manifest.store.slug !== store.slug)
    throw new Error('The plan belongs to another store or delivery branch.');
  const selected = selectProducts(products, manifest.items);
  if (selected.some(row => row.product.outOfStock === true)) throw new Error('A selected product is now out of stock.');
  return selected;
}

export async function planForBrowser({ items, catalog, jev, savedPlan, browserStore }) {
  const products = new Map();
  const base = catalog;
  const retain = content => { for (const [id, product] of menuProducts(content)) products.set(id, product); return content; };
  const tracked = { ...base, getRoot: async () => retain(await base.getRoot()),
    getContent: async path => retain(await base.getContent(path)) };
  const store = await tracked.getStore();
  if (String(store.id) !== String(browserStore.id) || String(store.addressId) !== String(browserStore.addressId) || store.slug !== browserStore.slug)
    throw new Error('The selected page and menu use different delivery branches.');
  let plan;
  if (savedPlan) {
    const manifest = savedPlan.manifest;
    if (manifest?.schema !== 'glovo-basket/v1' || typeof manifest.id !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(manifest.id) ||
        String(manifest.store?.id) !== String(store.id) || String(manifest.store?.addressId) !== String(store.addressId) || manifest.store.slug !== store.slug)
      throw new Error('The plan belongs to another store or delivery branch.');
  }
  if (savedPlan) {
    if (!Array.isArray(savedPlan.fetchedContentPaths) || savedPlan.fetchedContentPaths.length > 50)
      throw new Error('Import requires a constructor plan with its fetched category paths.');
    await tracked.getRoot();
    for (const path of new Set(savedPlan.fetchedContentPaths)) await tracked.getContent(path);
    plan = savedPlan;
  } else plan = await constructBasket({ items, catalog: tracked, jev, commit: false });
  return { plan, selected: selectedFromManifest(plan.manifest, products, store) };
}

async function atomicSave(path, value) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); await rename(temporary, path);
}
const help = `Glovo basket constructor — Node 24+ and installed Google Chrome. No npm install needed.

node glovo-basket.mjs                 # enter one item per line; blank line finishes
node glovo-basket.mjs "Spaghetti" "Passata" "Tuna" "Cream" "Parsley"
node glovo-basket.mjs --items-file shopping.json
node glovo-basket.mjs --import-plan completed-result.json

Chrome opens in a dedicated persistent profile. On the first run, select your delivery
address in Chrome (and optionally sign in). The key prompt is hidden. Jev runs in Node;
the current Chrome session's native SDK adds the products. Existing basket contents
are preserved. Chrome stays open for review and manual checkout. No checkout is sent.

Options: --store-url URL, --chrome PATH, --browser-profile DIR, --output NEW_FILE,
--profile PRIVATE_LOCATION_JSON (must match Chrome's location), --open-only,
--wait-seconds 300. Default store: Biedronka Express, Kraków.

OPENROUTER_API_KEY is optional; otherwise enter it at the hidden prompt.
Unknown writes stop without retries. A pending-operation file blocks subsequent
writes in this tool's profile until you inspect and reconcile the basket manually.`;

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    help: { type: 'boolean' }, 'store-url': { type: 'string' }, chrome: { type: 'string' },
    'browser-profile': { type: 'string' }, 'items-file': { type: 'string' }, 'import-plan': { type: 'string' },
    output: { type: 'string' }, profile: { type: 'string' }, 'open-only': { type: 'boolean' }, 'wait-seconds': { type: 'string' },
  } });
  if (values.help) { console.log(help); return; }
  if ([positionals.length > 0, Boolean(values['items-file']), Boolean(values['import-plan'])].filter(Boolean).length > 1)
    throw new Error('Use item arguments, --items-file, or --import-plan.');
  if (!globalThis.WebSocket || Number(process.versions.node.split('.')[0]) < 24) throw new Error('Use Node 24 or newer.');
  const target = validateStoreUrl(values['store-url'] || DEFAULT_URL);
  const items = values['open-only'] || values['import-plan'] ? null : values['items-file']
    ? normalizeItems(JSON.parse(await readFile(resolve(values['items-file']), 'utf8')))
    : positionals.length ? normalizeItems(positionals) : await shoppingListPrompt();
  const savedPlan = values['import-plan'] ? JSON.parse(await readFile(resolve(values['import-plan']), 'utf8')) : null;
  const suppliedProfile = values.profile ? { headers: profileHeaders(JSON.parse(await readFile(resolve(values.profile), 'utf8'))) } : null;
  const waitSeconds = Number(values['wait-seconds'] || 300);
  if (!Number.isFinite(waitSeconds) || waitSeconds < 1 || waitSeconds > 1800) throw new Error('--wait-seconds must be 1–1800.');
  let apiKey = takeEnvironmentKey();
  let chrome, report, output, lock, importRecord, lockCreated = false;
  try {
    chrome = await openChrome({ chrome: values.chrome, profile: values['browser-profile'] });
    lock = join(chrome.profile, 'basket-inflight.json');
    try { await access(lock); throw new Error('A previous basket write is unresolved. Inspect basket-inflight.json and the basket before starting another run.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    let observedProfile;
    chrome.page.onEvent(message => {
      if (message.method === 'Network.requestWillBeSent') {
        const profile = publicRequestProfile(message.params.request);
        if (profile) observedProfile = profile;
      }
    });
    await chrome.page.send('Network.enable');
    await chrome.page.send('Page.enable');
    await chrome.page.send('Page.navigate', { url: target.url });
    await chrome.browser.send('Target.activateTarget', { targetId: chrome.targetId });
    console.log('Chrome is open. Select your delivery address on Glovo if needed; optionally sign in.');
    if (values['open-only']) { console.log('Browser opened; no Jev request or basket write made.'); return; }
    let browserStore;
    const deadline = Date.now() + waitSeconds * 1000;
    while (Date.now() < deadline) {
      try {
        const inspected = await evaluate(chrome.page, browserCart, { action: 'inspect' });
        if (inspected.store.slug === target.slug && observedProfile) { browserStore = inspected.store; break; }
      } catch {}
      await pause(500);
    }
    if (!browserStore || !observedProfile) throw new Error('No mounted store with a selected delivery location. Select an address in Chrome and run again.');
    if (suppliedProfile && ['latitude', 'longitude'].some(axis =>
      Number(suppliedProfile.headers['glovo-delivery-location-' + axis]) !== Number(observedProfile.headers['glovo-delivery-location-' + axis])))
      throw new Error('The supplied profile coordinates differ from Chrome. Use the selected browser location.');
    if (!savedPlan) {
      apiKey ||= await secretPrompt(); apiKey = apiKey.trim();
      if (!apiKey || /\s/.test(apiKey)) throw new Error('Enter a valid OpenRouter key.');
      const auth = await fetch('https://openrouter.ai/api/v1/key', { headers: { authorization: 'Bearer ' + apiKey }, signal: AbortSignal.timeout(30000) });
      if (!auth.ok) throw new Error(`OpenRouter authentication failed (HTTP ${auth.status}); no Jev request or basket write made.`);
      await auth.body?.cancel();
    }
    const runId = randomUUID();
    const runs = join(homedir(), '.common-thread-commerce/runs'); await mkdir(runs, { recursive: true, mode: 0o700 });
    output = resolve(values.output || join(runs, runId + '.json'));
    await writeFile(output, '', { flag: 'wx', mode: 0o600 });
    report = { status: 'planning', startedAt: new Date().toISOString(), storeUrl: target.url, output, jevCalls: [] };
    await atomicSave(output, report);
    const nativeJev = savedPlan ? null : createJevClient({ apiKey });
    const jev = { async decide(request) {
      const start = performance.now(), response = await nativeJev.decide(request);
      report.jevCalls.push({ wallMs: Math.round(performance.now() - start), ...response });
      await atomicSave(output, report); console.log(`Jev ${report.jevCalls.length}/3 complete.`); return response;
    } };
    const { plan, selected } = await planForBrowser({ items, savedPlan, browserStore,
      catalog: createBrowserCatalog({ page: chrome.page, store: browserStore, profile: observedProfile }), jev });
    apiKey = undefined;
    report.plan = plan;
    const operationId = plan.manifest.id;
    importRecord = join(chrome.profile, 'basket-operation-' + operationId.replace(/[^a-zA-Z0-9-]/g, '_') + '.json');
    await writeFile(importRecord, JSON.stringify({ status: 'reserved', output }) + '\n', { flag: 'wx', mode: 0o600 });
    await writeFile(lock, JSON.stringify({ operationId, output, note: 'Inspect and reconcile; never replay an unknown write.' }) + '\n', { flag: 'wx', mode: 0o600 });
    lockCreated = true; report.status = 'writing'; await atomicSave(output, report);
    console.log('Adding the selected products through this Chrome session’s native basket SDK.');
    report.handoff = await evaluate(chrome.page, browserCart, { action: 'add', operationId, store: plan.manifest.store, selected }, 120000);
    report.status = report.handoff?.status === 'complete' && report.handoff.verified ? 'complete' : 'unknown';
    report.completedAt = new Date().toISOString();
    await atomicSave(output, report); await atomicSave(importRecord, { status: report.status, output });
    if (report.status !== 'complete') throw new Error('Basket outcome is unknown. Chrome remains open; inspect the basket and saved report. No automatic retry.');
    await unlink(lock); lockCreated = false;
    await chrome.page.send('Page.reload');
    let fresh;
    const reloadDeadline = Date.now() + 30000;
    while (Date.now() < reloadDeadline) {
      try { fresh = await evaluate(chrome.page, browserCart, { action: 'read', store: plan.manifest.store }); break; }
      catch { await pause(500); }
    }
    const identity = basket => JSON.stringify(basket.products.map(line => [line.productId, line.options, line.quantity])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    if (!fresh || identity(fresh) !== identity(report.handoff.basket)) throw new Error('Basket was written, but the reloaded page did not confirm the same contents. Inspect Chrome; do not repeat the run.');
    report.reloadVerified = true; await atomicSave(output, report);
    console.log(`Basket ready: ${report.handoff.basket.total || 'see Chrome'}. Chrome is yours; checkout is manual.`);
    console.log(`Saved report: ${output}`);
  } catch (error) {
    if (report) { report.status = report.handoff?.verified ? 'handoff_failed' : lockCreated ? 'unknown' : 'failed'; report.error = String(error.message).replaceAll(apiKey || '\u0000', '[redacted]'); await atomicSave(output, report); }
    throw new Error(String(error.message).replaceAll(apiKey || '\u0000', '[redacted]'));
  } finally { apiKey = undefined; chrome?.disconnect(); }
}
