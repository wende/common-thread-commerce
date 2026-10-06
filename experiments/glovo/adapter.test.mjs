import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./adapter.js', import.meta.url), 'utf8');
let fixtureSequence = 0;
function fixture(extraProducts = [], { nativeApi = false } = {}) {
  const fixtureId = ++fixtureSequence;
  const calls = [], timers = new Map();
  let nextTimer = 0;
  let now = Date.now();
  class Clock extends Date { static now() { return now; } }
  const store = { id: 77097, addressId: 210074, categoryId: 1, slug: 'mcdonald-s-kra', name: "McDonald's", open: true, enabled: true };
  // Shape observed in the live React menu and native ProductDetailsModal payload builder.
  const product = { id: 'coffee', externalId: '8088', storeProductId: 'coffee-uuid', name: 'Coffee', priceInfo: { amount: 19, currencyCode: 'PLN' },
    attributeGroups: [{ id: 123, externalId: 'cup-group', name: 'Cup', min: 1, max: 1, position: 0, multipleSelection: false,
      attributes: [{ id: 456, externalId: 'cup-option', name: 'Paper cup' }] }] };
  let basket = { products: [{ ids: { id: 'coffee', basketProductId: 'line-123' }, name: 'Coffee', quantity: { increments: 2 },
    customizations: [{ groupName: 'Cup', customizationName: 'Paper cup', quantity: { increments: 1 } }] }] };
  const products = [product, ...extraProducts];
  const sdk = {
    getBaskets: async () => [], getBasketByStore: async (...args) => { calls.push(['read', args]); return structuredClone(basket); },
    addProduct: async payload => {
      calls.push(['add', payload]);
      const signature = choices => JSON.stringify(choices.map(choice => [choice.groupName, choice.customizationName, choice.quantity.increments]));
      const line = basket.products.find(line => line.ids.id === payload.product.ids.id && signature(line.customizations) === signature(payload.product.customizations));
      if (line) line.quantity.increments += payload.product.quantity.increments;
      else basket.products.push({ ids: { id: payload.product.ids.id, basketProductId: `line-${payload.product.ids.id}-${basket.products.length}` },
        name: products.find(product => product.id === payload.product.ids.id).name, quantity: payload.product.quantity, customizations: payload.product.customizations });
      return structuredClone(basket);
    },
    decreaseProductsQuantity: async payload => {
      calls.push(['remove', payload]);
      basket.products.find(line => line.ids.basketProductId === payload.basketProductId).quantity.increments -= payload.decreaseBy;
      basket.products = basket.products.filter(line => line.quantity.increments > 0); return structuredClone(basket);
    },
  };
  const root = { memoizedState: { memoizedState: sdk } };
  root.stateNode = { current: root };
  const provider = { return: root, memoizedProps: { store, initialStoreContent: { data: { body: products.map(data => ({type:'PRODUCT_ROW',data})) } } } };
  const element = {}, host = { return: provider, stateNode: element };
  element.__reactFiber$test = host; root.child = provider; provider.child = host;
  const nodes = new Map();
  const createElement = tag => ({ tag, style: {}, dataset: {}, children: [], listeners: {}, textContent: '',
    setAttribute() {}, addEventListener(name, listener) { this.listeners[name] = listener; },
    append(...children) { this.children.push(...children); for (const child of children) if (child.id) nodes.set(child.id, child); },
    remove() { nodes.delete(this.id); },
  });
  const sandbox = { Date: Clock, crypto: { randomUUID: () => `fixture-${fixtureId}-id-${++nextTimer}` }, window: { __glovoBridgeOptions: { panel: false, nativeApi } }, location: { hostname: 'glovoapp.com', pathname: '/en/pl/krakow/stores/mcdonald-s-kra', href: 'https://glovoapp.com/en/pl/krakow/stores/mcdonald-s-kra' },
    document: { querySelector: () => null, querySelectorAll: () => [element], getElementById: () => null },
    setTimeout: callback => { const id = ++nextTimer; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id) };
  if (nativeApi) Object.assign(sandbox.document, { createElement, documentElement: createElement('html'), getElementById: id => nodes.get(id) || null });
  vm.runInNewContext(source, sandbox);
  return { bridge: sandbox.window.glovoBridge, calls, sdk, timers, store, sandbox, provider, nodes,
    advance: ms => { now += ms; }, setBasket: value => { basket = structuredClone(value); } };
}
const choice = { groupId: '123', attributeId: '456' };
const plain = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const food = (id, name, attributeGroups = []) => ({ id, name, storeProductId: `${id}-uuid`, priceInfo: { amount: 10, currencyCode: 'PLN' }, attributeGroups });

