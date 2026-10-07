#!/usr/bin/env node
// Native Glovo guest HTTP requests only. No browser, browser cookies or account tokens.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const API = 'https://api.glovoapp.com';
export const PUBLIC_PROFILE_HEADERS = Object.freeze(['glovo-app-platform', 'glovo-client-info', 'glovo-app-type',
  'glovo-app-development-state', 'glovo-app-context', 'glovo-app-version', 'glovo-language-code',
  'glovo-location-city-code', 'glovo-location-country-code', 'glovo-api-version',
  'glovo-delivery-location-longitude', 'glovo-delivery-location-latitude', 'glovo-delivery-location-accuracy']);
const allowedHeaders = new Set(PUBLIC_PROFILE_HEADERS);
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ł/gi, 'l').toLowerCase().replace(/[®™‎]/g, '').trim();
const clone = value => JSON.parse(JSON.stringify(value));

export function profileHeaders(profile) {
  if (!profile?.headers || typeof profile.headers !== 'object' || Array.isArray(profile.headers))
    throw new Error('A profile needs public client headers and the selected delivery coordinates.');
  for (const [key, value] of Object.entries(profile.headers)) {
    if (!allowedHeaders.has(key) || typeof value !== 'string' || /[\r\n]/.test(value))
      throw new Error(`Unsupported profile header: ${key}. Cookies and authorization are not accepted.`);
  }
  for (const [key, maximum] of [['latitude', 90], ['longitude', 180]]) {
    const raw = profile.headers[`glovo-delivery-location-${key}`];
    if (!raw?.trim() || !Number.isFinite(Number(raw)) || Math.abs(Number(raw)) > maximum)
      throw new Error(`A valid delivery ${key} is required.`);
  }
  return { ...profile.headers };
}

export function menuProducts(content) {
  const products = new Map();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (/^PRODUCT_/.test(value.type) && value.data?.id && value.data.name) {
      products.set(String(value.data.id), value.data); return;
    }
    Object.values(value).forEach(visit);
  }
  visit(content); return products;
}

export function selectProducts(menu, requested) {
  if (!Array.isArray(requested) || !requested.length || requested.length > 20)
    throw new Error('Request 1–20 products with explicit required choices.');
  const selected = requested.map(item => {
    if (!item || !Number.isInteger(item.quantity ?? 1) || (item.quantity ?? 1) < 1 || (item.quantity ?? 1) > 20)
      throw new Error('Quantity must be an integer from 1 to 20.');
    const candidates = [...menu.values()].filter(product => item.productId !== undefined
      ? String(product.id) === String(item.productId) : item.name && normalize(product.name) === normalize(item.name));
    if (candidates.length !== 1) throw new Error(`The menu has ${candidates.length} exact candidates for the requested product.`);
    const product = candidates[0];
    if (!product.storeProductId) throw new Error('The product has no native store identity.');
    return { product, quantity: item.quantity ?? 1, customizations: optionPayload(product, item.choices ?? []) };
  });
  if (new Set(selected.map(item => String(item.product.id))).size !== selected.length)
    throw new Error('Request each product once, with its intended quantity.');
  return selected;
}

export function optionPayload(product, choices) {
  if (!Array.isArray(choices) || choices.length > 100) throw new Error('choices must be an array of at most 100 options.');
  const groups = product.attributeGroups || [], seen = new Set(), counts = new Map();
  const result = choices.map(input => {
    const choice = typeof input === 'string' ? { name: input } : input;
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)) throw new Error('Each choice needs a name or IDs.');
    const candidates = groups.flatMap(group => {
      if (choice.groupId !== undefined && String(group.id) !== String(choice.groupId)) return [];
      if (choice.group !== undefined && normalize(group.name) !== normalize(choice.group)) return [];
      return (group.attributes || []).filter(attribute =>
        (choice.attributeId !== undefined ? String(attribute.id) === String(choice.attributeId) : Boolean(choice.name)) &&
        (choice.name === undefined || normalize(attribute.name) === normalize(choice.name)))
        .map(attribute => ({ group, attribute }));
    });
    if (candidates.length !== 1) throw new Error('A selected option is invalid or ambiguous for this product.');
    const { group, attribute } = candidates[0], groupId = String(group.id), key = `${groupId}:${attribute.id}`;
    if (seen.has(key)) throw new Error('An option was selected more than once.');
    const quantity = choice.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100 || (!group.multipleSelection && quantity !== 1))
      throw new Error('Invalid option quantity.');
    seen.add(key); counts.set(groupId, (counts.get(groupId) || 0) + quantity);
    return { ids: { externalId: attribute.externalId || '', groupLegacyId: groupId, groupId,
      groupExternalId: String(group.externalId ?? ''), groupPosition: group.position ?? 0, legacyId: String(attribute.id) },
      name: group.name, quantity: { increments: quantity }, customizationName: attribute.name, groupName: group.name };
  });
  for (const group of groups) {
    const count = counts.get(String(group.id)) || 0;
    if (count < (group.min ?? 0) || count > (group.max ?? 1))
      throw new Error(`Choose ${group.min ?? 0}–${group.max ?? 1} options for ${group.name || 'the required group'}.`);
  }
  return result;
}

