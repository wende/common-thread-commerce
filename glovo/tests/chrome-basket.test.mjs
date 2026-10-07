import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { browserCart } from '../tools/chrome-cart.mjs';
import { publicRequestProfile, selectedFromManifest, validateStoreUrl, planForBrowser, shoppingListPrompt, takeEnvironmentKey } from '../tools/basket-chrome.mjs';

const store = { id: 207442, addressId: 336099, slug: 'biedronka-express-kra', name: 'Biedronka', enabled: true, open: true };
const row = (id, quantity = 1) => ({ product: { id: String(id), name: 'Ingredient ' + id, externalId: 'external', storeProductId: 'native-' + id,
  attributeGroups: [], outOfStock: false }, quantity, customizations: [] });
const line = (id, quantity = 1) => ({ ids: { id: String(id) }, name: 'Ingredient ' + id, quantity: { increments: quantity }, customizations: [] });
const manifest = { schema: 'glovo-basket/v1', id: 'test-plan', store, items: [{ productId: '4611686018932096633', quantity: 1, choices: [] }] };

function pageFixture({ failAt, storageFails, before = [line('unrelated', 2)], timeout = false } = {}) {
  let basket = { products: structuredClone(before), basketPrice: { totalFormatted: '20,00 zł' } }, writes = 0, reads = 0;
  const records = new Map();
  const sdk = { getBaskets() {}, async getBasketByStore(_, __, cached) { assert.equal(cached, false); reads++; return structuredClone(basket); },
    async addProduct(input) {
      writes++;
      assert.equal(input.storeId, store.id); assert.equal(input.handlingStrategy, 'DELIVERY');
      if (writes === failAt) throw new Error('Native write rejected');
      if (timeout) return new Promise(() => {});
      const product = input.product, found = basket.products.find(p => p.ids.id === product.ids.id);
      if (found) found.quantity.increments += product.quantity.increments;
      else basket.products.push({ ...structuredClone(product), name: 'Ingredient ' + product.ids.id });
      return structuredClone(basket);
    } };
  const fiber = { memoizedProps: { store: { ...store }, initialStoreContent: {} }, memoizedState: { memoizedState: [sdk] } };
  const element = { '__reactFiber$test': fiber };
  const context = vm.createContext({ location: { hostname: 'glovoapp.com', pathname: '/en/pl/krakow/stores/biedronka-express-kra' },
    document: { querySelectorAll: () => [element] }, window: {},
    sessionStorage: { getItem: key => records.get(key), setItem: (key, value) => { if (storageFails) throw new Error('Storage unavailable'); records.set(key, value); } },
    setTimeout: (fn, ms) => setTimeout(fn, timeout ? 10 : ms), clearTimeout });
  return { run: input => vm.runInContext(`(${browserCart.toString()})(${JSON.stringify(input)})`, context),
    writes: () => writes, reads: () => reads, records, fiber, sdk };
}

test('native Chrome handoff preserves prior lines and verifies with fresh reads, then replay cannot add again', async () => {
  const f = pageFixture({ before: [line('unrelated', 2), line('4611686018932096633', 3)] });
  const input = { action: 'add', operationId: 'operation-1', store, selected: [row('4611686018932096633', 2), row('second')] };
  const result = await f.run(input);
  assert.equal(result.status, 'complete'); assert.equal(result.verified, true);
  assert.deepEqual(Array.from(result.basket.products, p => [p.productId, p.quantity]), [['unrelated', 2], ['4611686018932096633', 5], ['second', 1]]);
  assert.equal(f.writes(), 2); assert.equal(f.reads(), 2);
  const replay = await f.run(input); assert.equal(replay.replayed, true); assert.equal(f.writes(), 2);
  await assert.rejects(f.run({ ...input, selected: [row('different')] }), /different basket contents/);
});

test('all combined quantities are validated before any write; wrong branch and unavailable storage also block writes', async () => {
  const overflow = pageFixture({ before: [line('second', 20)] });
  const result = await overflow.run({ action: 'add', operationId: 'overflow', store, selected: [row('first'), row('second')] });
  assert.equal(result.status, 'unknown'); assert.equal(overflow.writes(), 0);
  const branch = pageFixture();
  await assert.rejects(branch.run({ action: 'add', operationId: 'wrong', store: { ...store, addressId: 999 }, selected: [row('first')] }), /branches differ/);
  assert.equal(branch.writes(), 0);
  const storage = pageFixture({ storageFails: true });
  assert.equal((await storage.run({ action: 'add', operationId: 'storage', store, selected: [row('first')] })).status, 'unknown');
  assert.equal(storage.writes(), 0);
});

