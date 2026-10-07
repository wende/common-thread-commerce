// Real Chrome/CDP, fully intercepted fixture page: no live Glovo/Jev traffic or purchases.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openChrome, evaluate } from '../tools/chrome-driver.mjs';
import { browserCart } from '../tools/chrome-cart.mjs';
import { createBrowserCatalog } from '../tools/browser-catalog.mjs';

const profile = await mkdtemp(join(tmpdir(), 'glovo-chrome-smoke-'));
let chrome;
const store = { id: 207442, addressId: 336099, slug: 'biedronka-express-kra', name: 'Fixture store', open: true, enabled: true };
const html = `<!doctype html><html><body><div id="menu">Offline native-cart fixture</div><script>
const store=${JSON.stringify(store)};
let basket=JSON.parse(localStorage.getItem('basket')||'null')||{products:[{ids:{id:'existing'},name:'Existing',quantity:{increments:2},customizations:[]}],basketPrice:{totalFormatted:'fixture total'}};
const sdk={getBaskets(){},async getBasketByStore(){return structuredClone(basket)},async addProduct(input){
const old=basket.products.find(line=>line.ids.id===input.product.ids.id);
if(old)old.quantity.increments+=input.product.quantity.increments;else basket.products.push({...input.product,name:'Fixture ingredient'});
localStorage.setItem('basket',JSON.stringify(basket));return structuredClone(basket)}};
document.querySelector('#menu').__reactFiber$fixture={memoizedProps:{store,initialStoreContent:{}},memoizedState:{memoizedState:[sdk]}};
</script></body></html>`;
try {
  chrome = await openChrome({ profile, headless: true });
  let interceptionError;
  chrome.page.onEvent(message => {
    if (message.method === 'Fetch.requestPaused') {
      const api = message.params.request.url.startsWith('https://api.glovoapp.com/');
      const preflight = message.params.request.method === 'OPTIONS';
      chrome.page.send('Fetch.fulfillRequest', {
      requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
      ...(api ? { responseCode: preflight ? 204 : 200, responseHeaders: [
        { name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: 'https://glovoapp.com' },
        { name: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' }, { name: 'Access-Control-Allow-Headers', value: '*' },
      ] } : {}),
      body: Buffer.from(api ? preflight ? '' : '{"type":"PRODUCT_TILE","data":{"id":4611686018932096633,"name":"Passata"}}' : html).toString('base64'),
    }).catch(error => { interceptionError = error; });
    }
  });
  await chrome.page.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await chrome.page.send('Page.navigate', { url: 'https://glovoapp.com/en/pl/krakow/stores/biedronka-express-kra' });
  let inspected;
  for (let i = 0; i < 40; i++) {
    try { inspected = await evaluate(chrome.page, browserCart, { action: 'inspect' }); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.equal(interceptionError, undefined); assert.equal(inspected.store.id, '207442');
  const catalog = createBrowserCatalog({ page: chrome.page, store: inspected.store,
    profile: { headers: { 'glovo-delivery-location-latitude': '50', 'glovo-delivery-location-longitude': '20' } } });
  await catalog.getStore();
  const menu = await catalog.getRoot();
  assert.equal(menu.data.id, '4611686018932096633');
  const result = await evaluate(chrome.page, browserCart, { action: 'add', operationId: 'smoke-1', store,
    selected: [{ product: { id: '4611686018932096633', name: 'Fixture ingredient', storeProductId: 'native-id' }, quantity: 1, customizations: [] }] });
  assert.equal(result.status, 'complete'); assert.equal(result.basket.products.length, 2);
  assert.equal(result.basket.products[0].quantity, 2);
  await chrome.page.send('Page.reload');
  let fresh;
  for (let i = 0; i < 40; i++) {
    try { fresh = await evaluate(chrome.page, browserCart, { action: 'read', store }); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.equal(fresh.products.find(line => line.productId === '4611686018932096633').quantity, 1);
  chrome.disconnect();
  // Reconnecting proves Chrome survived the controlling process's disconnect.
  chrome = await openChrome({ profile, headless: true });
  const version = await chrome.browser.send('Browser.getVersion'); assert.ok(version.product.includes('Chrome'));
  console.log(JSON.stringify({ realChrome: version.product, offlineFixture: true, preservedExistingItems: true,
    catalogFetchedInsideChrome: true, exact64BitIds: true, reloadVerified: true, browserSurvivesDisconnect: true, jevRequests: 0, liveBasketWrites: 0 }));
} finally {
  if (chrome) { try { await chrome.browser.send('Browser.close'); } catch {} chrome.disconnect(); }
  await new Promise(resolve => setTimeout(resolve, 500));
  await rm(profile, { recursive: true, force: true });
}
