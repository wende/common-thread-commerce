import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createBrowserCatalog, browserMenuRequest } from '../tools/browser-catalog.mjs';

const store = { id: '207442', addressId: '999999', slug: 'biedronka-express-kra', open: true, enabled: true, name: 'Selected browser branch' };
const profile = { headers: { 'glovo-delivery-location-latitude': '50', 'glovo-delivery-location-longitude': '20' } };
function fixture({ status = 200, changed = false } = {}) {
  const calls = [];
  const evaluateImpl = async (_, fn, args) => {
    calls.push({ fn: fn.name, args });
    if (args.action === 'inspect') return { store: { ...store, addressId: changed ? '888888' : store.addressId }, open: true, enabled: true };
    return { status, text: '{"type":"PRODUCT_TILE","data":{"id":4611686018932096633,"name":"Passata"}}' };
  };
  return { catalog: createBrowserCatalog({ page: {}, store, profile, evaluateImpl, minIntervalMs: 0 }), calls };
}

test('browser catalog uses the mounted address exactly, never re-resolves the slug, and preserves large IDs', async () => {
  const f = fixture();
  assert.deepEqual(await f.catalog.getStore(), store);
  const root = await f.catalog.getRoot();
  assert.equal(root.data.id, '4611686018932096633');
  const requests = f.calls.filter(call => call.fn === 'browserMenuRequest');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].args.path, '/v4/stores/207442/addresses/999999/content/main');
  assert.ok(!f.calls.some(call => call.args.path?.startsWith('/v3/')));
  assert.equal(Object.keys(requests[0].args.headers).some(key => /authorization|cookie/i.test(key)), false);
});

test('changing Chrome branch or following another branch route stops before fetching', async () => {
  const changed = fixture({ changed: true });
  await assert.rejects(changed.catalog.getRoot(), /branch changed/);
  assert.ok(!changed.calls.some(call => call.fn === 'browserMenuRequest'));
  const f = fixture();
  assert.throws(() => f.catalog.getContent('/v4/stores/207442/addresses/336099/content/main'), /this store and address/);
  assert.equal(f.calls.length, 0);
});

test('browser menu HTTP errors are not retried', async () => {
  const f = fixture({ status: 429 });
  await assert.rejects(f.catalog.getRoot(), /HTTP 429/);
  assert.equal(f.calls.filter(call => call.fn === 'browserMenuRequest').length, 1);
});

test('the menu request actually executes fetch in the page and returns raw text without provider credentials', async () => {
  const calls = [];
  const context = vm.createContext({ location: { hostname: 'glovoapp.com' }, AbortSignal,
    fetch: async (url, options) => { calls.push({ url, options }); return { status: 200, ok: true, text: async () => '{"id":4611686018932096633}' }; } });
  const input = { path: '/v4/stores/207442/addresses/999999/content/main', headers: profile.headers };
  const response = await vm.runInContext(`(${browserMenuRequest.toString()})(${JSON.stringify(input)})`, context);
  assert.equal(response.text, '{"id":4611686018932096633}');
  assert.equal(calls[0].url, 'https://api.glovoapp.com' + input.path);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.credentials, 'omit');
});
