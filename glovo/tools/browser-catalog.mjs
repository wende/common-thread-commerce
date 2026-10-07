import { contentPath, parseLosslessJson } from './basket-constructor.mjs';
import { profileHeaders } from './http-basket.mjs';
import { browserCart } from './chrome-cart.mjs';
import { evaluate } from './chrome-driver.mjs';

// Serialized into Chrome. Return raw text so Node can preserve Glovo's 64-bit IDs.
export async function browserMenuRequest({ path, headers }) {
  if (location.hostname !== 'glovoapp.com') throw new Error('Open the selected Glovo store page.');
  const response = await fetch('https://api.glovoapp.com' + path, {
    method: 'GET', headers, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(25000),
  });
  return { status: response.status, text: response.ok ? await response.text() : '' };
}

// The mounted page supplies the store/address IDs. Never resolve the slug again in Node.
// Jev remains in Node; all catalog GETs execute in this Chrome tab.
export function createBrowserCatalog({ page, store, profile, evaluateImpl = evaluate, minIntervalMs = 300 }) {
  if (!/^[a-z0-9-]+$/.test(store?.slug || '') || !/^\d+$/.test(String(store?.id)) || !/^\d+$/.test(String(store?.addressId)) ||
      !store.open || !store.enabled || !Number.isFinite(minIntervalMs) || minIntervalMs < 0)
    throw new Error('Use the open store and delivery branch mounted in Chrome.');
  store = structuredClone(store);
  const headers = { ...profileHeaders(profile), accept: 'application/json' };
  let pending = Promise.resolve(), lastStart = 0;
  const assertBranch = async () => {
    const current = await evaluateImpl(page, browserCart, { action: 'inspect' });
    if (String(current.store.id) !== String(store.id) || String(current.store.addressId) !== String(store.addressId) ||
        current.store.slug !== store.slug || !current.open || !current.enabled)
      throw new Error('The selected Chrome store or delivery branch changed. No further catalog reads or basket writes sent.');
  };
  const read = path => {
    path = contentPath(path, store);
    const task = pending.then(async () => {
      const delay = minIntervalMs - (Date.now() - lastStart);
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      await assertBranch(); lastStart = Date.now();
      const response = await evaluateImpl(page, browserMenuRequest, { path, headers });
      if (response.status < 200 || response.status >= 300)
        throw new Error(`Glovo browser menu GET failed (HTTP ${response.status}). No retry sent.`);
      return parseLosslessJson(response.text);
    });
    pending = task.catch(() => {}); return task;
  };
  return {
    async getStore() { await assertBranch(); return structuredClone(store); },
    getRoot() { return read(`/v4/stores/${store.id}/addresses/${store.addressId}/content/main`); },
    getContent(path) { return read(path); },
  };
}