test('Basket manifests reconstruct configured quantities while preserving destination products and replay after reinjection', async () => {
  const sourceSession = fixture([food('burger', 'Burger')]);
  await sourceSession.bridge.addMany({ items: [{ productId: 'burger', quantity: 1 }] });
  const manifest = plain(await sourceSession.bridge.exportBasket());
  assert.equal(manifest.schema, 'glovo-basket/v1');
  assert.deepEqual(manifest.items[0].choices, [{ group: 'Cup', name: 'Paper cup', quantity: 1 }]);
  assert.ok(!/basketProductId|cookie|authorization/i.test(JSON.stringify(manifest)));
  const destination = fixture([food('burger', 'Burger')]);
  const result = await destination.bridge.importBasket({ basket: manifest });
  assert.equal(result.status, 'complete'); assert.equal(result.verification.matches, true);
  assert.deepEqual(plain(result.basket.products.map(line => [line.productId, line.quantity])), [['coffee', 4], ['burger', 1]]);
  const writes = destination.calls.filter(([method]) => method === 'add').length;
  vm.runInNewContext(source, destination.sandbox);
  const replay = await destination.sandbox.window.glovoBridge.importBasket({ basket: manifest });
  assert.equal(replay.replayed, true); assert.equal(replay.verification.matches, true);
  assert.equal(destination.calls.filter(([method]) => method === 'add').length, writes);
  await assert.rejects(destination.sandbox.window.glovoBridge.importBasket({ basket: { ...manifest,
    items: [{ ...manifest.items[0], quantity: 3 }, manifest.items[1]] } }), /different import/);
  assert.equal(destination.calls.filter(([method]) => method === 'add').length, writes);
});

test('Basket import rejects source-session and wrong-branch manifests before writes', async () => {
  const sourceSession = fixture(), manifest = plain(await sourceSession.bridge.exportBasket());
  await assert.rejects(sourceSession.bridge.importBasket({ basket: manifest }), /different browser session/);
  const destination = fixture();
  await assert.rejects(destination.bridge.importBasket({ basket: { ...manifest,
    store: { ...manifest.store, addressId: 'other-branch' } } }), /same store branch/);
  assert.equal(destination.calls.filter(([method]) => method === 'add').length, 0);
});

test('Basket verification detects changed quantities and a changed store branch', async () => {
  const manifest = plain(await fixture().bridge.exportBasket());
  const destination = fixture();
  assert.equal((await destination.bridge.importBasket({ basket: manifest })).verification.matches, true);
  destination.store.addressId = 999;
  assert.equal((await destination.bridge.verifyBasketImport({ id: manifest.id })).matches, false);
  destination.store.addressId = 210074;
  destination.setBasket({ products: [] });
  assert.equal((await destination.bridge.verifyBasketImport({ id: manifest.id })).matches, false);
});

test('An uncertain import is journaled and cannot resend its write on replay', async () => {
  const manifest = plain(await fixture().bridge.exportBasket());
  const destination = fixture();
  destination.sdk.addProduct = async () => { destination.calls.push(['add']); throw new Error('network error'); };
  const result = await destination.bridge.importBasket({ basket: manifest });
  assert.equal(result.status, 'unknown'); assert.equal(result.verification.matches, false);
  const replay = await destination.bridge.importBasket({ basket: manifest });
  assert.equal(replay.replayed, true); assert.equal(replay.status, 'unknown');
  assert.equal(destination.calls.filter(([method]) => method === 'add').length, 1);
});

