// Self-contained function serialized into Chrome. It never receives an OpenRouter key.
export async function browserCart(input) {
  if (location.hostname !== 'glovoapp.com') throw new Error('Open a Glovo store page.');
  const slug = decodeURIComponent(location.pathname.match(/\/stores\/([^/]+)/)?.[1] || '');
  const element = [...document.querySelectorAll('body *')].find(node => Object.keys(node).some(key => key.startsWith('__reactFiber$')));
  let root = element?.[Object.keys(element).find(key => key.startsWith('__reactFiber$'))];
  while (root?.return) root = root.return;
  root = root?.stateNode?.current || root;
  let store, sdk;
  const stack = root ? [root] : [];
  for (let visited = 0; stack.length && visited < 20000; visited++) {
    const fiber = stack.pop(), props = fiber.memoizedProps;
    if (props?.store?.slug === slug && props.initialStoreContent) store = props.store;
    let hook = fiber.memoizedState;
    for (let i = 0; hook && i < 100; i++, hook = hook.next) {
      const value = Array.isArray(hook.memoizedState) ? hook.memoizedState[0] : hook.memoizedState;
      if (value?.getBasketByStore && value?.getBaskets && value?.addProduct) sdk = value;
    }
    if (fiber.sibling) stack.push(fiber.sibling);
    if (fiber.child) stack.push(fiber.child);
  }
  if (!store || !sdk) throw new Error('The store menu and native cart are not mounted yet.');
  const publicStore = { id: String(store.id), addressId: String(store.addressId), slug: store.slug, name: store.name };
  if (input.action === 'inspect') return { store: { ...publicStore, categoryId: store.categoryId ?? null,
    open: store.open, enabled: store.enabled }, open: store.open, enabled: store.enabled };
  if (String(input.store?.id) !== publicStore.id || String(input.store?.addressId) !== publicStore.addressId || input.store.slug !== slug)
    throw new Error('The browser and catalog delivery branches differ. No writes sent.');
  if (!store.open || !store.enabled) throw new Error('The store is closed or disabled.');
  const signature = choices => JSON.stringify((choices || []).map(choice => [
    String(choice.ids?.groupLegacyId ?? choice.ids?.groupId), String(choice.ids?.legacyId), choice.quantity?.increments ?? 1,
  ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  const lineKey = line => JSON.stringify([String(line.ids?.id), signature(line.customizations)]);
  const quantities = lines => {
    const result = new Map();
    for (const line of lines || []) {
      const key = lineKey(line); result.set(key, (result.get(key) || 0) + (line.quantity?.increments || 0));
    }
    return result;
  };
  const equal = (expected, basket) => {
    const actual = quantities(basket?.products);
    return expected.size === actual.size && [...expected].every(([key, quantity]) => actual.get(key) === quantity);
  };
  const summary = basket => ({ store: publicStore, total: basket?.basketPrice?.totalFormatted || basket?.basketPrice?.final?.formatted || null,
    products: (basket?.products || []).map(line => ({ productId: String(line.ids?.id), name: line.name,
      quantity: line.quantity?.increments, options: signature(line.customizations) })) });
  const timed = async promise => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Native request timed out; do not replay basket writes.')), 15000);
    })]); } finally { clearTimeout(timer); }
  };
  if (input.action === 'read') return summary(await timed(sdk.getBasketByStore(store.id, store.addressId, false)));
  if (input.action !== 'add' || !input.operationId || !Array.isArray(input.selected) || !input.selected.length || input.selected.length > 20)
    throw new Error('Invalid browser basket operation.');
  const rows = input.selected;
  for (const row of rows) {
    if (!row.product?.id || !row.product.storeProductId || row.product.outOfStock || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 20)
      throw new Error('Invalid or unavailable product; no writes sent.');
  }
  const key = 'common-thread-basket:' + input.operationId;
  const fingerprint = JSON.stringify({ store: publicStore, rows });
  const previous = sessionStorage.getItem(key);
  if (previous) {
    const prior = JSON.parse(previous);
    if (prior.fingerprint !== fingerprint) throw new Error('This operation ID has different basket contents.');
    return { ...prior.result, replayed: true, basket: summary(await timed(sdk.getBasketByStore(store.id, store.addressId, false))) };
  }
  if (window.__commonThreadBasketPending) throw new Error('Another basket operation is pending.');
  window.__commonThreadBasketPending = true;
  const record = { fingerprint, result: { status: 'unknown', operationId: input.operationId, writesAttempted: 0 } };
  let basket;
  try {
    // Reserve the operation before any write; reload/reinjection must not resend it.
    sessionStorage.setItem(key, JSON.stringify(record));
    basket = await timed(sdk.getBasketByStore(store.id, store.addressId, false));
    const expected = quantities(basket?.products);
    record.result.before = summary(basket);
    for (const row of rows) {
      const identity = lineKey({ ids: { id: row.product.id }, customizations: row.customizations });
      if ((expected.get(identity) || 0) + row.quantity > 20) throw new Error('Adding to the existing quantity would exceed 20.');
    }
    for (const row of rows) {
      const current = await browserCart({ action: 'inspect' });
      if (current.store.id !== publicStore.id || current.store.addressId !== publicStore.addressId)
        throw new Error('The browser changed its store or delivery branch. Further writes stopped.');
      const product = { ids: { id: String(row.product.id), legacyId: String(row.product.id),
        externalId: row.product.externalId, storeProductId: row.product.storeProductId },
        quantity: { increments: row.quantity }, customizations: row.customizations || [] };
      const identity = lineKey(product), target = (expected.get(identity) || 0) + row.quantity;
      if (target > 20) throw new Error('Adding to the existing quantity would exceed 20.');
      record.result.writesAttempted++;
      sessionStorage.setItem(key, JSON.stringify(record));
      basket = await timed(sdk.addProduct({ handlingStrategy: 'DELIVERY', store, storeId: store.id,
        storeAddressId: store.addressId, storeCategoryId: store.categoryId, product }));
      expected.set(identity, target);
      if (!equal(expected, basket)) throw new Error('The response did not confirm the basket exactly. Further writes stopped.');
      record.result.basket = summary(basket);
      sessionStorage.setItem(key, JSON.stringify(record));
    }
    basket = await timed(sdk.getBasketByStore(store.id, store.addressId, false));
    if (!equal(expected, basket)) throw new Error('Fresh basket verification failed. Do not replay.');
    record.result = { ...record.result, status: 'complete', basket: summary(basket), verified: true };
    sessionStorage.setItem(key, JSON.stringify(record));
    window.__commonThreadBasketPending = false;
    return record.result;
  } catch (error) {
    record.result.error = error.message;
    if (basket) record.result.basket = summary(basket);
    try { sessionStorage.setItem(key, JSON.stringify(record)); } catch {}
    // Retain the in-page lock on uncertain outcomes, including a still-running native promise.
    return record.result;
  }
}
