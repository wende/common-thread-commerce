import assert from 'node:assert/strict';
import test from 'node:test';
import { createBasket, verifyBasket, profileHeaders, GuestHttpClient, menuProducts, selectProducts, optionPayload, matchesSelected } from './http-basket.mjs';

const profile = { headers: { 'glovo-delivery-location-latitude': '50', 'glovo-delivery-location-longitude': '20' } };
const store = { id: 77, addressId: 21, categoryId: 1, slug: 'test-store', name: 'Test', open: true, enabled: true };
const product = (id, name) => ({ id, name, externalId: id, storeProductId: `uuid-${id}`, attributeGroups: [] });
function fixture({ failPut, unconfirmedPut, initialProducts = [], menu = [product('1', 'McChicken®'), product('2', 'Chikker')] } = {}) {
  const requests = [];
  let basket, puts = 0;
  const fetchImpl = async (url, options) => {
    requests.push({ url, ...options });
    const path = new URL(url).pathname;
    const response = (data, status = 200) => ({ status, ok: status < 400, json: async () => structuredClone(data) });
    if (path.startsWith('/v3/')) return response(store);
    if (path.startsWith('/v4/')) return response({ data: { sections: menu.map(data => ({ type: 'PRODUCT_ROW', data })) } });
    if (!basket) basket = { basketId: 'own-basket', customerId: Number(path.split('/')[4]), basketVersion: 0,
      storeId: 77, storeAddressId: 21, products: initialProducts, status: 'DRAFT', basketPrice: { totalFormatted: '32,10 zł' } };
    if (options.method === 'PUT') {
      puts++;
      if (puts === failPut) throw new Error('Network timeout');
      const payload = JSON.parse(options.body);
      basket = { ...basket, basketVersion: basket.basketVersion + 1,
        products: payload.products.map(line => ({ ...line, name: menu.find(product => product.id === line.ids.id).name })) };
      if (puts === unconfirmedPut) basket.products[0].quantity.increments = 7;
      return response(basket, puts === 1 ? 201 : 200);
    }
    return response(basket);
  };
  return { fetchImpl, requests, puts: () => puts };
}
const requested = [{ name: 'McChicken', quantity: 1 }, { name: 'Chikker', quantity: 1 }];

test('HTTP creation discovers the menu, persists two products and exports a credential-free manifest', async () => {
  const f = fixture(), checkpoints = [];
  const result = await createBasket({ profile, slug: store.slug, requested, fetchImpl: f.fetchImpl,
    checkpoint: async state => checkpoints.push(structuredClone(state)) });
  assert.deepEqual(f.requests.map(request => request.method), ['GET', 'GET', 'GET', 'PUT', 'PUT', 'GET']);
  assert.equal(result.state.phase, 'complete');
  assert.deepEqual(result.portable.items, [{ productId: '1', quantity: 1, choices: [] }, { productId: '2', quantity: 1, choices: [] }]);
  assert.deepEqual(checkpoints.map(state => state.phase), ['prepared', 'write_pending', 'partial', 'write_pending', 'partial', 'complete']);
  const firstWrite = JSON.parse(f.requests[3].body), secondWrite = JSON.parse(f.requests[4].body);
  assert.equal(firstWrite.basketVersion, 0); assert.equal(secondWrite.basketVersion, 1);
  assert.equal(secondWrite.products.length, 2);
  for (const request of f.requests) {
    assert.equal(new URL(request.url).origin, 'https://api.glovoapp.com');
    assert.equal(request.redirect, 'error');
    assert.ok(!Object.keys(request.headers).some(key => /cookie|authorization/i.test(key)));
  }
  assert.ok(!/customerId|basketId|latitude|longitude|deviceId|clientId/.test(JSON.stringify(result.portable)));
  assert.ok(!JSON.stringify(result.summary.requests).includes(result.state.identity.customerId));
  assert.ok(!JSON.stringify(result.summary.requests).includes('own-basket'));
  const before = f.requests.length;
  assert.equal((await verifyBasket(result.state, { fetchImpl: f.fetchImpl })).matches, true);
  assert.deepEqual(f.requests.slice(before).map(request => request.method), ['GET']);
});

test('guest IDs round-trip through the server JSON number without losing precision', () => {
  const ids = new Set();
  for (let count = 0; count < 100; count++) {
    const client = new GuestHttpClient(profile);
    assert.ok(Number(client.identity.customerId) < 0);
    assert.equal(String(JSON.parse(JSON.stringify(Number(client.identity.customerId)))), client.identity.customerId);
    ids.add(client.identity.customerId);
  }
  assert.equal(ids.size, 100);
  assert.throws(() => new GuestHttpClient(profile, { identity: { customerId: '-9223372036854775807' } }), /safely represented/);
});

test('a timed-out second write saves an uncertain checkpoint and never resends', async () => {
  const f = fixture({ failPut: 2 }), checkpoints = [];
  await assert.rejects(createBasket({ profile, slug: store.slug, requested, fetchImpl: f.fetchImpl,
    checkpoint: async state => checkpoints.push(structuredClone(state)) }), /Network timeout/);
  assert.equal(f.puts(), 2);
  const last = checkpoints.at(-1);
  assert.equal(last.phase, 'unknown'); assert.equal(last.pendingProductId, '2');
  assert.equal(last.basket.products.length, 1);
  assert.equal((await verifyBasket(last, { fetchImpl: f.fetchImpl })).matches, false);
  assert.equal(f.puts(), 2);
});