test('Product lookup accepts both a bare ID and the DOM request object', () => {
  const { bridge } = fixture();
  assert.equal(bridge.getProduct('coffee').id, 'coffee');
  assert.equal(bridge.getProduct({ productId: 'coffee' }).id, 'coffee');
  assert.throws(() => bridge.getProduct({}), /productId/);
});

test('Native transport keeps a stable pending response and replays a completed request without another write', async () => {
  const f = fixture([], { nativeApi: true });
  const input = f.nodes.get('glovo-adapter-request'), output = f.nodes.get('glovo-adapter-response');
  const host = f.nodes.get('shopping-assistant-glovo-api'), form = host.children[1];
  let finish, writes = 0;
  f.bridge.addMany = async () => { writes++; return new Promise(resolve => { finish = resolve; }); };
  const request = { requestId: 'addition-1', method: 'addMany', input: { items: [{ productId: 'coffee' }] } };
  input.value = JSON.stringify(request);
  const pending = form.listeners.submit({ preventDefault() {} });
  assert.equal(JSON.parse(output.textContent).requestId, request.requestId);
  assert.equal(output.dataset.state, 'pending');
  assert.equal(f.nodes.get('glovo-adapter-response'), output);
  f.advance(5000); finish({ status: 'complete' }); await pending;
  assert.equal(JSON.parse(output.textContent).value.status, 'complete');
  assert.equal(output.dataset.state, 'complete');
  input.value = JSON.stringify({ requestId: 'inspect-1', method: 'inspect' });
  await form.listeners.submit({ preventDefault() {} });
  input.value = JSON.stringify(request);
  await form.listeners.submit({ preventDefault() {} });
  assert.equal(writes, 1);
  assert.equal(JSON.parse(output.textContent).requestId, request.requestId);
  input.value = JSON.stringify({ ...request, input: { items: [] } });
  await form.listeners.submit({ preventDefault() {} });
  assert.equal(writes, 1);
  assert.match(JSON.parse(output.textContent).error, /different request/);
});

test('Native transport correlates rejected methods with the supplied request ID', async () => {
  const f = fixture([], { nativeApi: true });
  const input = f.nodes.get('glovo-adapter-request'), output = f.nodes.get('glovo-adapter-response');
  const form = f.nodes.get('shopping-assistant-glovo-api').children[1];
  input.value = JSON.stringify({ requestId: 'rejected-1', method: 'constructor' });
  await form.listeners.submit({ preventDefault() {} });
  const response = JSON.parse(output.textContent);
  assert.equal(response.requestId, 'rejected-1');
  assert.equal(response.state, 'complete'); assert.equal(response.ok, false);
});

test('Customized additions match the native Glovo payload contract', async () => {
  const { bridge, calls, store } = fixture();
  await bridge.addToBasket({ productId: 'coffee', quantity: 2, choices: [choice] });
  assert.deepEqual(plain(calls.find(([method]) => method === 'add')), ['add', {
    handlingStrategy: 'DELIVERY', store, storeId: 77097, storeAddressId: 210074, storeCategoryId: 1,
    product: { ids: { id: 'coffee', externalId: '8088', legacyId: 'coffee', storeProductId: 'coffee-uuid' }, quantity: { increments: 2 },
      customizations: [{ ids: { externalId: 'cup-option', groupLegacyId: '123', groupId: '123', groupExternalId: 'cup-group', groupPosition: 0, legacyId: '456' },
        name: 'Cup', quantity: { increments: 1 }, customizationName: 'Paper cup', groupName: 'Cup' }] },
  }]);
});