test('a rejected or timed-out native write stops the batch and cannot replay', async () => {
  for (const options of [{ failAt: 2 }, { timeout: true }]) {
    const f = pageFixture(options);
    const input = { action: 'add', operationId: 'unknown', store, selected: [row('first'), row('second'), row('third')] };
    const result = await f.run(input); assert.equal(result.status, 'unknown');
    const count = f.writes(); assert.equal(count, options.timeout ? 1 : 2);
    const replay = await f.run(input); assert.equal(replay.replayed, true); assert.equal(f.writes(), count);
  }
});

test('public request capture discards account headers and unrelated origins', () => {
  const request = { url: 'https://api.glovoapp.com/v3/stores/store', headers: { Authorization: 'private', Cookie: 'private',
    'glovo-delivery-location-latitude': '50', 'glovo-delivery-location-longitude': '20', 'glovo-app-platform': 'web' } };
  assert.deepEqual(Object.keys(publicRequestProfile(request).headers).sort(), ['glovo-app-platform', 'glovo-delivery-location-latitude', 'glovo-delivery-location-longitude']);
  assert.equal(publicRequestProfile({ ...request, url: 'https://unrelated.test/' }), null);
  assert.throws(() => validateStoreUrl('https://evil.test/stores/store'));
  assert.throws(() => validateStoreUrl('https://glovoapp.com/en/pl/krakow/stores/store?secret=x'));
});

test('saved plan handoff rehydrates exact native IDs without any Jev or guest basket writes', async () => {
  const product = row('4611686018932096633').product;
  const grid = { type: 'GRID', data: { elements: [{ type: 'PRODUCT_TILE', data: product }] } };
  let reads = 0;
  const catalog = { getStore: async () => store, getRoot: async () => ({}), getContent: async () => { reads++; return grid; },
    writeBasket() { assert.fail('No guest basket write allowed'); } };
  const savedPlan = { manifest, fetchedContentPaths: ['/catalog-section'] };
  const result = await planForBrowser({ savedPlan, browserStore: store, catalog, jev: { decide() { assert.fail('No Jev request allowed'); } } });
  assert.equal(result.selected[0].product.id, '4611686018932096633'); assert.equal(reads, 1);
  assert.throws(() => selectedFromManifest(manifest, new Map([[product.id, { ...product, outOfStock: true }]]), store), /out of stock/);
  await assert.rejects(planForBrowser({ savedPlan, browserStore: { ...store, addressId: 999 }, catalog }), /different delivery branches/);
});

test('help is offline and packaged CLI code never embeds a provider key into Chrome arguments', async () => {
  const help = spawnSync(process.execPath, [new URL('../tools/basket-chrome-cli.mjs', import.meta.url).pathname, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /No npm install needed/);
  const driver = await readFile(new URL('../tools/chrome-driver.mjs', import.meta.url), 'utf8');
  assert.match(driver, /delete env\.OPENROUTER_API_KEY/);
});

test('interactive shopping list accepts newline-separated custom items and blank line finishes without defaults', async () => {
  let prompt = '';
  const output = new Writable({ write(chunk, _, callback) { prompt += chunk.toString(); callback(); } });
  const input = Readable.from(['  Chusteczki  \nPassata\nCream 30% fat\n\nIgnored after finish\n']);
  const items = await shoppingListPrompt({ input, output });
  assert.deepEqual(items.map(item => item.query), ['Chusteczki', 'Passata', 'Cream 30% fat']);
  assert.ok(items.every(item => item.quantity === 1));
  assert.match(prompt, /one item per line/);
});

test('empty or oversized shopping lists stop before opening Chrome or calling a model', async () => {
  const output = new Writable({ write(_, __, callback) { callback(); } });
  await assert.rejects(shoppingListPrompt({ input: Readable.from(['\n']), output }), /No items entered/);
  await assert.rejects(shoppingListPrompt({ input: Readable.from([Array(21).fill('Milk').join('\n') + '\n\n']), output }), /at most 20/);
  const cli = new URL('../tools/basket-chrome-cli.mjs', import.meta.url).pathname;
  const empty = spawnSync(process.execPath, [cli], { encoding: 'utf8', input: '\n' });
  assert.equal(empty.status, 1); assert.match(empty.stdout, /one item per line/); assert.match(empty.stderr, /No items entered/);
});

test('the environment key is used without echoing it or passing it into child processes; blank values fall back to the prompt', () => {
  const env = { OPENROUTER_API_KEY: '  offline-test-key  ', OTHER_SETTING: 'keep' };
  assert.equal(takeEnvironmentKey(env), 'offline-test-key');
  assert.deepEqual(env, { OTHER_SETTING: 'keep' });
  const blank = { OPENROUTER_API_KEY: '   ' };
  assert.equal(takeEnvironmentKey(blank), undefined);
  assert.equal(Object.hasOwn(blank, 'OPENROUTER_API_KEY'), false);
  assert.equal(takeEnvironmentKey({}), undefined);
});