test('an unconfirmed quantity stops before the next product', async () => {
  const f = fixture({ unconfirmedPut: 1 });
  await assert.rejects(createBasket({ profile, slug: store.slug, requested, fetchImpl: f.fetchImpl }), /did not confirm/);
  assert.equal(f.puts(), 1);
});

test('an occupied guest basket is rejected before any write', async () => {
  const f = fixture({ initialProducts: [{ ids: { id: '1' }, quantity: { increments: 1 } }] });
  await assert.rejects(createBasket({ profile, slug: store.slug, requested, fetchImpl: f.fetchImpl }), /empty basket/);
  assert.equal(f.puts(), 0);
});

test('missing required choices are rejected before basket creation', async () => {
  const food = product('1', 'McChicken'); food.attributeGroups = [{ min: 1 }];
  const f = fixture({ menu: [food] });
  await assert.rejects(createBasket({ profile, slug: store.slug, requested: [requested[0]], fetchImpl: f.fetchImpl }), /Choose/);
  assert.equal(f.requests.length, 2); assert.equal(f.puts(), 0);
});

const coffee = () => ({ ...product('3', 'Kawa z Mlekiem Mała'), attributeGroups: [
  { id: 'size', name: 'Size', externalId: 'size-external', position: 0, min: 1, max: 1,
    attributes: [{ id: 'small', externalId: 'small-external', name: 'Small' }, { id: 'large', name: 'Large' }] },
  { id: 'cup', name: 'Cup', min: 1, max: 1, attributes: [{ id: 'sup', name: 'Standard cup' }] },
] });

test('configured coffee survives native writes and fresh verification; different options are rejected', async () => {
  const f = fixture({ menu: [coffee(), product('4', 'Ciastko Jabłkowe')] });
  const requested = [{ productId: '3', quantity: 1, choices: ['Small', { groupId: 'cup', attributeId: 'sup' }] },
    { productId: '4', quantity: 1 }];
  const result = await createBasket({ profile, slug: store.slug, requested, fetchImpl: f.fetchImpl });
  assert.equal(result.state.phase, 'complete');
  assert.deepEqual(result.portable.items[0].choices, [{ groupId: 'size', attributeId: 'small', quantity: 1 },
    { groupId: 'cup', attributeId: 'sup', quantity: 1 }]);
  const payload = JSON.parse(f.requests.find(request => request.method === 'PUT').body);
  assert.equal(payload.products[0].customizations[0].ids.groupExternalId, 'size-external');
  assert.equal(payload.products[0].customizations[0].ids.externalId, 'small-external');
  assert.equal((await verifyBasket(result.state, { fetchImpl: f.fetchImpl })).matches, true);
  const changed = structuredClone(result.state.basket);
  changed.products[0].customizations[0].ids.legacyId = 'large';
  assert.equal(matchesSelected(changed, result.state.selected), false);
  changed.products[0].customizations = [];
  assert.equal(matchesSelected(changed, result.state.selected), false);
});

test('option validation rejects missing, ambiguous, duplicated, conflicting and excessive choices', () => {
  const item = coffee();
  assert.throws(() => optionPayload(item, ['Small']), /Choose/);
  assert.throws(() => optionPayload(item, ['Small', 'Small', 'Standard cup']), /more than once/);
  assert.throws(() => optionPayload(item, ['Small', 'Large', 'Standard cup']), /Choose/);
  assert.throws(() => optionPayload(item, [{ groupId: 'size', attributeId: 'small', name: 'Large' }, 'Standard cup']), /invalid or ambiguous/);
  assert.throws(() => optionPayload(item, [{ groupId: 'size', attributeId: 'small', quantity: 2 }, 'Standard cup']), /quantity/);
  item.attributeGroups[1].attributes.push({ id: 'other', name: 'Small' });
  assert.throws(() => optionPayload(item, ['Small', 'Standard cup']), /invalid or ambiguous/);
});

test('ambiguous names, duplicate products and invalid quantities do not become implicit selections', () => {
  const menu = menuProducts([{ type: 'PRODUCT_ROW', data: product('1', 'Coffee') }, { type: 'PRODUCT_ROW', data: product('2', 'Coffee') }]);
  assert.throws(() => selectProducts(menu, [{ name: 'Coffee' }]), /2 exact candidates/);
  assert.throws(() => selectProducts(menu, [{ productId: '1' }, { productId: '1' }]), /each product once/);
  assert.throws(() => selectProducts(menu, [{ productId: '1', quantity: 0 }]), /Quantity/);
});

test('profiles reject auth material, header injection and invalid delivery coordinates', () => {
  for (const name of ['cookie', 'authorization', 'glovo-perseus-session-id'])
    assert.throws(() => profileHeaders({ headers: { ...profile.headers, [name]: 'secret' } }), /Unsupported profile header/);
  assert.throws(() => profileHeaders({ headers: { ...profile.headers, 'glovo-app-platform': 'web\r\nInjected: header' } }), /Unsupported/);
  assert.throws(() => profileHeaders({ headers: { ...profile.headers, 'glovo-delivery-location-latitude': '91' } }), /latitude/);
});