test('An unresolved native addition blocks another mutation', async () => {
  const { bridge, sdk, calls } = fixture();
  let settle; sdk.addProduct = payload => { calls.push(['add', payload]); return new Promise(resolve => { settle = resolve; }); };
  const first = bridge.addToBasket({ productId: 'coffee', choices: [choice] });
  for (let index = 0; index < 20; index++) await Promise.resolve();
  await assert.rejects(bridge.addToBasket({ productId: 'coffee', choices: [choice] }), /already running/);
  assert.equal(calls.filter(([method]) => method === 'add').length, 1);
  settle({ products: [{ ids: { id: 'coffee', basketProductId: 'line-123' }, quantity: { increments: 3 },
    customizations: [{ groupName: 'Cup', customizationName: 'Paper cup', quantity: { increments: 1 } }] }] }); await first;
  assert.equal(bridge.inspect().mutationPending, false);
});

test('A timeout reports unknown outcome and keeps the mutation lock until native settlement', async () => {
  const { bridge, sdk, timers } = fixture();
  let settle; sdk.addProduct = () => new Promise(resolve => { settle = resolve; });
  const addition = bridge.addToBasket({ productId: 'coffee', choices: [choice] });
  const rejection = assert.rejects(addition, /outcome is unknown/);
  for (let index = 0; index < 20; index++) await Promise.resolve();
  [...timers.values()][0](); await rejection;
  assert.equal(bridge.inspect().mutationPending, true);
  await assert.rejects(bridge.addToBasket({ productId: 'coffee', choices: [choice] }), /already running/);
  assert.throws(() => bridge.uninstall(), /Wait for the basket update/);
  settle({ products: [] });
  for (let index = 0; index < 10; index++) await Promise.resolve();
  assert.equal(bridge.inspect().mutationPending, false);
});

test('Removal targets an exact current-store line and rejects excessive quantities', async () => {
  const { bridge, calls, store } = fixture();
  await assert.rejects(bridge.removeFromBasket({ basketProductId: 'unknown' }), /not in the current/);
  await assert.rejects(bridge.removeFromBasket({ basketProductId: 'line-123', quantity: 3 }), /exceeds/);
  assert.equal(calls.filter(([method]) => method === 'remove').length, 0);
  await bridge.removeFromBasket({ basketProductId: 'line-123', quantity: 2 });
  const [, payload] = calls.find(([method]) => method === 'remove');
  assert.deepEqual(plain(payload), { store, storeId: 77097, storeAddressId: 210074, basketProductId: 'line-123', decreaseBy: 2 });
});

test('Batch search ranks exact names, resolves English aliases and exposes only requested option groups', () => {
  const { bridge } = fixture([
    food('double-meal', 'McZestaw McDouble'), food('double', 'McDouble®'), food('chicken', 'McChicken®'),
    food('shake', 'Shake o smaku czekoladowym', [{ id: 1, name: 'Size', min: 1, max: 1, attributes: [{ id: 2, name: 'Mały' }] }]),
    food('pie', 'Ciastko jabłkowe'),
  ]);
  const result = bridge.searchMany({ queries: ['mcdouble', 'mcchicken', 'chocolate shake', 'ciastko jablkowe'], includeOptions: 'selected' });
  assert.deepEqual(plain(result.results.map(item => [item.status, item.selectedProductId])), [['matched', 'double'], ['matched', 'chicken'], ['matched', 'shake'], ['matched', 'pie']]);
  assert.equal(result.results[0].products[0].match.type, 'exact');
  assert.equal(result.results[0].products[1].kind, 'meal');
  assert.equal(result.results[0].products[1].attributeGroups, undefined);
  assert.equal(result.results[2].products[0].attributeGroups[0].name, 'Size');
  assert.equal(bridge.searchMany(['McDouble']).results[0].products[0].attributeGroups, undefined);
  assert.equal(bridge.searchMany({ queries: ['chocolate shake'], aliases: false }).results[0].status, 'no_match');
});

test('Fuzzy search presents ambiguous meal alternatives and respects an explicit strict search', () => {
  const { bridge } = fixture([food('double', 'McDouble®'), food('meal', 'McZestaw McDouble')]);
  const fuzzy = bridge.searchMany(['mcdoble']).results[0];
  assert.equal(fuzzy.status, 'ambiguous'); assert.equal(fuzzy.selectedProductId, null);
  assert.equal(fuzzy.products[0].match.type, 'fuzzy');
  assert.equal(bridge.searchMany({ queries: ['mcdoble'], fuzzy: false }).results[0].status, 'no_match');
  assert.throws(() => bridge.searchMany({ queries: ['valid', null] }), /query must be a string/);
  assert.throws(() => bridge.searchMany(Array(21).fill('Coffee')), /1–20/);
});