const optionSignature = choices => JSON.stringify((choices || []).map(choice => [
  String(choice.ids?.groupLegacyId ?? choice.ids?.groupId), String(choice.ids?.legacyId), choice.quantity?.increments,
]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
const publicChoices = choices => (choices || []).map(choice => ({ group: choice.groupName, name: choice.customizationName,
  quantity: choice.quantity.increments }));

export function nativeUpdate(basket, store, selected) {
  const product = selected.product;
  if ((basket.products || []).some(line => String(line.ids?.id) === String(product.id)))
    throw new Error('This fresh guest basket already contains the next product. Reconcile instead of adding again.');
  const payload = {};
  for (const key of ['basketId', 'basketVersion', 'customerId', 'productSuggestions', 'basketPrice',
    'isPrimeSubscriptionSimulated', 'cityCode', 'usingDhBasket', 'operationError', 'status'])
    if (basket[key] !== undefined) payload[key] = clone(basket[key]);
  return { ...payload, handlingStrategy: 'DELIVERY', storeAddressId: store.addressId,
    storeCategoryId: store.categoryId ?? null, storeId: store.id,
    products: [...(basket.products || []).map(line => ({ ids: clone(line.ids),
      quantity: clone(line.quantity), customizations: clone(line.customizations || []) })),
    { ids: { id: String(product.id), externalId: product.externalId, legacyId: String(product.id),
      storeProductId: product.storeProductId }, quantity: { increments: selected.quantity }, customizations: clone(selected.customizations || []) }] };
}

export function matchesSelected(basket, selected) {
  const expected = new Map(selected.map(item => [String(item.product.id), item]));
  if (!Array.isArray(basket?.products) || basket.products.length !== expected.size) return false;
  const seen = new Set();
  return basket.products.every(line => {
    const id = String(line.ids?.id);
    if (seen.has(id)) return false;
    seen.add(id);
    const item = expected.get(id);
    return item?.quantity === line.quantity?.increments && optionSignature(item.customizations) === optionSignature(line.customizations);
  });
}

export class GuestHttpClient {
  constructor(profile, { fetchImpl = fetch, identity } = {}) {
    this.baseHeaders = profileHeaders(profile); this.fetch = fetchImpl; this.requests = [];
    this.identity = identity || { customerId: (-1n - (randomBytes(8).readBigUInt64BE() & ((1n << 52n) - 1n))).toString(),
      clientId: randomUUID(), sessionId: randomUUID(), deviceId: randomUUID(), startedAt: Date.now() };
    if (!/^-\d+$/.test(this.identity.customerId) || !Number.isSafeInteger(Number(this.identity.customerId)))
      throw new Error('Only this experiment’s safely represented negative guest identity is accepted.');
  }
  async request(method, path, body) {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Only relative native API paths are accepted.');
    const headers = { ...this.baseHeaders, accept: 'application/json', origin: 'https://glovoapp.com',
      referer: 'https://glovoapp.com/', 'glovo-request-id': randomUUID(),
      'glovo-perseus-session-id': this.identity.sessionId, 'glovo-perseus-client-id': this.identity.clientId,
      'glovo-perseus-session-timestamp': String(this.identity.startedAt),
      'glovo-dynamic-session-id': this.identity.sessionId, 'glovo-device-urn': `glv:device:${this.identity.deviceId}`,
      'glovo-delivery-location-timestamp': String(Date.now()) };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const entry = { method, endpoint: path.replace(/\/guest\/customers\/[^/]+/, '/guest/customers/[own-guest]')
      .replace(/\/baskets\/(?!stores(?:\/|$))[^/?]+/g, '/baskets/[basket]'), startedAt: new Date().toISOString() };
    this.requests.push(entry);
    const response = await this.fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error', signal: AbortSignal.timeout(25000) });
    entry.status = response.status;
    let data;
    try { data = await response.json(); } catch { throw new Error(`Native ${method} returned a non-JSON response (${response.status}).`); }
    if (!response.ok) {
      const detail = typeof data.error === 'string' ? data.error : data.error?.message || 'Native API rejected the request';
      throw Object.assign(new Error(`Native ${method} failed (${response.status}): ${detail}`), { status: response.status });
    }
    return data;
  }
  basketPath(store) {
    return `/v2/guest/customers/${this.identity.customerId}/baskets/stores/${encodeURIComponent(store.id)}?storeAddressId=${encodeURIComponent(store.addressId)}`;
  }
}

export async function createBasket({ profile, slug, requested, fetchImpl, checkpoint = async () => {} }) {
  if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) throw new Error('Use a native store slug.');
  const client = new GuestHttpClient(profile, { fetchImpl });
  const store = await client.request('GET', `/v3/stores/${slug}?includeClosed=true&includeDisabled=true`);
  if (!store.open || !store.enabled || !store.id || !store.addressId || store.slug !== slug)
    throw new Error('The selected native store is unavailable or did not match the slug.');
  const menu = menuProducts(await client.request('GET', `/v4/stores/${store.id}/addresses/${store.addressId}/content/main`));
  const selected = selectProducts(menu, requested);
  return createBasketFromSelected({ client, profile, store, selected, checkpoint });
}

// Reuse the same verified guest writer after a lazy catalog has been hydrated.
// Revalidate every native product and customization before the first basket request.
export async function createBasketFromSelected({ client, profile, store, selected, checkpoint = async () => {} }) {
  if (!(client instanceof GuestHttpClient) || !store?.id || !store.addressId || store.open === false || store.enabled === false)
    throw new Error('A guest client and an available native store are required.');
  if (!Array.isArray(selected) || !selected.length) throw new Error('Select products before creating the basket.');
  const requested = selected.map(item => ({ productId: String(item.product?.id), quantity: item.quantity,
    choices: (item.customizations || []).map(choice => ({ groupId: choice.ids?.groupLegacyId ?? choice.ids?.groupId,
      attributeId: choice.ids?.legacyId, quantity: choice.quantity?.increments })) }));
  selected = selectProducts(new Map(selected.map(item => [String(item.product?.id), item.product])), requested);
  let basket = await client.request('GET', client.basketPath(store));
  if (!basket.basketId || String(basket.customerId) !== client.identity.customerId || (basket.products || []).length)
    throw new Error('The new guest identity did not receive an empty basket.');
  const state = { schema: 'glovo-http-session/v1', phase: 'prepared', profile: profile || { headers: client.baseHeaders }, identity: client.identity,
    store: { id: store.id, addressId: store.addressId, name: store.name, slug: store.slug },
    selected, basket, requests: client.requests };
  await checkpoint(state);
  try {
    for (const item of selected) {
      const payload = nativeUpdate(basket, store, item);
      state.phase = 'write_pending'; state.pendingProductId = String(item.product.id); await checkpoint(state);
      basket = await client.request('PUT', `/v2/guest/customers/${client.identity.customerId}/baskets/${encodeURIComponent(basket.basketId)}`, payload);
      if (!matchesSelected(basket, selected.slice(0, selected.indexOf(item) + 1)))
        throw new Error('Glovo did not confirm the requested quantity; further writes stopped.');
      state.basket = basket; state.phase = 'partial'; delete state.pendingProductId; await checkpoint(state);
    }
    basket = await client.request('GET', client.basketPath(store));
    if (!matchesSelected(basket, selected)) throw new Error('Fresh HTTP basket verification did not match all requested items.');
    state.basket = basket; state.phase = 'complete'; await checkpoint(state);
  } catch (error) {
    state.phase = 'unknown'; state.error = error.message; await checkpoint(state);
    throw error; // Never resend a PUT automatically, including after timeout or partial success.
  }
  const portable = { schema: 'glovo-basket/v1', id: randomUUID(), sourceSessionId: `http:${client.identity.sessionId}`,
    store: { id: String(store.id), addressId: String(store.addressId), name: store.name, slug: store.slug },
    items: selected.map(item => ({ productId: String(item.product.id), quantity: item.quantity,
      choices: (item.customizations || []).map(choice => ({ groupId: choice.ids.groupLegacyId,
        attributeId: choice.ids.legacyId, quantity: choice.quantity.increments })) })) };
  return { portable, state, summary: { status: 'complete', transport: 'node-fetch-http-only', store: portable.store,
    products: basket.products.map(line => ({ name: line.name, productId: String(line.ids.id), quantity: line.quantity.increments,
      choices: publicChoices(line.customizations) })),
    total: basket.basketPrice?.totalFormatted || basket.basketPrice?.final?.formatted || null,
    requests: client.requests, freshGuestIdentity: true, browserCookiesUsed: false, accountTokensUsed: false } };
}

export async function verifyBasket(state, { fetchImpl = fetch } = {}) {
  if (state?.schema !== 'glovo-http-session/v1') throw new Error('Use this script’s private session state.');
  const client = new GuestHttpClient(state.profile, { fetchImpl, identity: state.identity });
  const basket = await client.request('GET', client.basketPath(state.store));
  return { matches: matchesSelected(basket, state.selected), products: (basket.products || []).map(line => ({
    name: line.name, productId: String(line.ids.id), quantity: line.quantity.increments, choices: publicChoices(line.customizations) })),
    total: basket.basketPrice?.totalFormatted || basket.basketPrice?.final?.formatted || null, requests: client.requests };
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    profile: { type: 'string' }, store: { type: 'string' }, item: { type: 'string', multiple: true },
    'items-file': { type: 'string' },
    output: { type: 'string' }, session: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help || !positionals.length) {
    console.log('Create: node glovo/tools/http-basket.mjs create --profile location-profile.json --store mcdonald-s-kra --item "McChicken" --item "Chikker" --output basket.json\nOptions: replace --item with --items-file items.json (JSON array of {name or productId, quantity, choices:[{groupId,attributeId} or option name]}).\nVerify: node glovo/tools/http-basket.mjs verify --session basket.json.session.json\nProfile: {"headers":{public native client headers and delivery latitude/longitude}}. No cookies or account tokens. Output is compatible with glovoBridge.importBasket({basket}).'); return;
  }
  if (positionals[0] === 'verify') {
    if (!values.session) throw new Error('--session is required.');
    const result = await verifyBasket(JSON.parse(await readFile(resolve(values.session), 'utf8')));
    console.log(JSON.stringify(result, null, 2)); if (!result.matches) process.exitCode = 2; return;
  }
  if (positionals[0] !== 'create' || !values.profile || !values.store || !values.output ||
      (!values.item?.length && !values['items-file']) || (values.item?.length && values['items-file']))
    throw new Error('Use create with --profile, --store, --item or --items-file, and --output.');
  const requested = values['items-file'] ? JSON.parse(await readFile(resolve(values['items-file']), 'utf8'))
    : values.item.map(name => ({ name, quantity: 1 }));
  const output = resolve(values.output), statePath = `${output}.session.json`;
  await writeFile(output, '', { flag: 'wx', mode: 0o600 });
  await writeFile(statePath, '', { flag: 'wx', mode: 0o600 });
  const checkpoint = async state => {
    const temporary = `${statePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temporary, statePath);
  };
  const result = await createBasket({ profile: JSON.parse(await readFile(resolve(values.profile), 'utf8')), slug: values.store,
    requested, checkpoint });
  await writeFile(output, JSON.stringify(result.portable, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ ...result.summary, portablePath: output, privateStatePath: statePath }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(JSON.stringify({ error: error.message, automaticWriteRetries: false })); process.exitCode = 1; });