test('Batch addition validates every product and required choice before any write', async () => {
  const { bridge, calls } = fixture([food('pie', 'Ciastko jabłkowe')]);
  await assert.rejects(bridge.addMany([{ productId: 'pie' }, { productId: 'coffee' }]), /Choose 1–1/);
  assert.equal(calls.filter(([method]) => method === 'add').length, 0);
  assert.equal(bridge.inspect().mutationPending, false);
});

test('Named choices resolve uniquely; ambiguous option names are rejected before writes', async () => {
  const { bridge, calls } = fixture([food('duplicate', 'Options', [
    { id: 1, name: 'First', min: 0, attributes: [{ id: 1, name: 'Same' }] },
    { id: 2, name: 'Second', min: 0, attributes: [{ id: 2, name: 'Same' }] },
  ])]);
  await assert.rejects(bridge.addMany([{ productId: 'duplicate', choices: ['Same'] }]), /ambiguous/);
  assert.equal(calls.filter(([method]) => method === 'add').length, 0);
  const addition = await bridge.addMany([{ productId: 'coffee', choices: ['Paper cup'] }]);
  assert.equal(addition.status, 'complete'); assert.equal(addition.basket.itemCount, 3);
  assert.equal(bridge.getReceipts()[0].choices[0].name, 'Paper cup');
});

test('Receipt cleanup coalesces same-line additions and preserves pre-existing quantities', async () => {
  const { bridge, calls } = fixture();
  const addition = await bridge.addMany([
    { productId: 'coffee', quantity: 2, choices: ['Paper cup'] },
    { productId: 'coffee', quantity: 1, choices: ['Paper cup'] },
  ]);
  assert.equal(addition.basket.itemCount, 5);
  const receiptIds = addition.results.map(result => result.receiptId);
  const cleanup = await bridge.removeMany({ receiptIds });
  assert.equal(cleanup.basket.products[0].quantity, 2);
  assert.equal(calls.filter(([method]) => method === 'remove').length, 1);
  assert.equal(bridge.getReceipts().length, 0);
  await assert.rejects(bridge.removeMany({ receiptIds }), /already consumed/);
  const log = bridge.getOperationLog();
  assert.equal(log.baselines[0].products[0].quantity, 2);
  assert.equal(log.receipts.length, 2); assert.equal(log.receipts[0].quantityRemaining, 0);
  log.baselines[0].products[0].quantity = 100;
  assert.equal(bridge.getOperationLog().baselines[0].products[0].quantity, 2);
});

test('Receipts survive reinjection and cannot be used in another store', async () => {
  const { bridge, sandbox, provider } = fixture();
  const added = await bridge.addMany([{ productId: 'coffee', choices: ['Paper cup'] }]);
  const ids = added.results.map(result => result.receiptId);
  vm.runInNewContext(source, sandbox);
  const replacement = sandbox.window.glovoBridge;
  assert.equal(replacement.sessionId, bridge.sessionId);
  assert.equal(replacement.getReceipts().length, 1);
  provider.memoizedProps.store = { ...provider.memoizedProps.store, id: 999 };
  await assert.rejects(replacement.removeMany({ receiptIds: ids }), /another store/);
  provider.memoizedProps.store = { ...provider.memoizedProps.store, id: 77097 };
  assert.equal((await replacement.removeMany({ receiptIds: ids })).basket.itemCount, 2);
});

test('Receipt cleanup refuses to consume pre-existing quantities after an external decrease', async () => {
  const { bridge, sdk, setBasket, calls } = fixture();
  const added = await bridge.addMany([{ productId: 'coffee', quantity: 2, choices: ['Paper cup'] }]);
  const basket = await sdk.getBasketByStore(); basket.products[0].quantity.increments = 3; setBasket(basket);
  await assert.rejects(bridge.removeMany({ receiptIds: added.results.map(item => item.receiptId) }), /pre-existing quantity/);
  assert.equal(calls.filter(([method]) => method === 'remove').length, 0);
});

test('Receipt cleanup distinguishes differently configured lines of the same product', async () => {
  const { bridge, provider } = fixture();
  provider.memoizedProps.initialStoreContent.data.body[0].data.attributeGroups[0].attributes.push({ id: 457, name: 'Reusable cup' });
  const added = await bridge.addMany([{ productId: 'coffee', choices: ['Reusable cup'] }]);
  assert.equal(added.basket.lineCount, 2);
  assert.notEqual(added.results[0].basketProductId, 'line-123');
  const removed = await bridge.removeMany({ receiptIds: added.results.map(item => item.receiptId) });
  assert.equal(removed.basket.lineCount, 1);
  assert.equal(removed.basket.products[0].quantity, 2);
  assert.equal(removed.basket.products[0].customizations[0].name, 'Paper cup');
});

test('All removal lines and duplicate totals are validated before the first decrease', async () => {
  const { bridge, calls } = fixture();
  await assert.rejects(bridge.removeMany([{ basketProductId: 'line-123' }, { basketProductId: 'unknown' }]), /not in the current/);
  await assert.rejects(bridge.removeMany([{ basketProductId: 'line-123', quantity: 2 }, { basketProductId: 'line-123' }]), /exceeds/);
  assert.equal(calls.filter(([method]) => method === 'remove').length, 0);
});

test('A timeout in the second batch step keeps prior receipts and never sends the third write', async () => {
  const { bridge, sdk, calls, timers } = fixture([food('pie', 'Ciastko jabłkowe')]);
  const original = sdk.addProduct; let settle, count = 0;
  sdk.addProduct = payload => {
    if (++count === 1) return original(payload);
    calls.push(['add', payload]); return new Promise(resolve => { settle = resolve; });
  };
  const pending = bridge.addMany([{ productId: 'coffee', choices: ['Paper cup'] }, { productId: 'pie' }, { productId: 'pie' }]);
  await flush(); [...timers.values()][0]();
  const result = await pending;
  assert.deepEqual(plain(result.results.map(item => item.status)), ['added', 'unknown', 'not_attempted']);
  assert.equal(result.basket.itemCount, 3); assert.equal(result.basketIsLastConfirmed, true);
  assert.equal(bridge.getReceipts().length, 1); assert.equal(bridge.inspect().mutationPending, true);
  assert.equal(count, 2);
  settle({ products: [] }); await flush();
  assert.equal(bridge.inspect().mutationPending, false); assert.equal(count, 2);
});

test('Rejected or unconfirmed native writes halt the batch without issuing false receipts', async () => {
  for (const reject of [true, false]) {
    const { bridge, sdk, calls } = fixture([food('pie', 'Ciastko jabłkowe')]);
    sdk.addProduct = async payload => { calls.push(['add', payload]); if (reject) throw new Error('network failed'); return { products: [] }; };
    const result = await bridge.addMany([{ productId: 'pie' }, { productId: 'pie' }]);
    assert.equal(result.status, 'unknown'); assert.equal(result.results[1].status, 'not_attempted');
    assert.equal(calls.filter(([method]) => method === 'add').length, 1); assert.equal(bridge.getReceipts().length, 0);
  }
});

test('A long batch stops before transport timeout and marks unstarted writes explicitly', async () => {
  const { bridge, sdk, advance } = fixture(); const original = sdk.addProduct; let count = 0;
  sdk.addProduct = async payload => { count++; const result = await original(payload); advance(23000); return result; };
  const result = await bridge.addMany(Array.from({ length: 3 }, () => ({ productId: 'coffee', choices: ['Paper cup'] })));
  assert.equal(count, 2); assert.equal(result.status, 'partial');
  assert.deepEqual(plain(result.results.map(item => item.status)), ['added', 'added', 'not_attempted']);
});

test('Legacy methods expose a structured time-limit error when no write has started', async () => {
  for (const method of ['addToBasket', 'removeFromBasket']) {
    const { bridge, sdk, advance, calls } = fixture(); const original = sdk.getBasketByStore;
    sdk.getBasketByStore = async (...args) => { const result = await original(...args); advance(46000); return result; };
    const input = method === 'addToBasket' ? { productId: 'coffee', choices: ['Paper cup'] } : { basketProductId: 'line-123' };
    await assert.rejects(bridge[method](input), error => error.code === 'BATCH_TIME_LIMIT' && error.result.status === 'partial');
    assert.equal(calls.filter(([operation]) => ['add', 'remove'].includes(operation)).length, 0);
  }
});

function nativeUi(f, { quantity = 2, option = 'Paper cup', extra = false } = {}) {
  const rectangle = { x: 900, y: 50, top: 50, bottom: 400, left: 900, right: 1200, width: 300, height: 350 };
  const image = { alt: 'Coffee', querySelectorAll: () => [], querySelector: () => null };
  const row = { innerText: `Coffee\n${option}\n${quantity}\n19 PLN`, querySelectorAll: () => [image], querySelector: () => ({}) };
  image.parentElement = row;
  const cart = { getBoundingClientRect: () => rectangle, querySelectorAll: () => extra ? [image, { ...image, alt: 'Unexpected' }] : [image], innerText: row.innerText, scrollIntoView: () => {} };
  const button = { setAttribute: () => {}, textContent: '' };
  const host = { hidden: false, style: {}, toggleAttribute: () => {}, shadowRoot: { querySelector: () => button }, remove: () => {} };
  const originalQuery = f.sandbox.document.querySelectorAll;
  f.sandbox.document.querySelectorAll = selector => selector === 'body *' ? originalQuery(selector) : [cart];
  f.sandbox.document.getElementById = () => host;
  f.sandbox.innerHeight = 1000; f.sandbox.innerWidth = 1500;
  // Keep mismatch polling fast without changing the native operation timer semantics.
  f.sandbox.setTimeout = (callback, delay) => setTimeout(callback, delay === 50 ? 0 : delay);
  f.sandbox.clearTimeout = clearTimeout;
  return { host, cart };
}

test('Basket evidence verifies the native basket and rejects stale quantities or extra rows', async () => {
  for (const settings of [{}, { quantity: 3 }, { option: 'Wrong cup' }, { extra: true }]) {
    const f = fixture(); nativeUi(f, settings);
    const evidence = await f.bridge.getBasketEvidence();
    assert.equal(evidence.nativeMatchesStructured, Object.keys(settings).length === 0);
    assert.equal('element' in evidence.nativeUi, false);
    assert.equal(evidence.nativeUi.visibleInViewport, true);
  }
});

test('Empty-basket evidence needs native empty-state text and no product rows', async () => {
  const f = fixture(); f.setBasket({ products: [] }); const { cart } = nativeUi(f);
  cart.querySelectorAll = () => []; cart.innerText = 'Your products will appear here';
  assert.equal((await f.bridge.getBasketEvidence()).nativeMatchesStructured, true);
  cart.innerText = 'Loading';
  assert.equal((await f.bridge.getBasketEvidence()).nativeMatchesStructured, false);
});

test('Screenshot preparation hides the panel; a failed read restores its original state', async () => {
  const f = fixture(); const { host } = nativeUi(f);
  const evidence = await f.bridge.prepareBasketScreenshot();
  assert.equal(host.hidden, true); assert.equal(evidence.panelBefore.visible, true);
  f.bridge.panel.show({ dock: 'right', collapsed: true });
  f.sdk.getBasketByStore = async () => { throw new Error('read failed'); };
  await assert.rejects(f.bridge.prepareBasketScreenshot(), /read failed/);
  assert.equal(host.hidden, false); assert.equal(f.bridge.panel.state().dock, 'right');
  assert.equal(f.bridge.panel.state().collapsed, true);
  assert.throws(() => f.bridge.panel.show({ dock: 'elsewhere' }), /left or right/);
});
