(() => {
  'use strict';
  if (location.hostname !== 'glovoapp.com') throw new Error('This adapter is for glovoapp.com only.');
  const options = window.__glovoBridgeOptions || {};
  if (options.dock !== undefined && !['left', 'right'].includes(options.dock)) throw new Error('Panel dock must be left or right.');
  if (options.panel !== undefined && ![false, 'hidden', 'visible', 'collapsed'].includes(options.panel)) throw new Error('Panel mode must be visible, hidden or collapsed.');
  if (options.nativeApi !== undefined && typeof options.nativeApi !== 'boolean') throw new Error('nativeApi must be a boolean.');
  const seed = window.glovoBridge?.source === 'shopping-assistant/glovo' ? window.glovoBridge.getOperationLog?.() : null;
  if (window.glovoBridge?.source === 'shopping-assistant/glovo') window.glovoBridge.uninstall();
  const previous = window.glovoBridge;
  const clone = value => JSON.parse(JSON.stringify(value));
  const identifier = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${++sequence}`;
  let sequence = 0;
  const sessionId = seed?.sessionId || identifier(), startedAt = seed?.startedAt || new Date().toISOString();
  const events = seed?.events || [], receipts = new Map((seed?.receipts || []).map(receipt => [receipt.id, receipt]));
  const baselines = new Map((seed?.baselines || []).map(baseline => [baseline.store.id, baseline]));
  // Import replay survives reinjection in this document; a full reload loses the journal.
  const imports = new Map((seed?.imports || []).map(entry => [entry.id, entry]));
  let droppedEvents = seed?.droppedEvents || 0;
  function record(operation, input, result, status, start) {
    const end = Date.now();
    events.push({ id: identifier(), operation, input: clone(input), result: clone(result), status,
      startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString(), durationMs: end - start });
    if (events.length > 200) { events.shift(); droppedEvents++; }
  }
  function baseline(basket) { if (!baselines.has(basket.store.id)) baselines.set(basket.store.id, clone(basket)); }
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .toLocaleLowerCase().replace(/[®™‎]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const aliases = new Map([
    ['chocolate shake', 'shake czekoladowym'], ['chocolate milkshake', 'shake czekoladowym'],
    ['vanilla shake', 'shake waniliowym'], ['vanilla milkshake', 'shake waniliowym'],
    ['strawberry shake', 'shake truskawkowym'], ['strawberry milkshake', 'shake truskawkowym'],
    ['apple pie', 'ciastko jablkowe'], ['small fries', 'frytki male'], ['large fries', 'frytki duze'],
  ]);
  function distance(a, b) {
    let row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1]));
      row = next;
    }
    return row[b.length];
  }
  function matches(entry, query, settings) {
    const name = normalize(entry.data.name), original = normalize(query);
    const alias = settings.aliases !== false && aliases.get(original), terms = (alias || original).split(' ').filter(Boolean);
    if (!terms.length) return { type: 'all', score: 0 };
    if (name === original) return { type: 'exact', score: 1 };
    if (terms.every(term => name.includes(term))) return { type: alias ? 'alias' : 'contains', score: alias ? 0.94 : 0.88 };
    const description = normalize(entry.data.description?.text || entry.data.description || '');
    if (terms.every(term => `${name} ${description}`.includes(term))) return { type: 'description', score: 0.75 };
    if (settings.fuzzy === false) return null;
    const words = name.split(' ');
    const errors = terms.map(term => Math.min(...words.map(word => word.includes(term) ? 0 : distance(term, word))));
    if (errors.some((error, index) => error > (terms[index].length >= 8 ? 2 : terms[index].length >= 4 ? 1 : 0))) return null;
    return { type: 'fuzzy', score: Number((0.8 - 0.04 * errors.reduce((a, b) => a + b, 0)).toFixed(2)) };
  }
  function searchCatalog(entries, input) {
    const settings = typeof input === 'string' ? { query: input } : input;
    const query = settings?.query, limit = settings?.limit ?? 50;
    if (typeof query !== 'string' || query.length > 200) throw new Error('Product query must be a string of at most 200 characters.');
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('limit must be an integer from 1 to 200.');
    for (const flag of ['compact', 'fuzzy', 'aliases']) if (settings[flag] !== undefined && typeof settings[flag] !== 'boolean') throw new Error(`${flag} must be a boolean.`);
    const ranked = [...entries.values()].map((entry, index) => ({ entry, index, match: matches(entry, query, settings) })).filter(item => item.match)
      .sort((a, b) => b.match.score - a.match.score || a.index - b.index);
    const top = ranked[0], exact = top?.match.type === 'exact';
    const unambiguous = exact ? ranked.filter(item => item.match.type === 'exact').length === 1
      : ranked.length === 1 || (top?.match.type !== 'fuzzy' && top?.match.score - ranked[1]?.match.score >= 0.1);
    return { query: query.trim(), status: !top ? 'no_match' : unambiguous ? 'matched' : 'ambiguous',
      selectedProductId: top && unambiguous ? String(top.entry.data.id) : null,
      total: ranked.length, hasMore: ranked.length > limit,
      products: ranked.slice(0, limit).map(({ entry, match }) => {
        const full = publicProduct(entry), kind = /^(mczestaw|zestaw|meal|combo|box)\b/.test(normalize(full.name)) ? 'meal' : 'product';
        const summary = { id: full.id, name: full.name, price: full.price, currency: full.currency, displayPrice: full.displayPrice,
          kind, match, optionsRequired: full.attributeGroups.some(group => group.min > 0), optionGroupCount: full.attributeGroups.length };
        return settings.compact ? summary : { ...full, ...summary };
      }) };
  }
  const searchInput = () => document.querySelector('[data-testid="search-panel-input"]');
  const fiberOf = element => element?.[Object.keys(element).find(key => key.startsWith('__reactFiber$'))];
  function ancestors(element) {
    const result = [];
    for (let fiber = fiberOf(element), depth = 0; fiber && depth < 160; fiber = fiber.return, depth++) result.push(fiber);
    return result;
  }
  function rootFiber() {
    const element = searchInput() || [...document.querySelectorAll('body *')].find(element => fiberOf(element));
    const lineage = ancestors(element);
    const root = lineage[lineage.length - 1];
    if (!root) throw new Error('Glovo React tree could not be located.');
    return root.stateNode?.current || root;
  }
  function* mountedFibers() {
    const stack = [rootFiber()];
    let visited = 0;
    while (stack.length && visited++ < 20000) {
      const fiber = stack.pop();
      yield fiber;
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }
  }
  function searchProps() {
    const input = searchInput();
    if (!input) throw new Error('Glovo search component is not mounted on this page.');
    const current = [...mountedFibers()].find(fiber => fiber.stateNode === input);
    const lineage = [];
    for (let fiber = current; fiber; fiber = fiber.return) lineage.push(fiber);
    const fiber = lineage.find(fiber => typeof fiber.memoizedProps?.onSelectSuggestion === 'function');
    if (!fiber) throw new Error('Glovo search callback could not be located.');
    return fiber.memoizedProps;
  }
  function cartSdk() {
    for (const fiber of mountedFibers()) {
      let hook = fiber.memoizedState;
      for (let index = 0; hook && index < 100; index++, hook = hook.next) {
        const value = Array.isArray(hook.memoizedState) ? hook.memoizedState[0] : hook.memoizedState;
        if (value && typeof value.getBaskets === 'function' && typeof value.getBasketByStore === 'function') return value;
      }
    }
    throw new Error('Glovo cart SDK is not mounted on this page.');
  }
  let nativeAutocomplete;
  function autocomplete() {
    if (nativeAutocomplete) return nativeAutocomplete;
    const queue = window.webpackChunk_N_E;
    if (!Array.isArray(queue)) throw new Error('Glovo webpack runtime was not found.');
    const factories = new Map();
    for (const chunk of queue) for (const [id, factory] of Object.entries(chunk[1] || {})) factories.set(id, factory);
    const serviceId = [...factories].find(([, factory]) => String(factory).includes('/v1/web/search/autocomplete?'))?.[0];
    if (!serviceId) throw new Error('Glovo autocomplete service was not found in the loaded bundles.');
    let require;
    const marker = `glovo_adapter_${crypto.randomUUID()}`;
    const chunk = [[marker], {}, runtime => { require = runtime; }];
    // Ask the existing webpack runtime for its module loader. No replacement bundle is loaded.
    queue.push(chunk);
    const index = queue.indexOf(chunk);
    if (index !== -1) queue.splice(index, 1);
    if (typeof require !== 'function') throw new Error('Glovo module loader was not captured.');
    nativeAutocomplete = Object.values(require(serviceId)).find(value => typeof value === 'function' && String(value).includes('/v1/web/search/autocomplete?'));
    if (!nativeAutocomplete) throw new Error('Glovo autocomplete function was not found.');
    return nativeAutocomplete;
  }
  function queryTerm(query) {
    if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('Pass a non-empty search string of at most 200 characters.');
    return query.trim();
  }
  function storeContext() {
    const slug = location.pathname.match(/\/stores\/([^/]+)/)?.[1];
    if (!slug) throw new Error('Open a Glovo store page to use product and basket tools.');
    for (const fiber of mountedFibers()) {
      const props = fiber.memoizedProps;
      if (props?.store?.slug === decodeURIComponent(slug) && props.initialStoreContent) return props;
    }
    throw new Error('The current store menu has not mounted yet.');
  }
  const storeSummary = store => ({ id: String(store.id), addressId: String(store.addressId), name: store.name, slug: store.slug });
  function catalog(context) {
    const products = new Map();
    const visit = (value, category = '') => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { for (const item of value) visit(item, category); return; }
      const data = value.data;
      if (/^PRODUCT_/.test(value.type) && data?.id && data.name) {
        const key = String(data.id), existing = products.get(key);
        if (existing) { if (category && !existing.categories.includes(category)) existing.categories.push(category); }
        else products.set(key, { data, categories: category ? [category] : [] });
        return;
      }
      const title = data?.title || category;
      for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child, title);
    };
    visit(context.initialStoreContent);
    // Include products loaded after the initial menu (for example, a category change).
    for (const fiber of mountedFibers()) {
      const p = fiber.memoizedProps;
      if (p?.id && p.name && p.storeProductId && p.priceInfo) {
        products.set(String(p.id), { data: p, categories: products.get(String(p.id))?.categories || [] });
      }
    }
    return products;
  }
  function publicProduct({ data, categories }) {
    return {
      id: String(data.id), name: data.name, description: data.description?.text || data.description || '',
      price: data.priceInfo?.amount ?? data.price, currency: data.priceInfo?.currencyCode,
      displayPrice: data.priceInfo?.displayText, categories,
      attributeGroups: (data.attributeGroups || []).map(group => ({
        id: String(group.id ?? group.groupId), name: group.name ?? group.title,
        min: group.min ?? 0, max: group.max ?? 1, multipleSelection: !!group.multipleSelection,
        attributes: (group.attributes || []).map(attribute => ({
          id: String(attribute.id), name: attribute.name, priceImpact: attribute.priceImpact ?? 0,
          displayPrice: attribute.priceInfo?.displayText,
        })),
      })),
    };
  }
  function productEntry(context, id) {
    if (!['string', 'number'].includes(typeof id) || !String(id).trim()) throw new Error('Pass a productId returned by searchProducts.');
    const entry = catalog(context).get(String(id));
    if (!entry) throw new Error('This product is not in the current store’s loaded menu. Search again on this store page.');
    return entry;
  }
  function positiveQuantity(quantity, maximum = 20) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maximum) throw new Error(`Quantity must be an integer from 1 to ${maximum}.`);
    return quantity;
  }
  function customizations(data, choices) {
    if (!Array.isArray(choices)) throw new Error('choices must be an array of { groupId, attributeId, quantity? }.');
    const groups = data.attributeGroups || [], selected = new Map(), result = [];
    for (const input of choices) {
      const choice = typeof input === 'string' ? { name: input } : input;
      if (!choice || typeof choice !== 'object') throw new Error('Each choice needs option IDs or a unique option name.');
      const optionAliases = { small: 'maly', large: 'duzy', 'sup cup': 'kubek oplata sup' };
      const optionName = optionAliases[normalize(choice.name ?? '')] || normalize(choice.name ?? '');
      const candidates = groups.flatMap(group => {
        if (choice.groupId !== undefined && String(group.id ?? group.groupId) !== String(choice.groupId)) return [];
        if (choice.group !== undefined && normalize(group.name ?? group.title) !== normalize(choice.group)) return [];
        return (group.attributes || []).filter(attribute => choice.attributeId !== undefined
          ? String(attribute.id) === String(choice.attributeId) && (!optionName || normalize(attribute.name) === optionName)
          : optionName && normalize(attribute.name) === optionName).map(attribute => ({ group, attribute }));
      });
      if (candidates.length > 1) throw new Error('This option name is ambiguous. Supply its group or IDs.');
      const { group, attribute } = candidates[0] || {};
      if (!attribute) throw new Error('A selected option is not valid for this product.');
      const groupId = String(group.id ?? group.groupId), key = `${groupId}:${attribute.id}`;
      if (selected.has(key)) throw new Error('An option was selected more than once. Use its quantity field instead.');
      const amount = positiveQuantity(choice.quantity ?? 1, 100);
      if (!group.multipleSelection && amount !== 1) throw new Error('This option supports one selection per item.');
      selected.set(key, { groupId, amount });
      result.push({
        ids: { externalId: attribute.externalId || '', groupLegacyId: groupId, groupId,
          groupExternalId: String(group.externalId ?? ''), groupPosition: group.position ?? 0, legacyId: String(attribute.id) },
        name: group.name ?? group.title, quantity: { increments: amount },
        customizationName: attribute.name, groupName: group.name ?? group.title,
      });
    }
    for (const group of groups) {
      const count = [...selected.values()].filter(choice => choice.groupId === String(group.id ?? group.groupId)).reduce((sum, choice) => sum + choice.amount, 0);
      if (count < (group.min ?? 0) || count > (group.max ?? 1)) {
        throw new Error(`Choose ${group.min ?? 0}–${group.max ?? 1} option(s) for “${group.name ?? group.title}”.`);
      }
    }
    return result;
  }
  function basketSummary(basket, store) {
    const products = (basket?.products || []).map(product => ({
      productId: String(product.ids?.id ?? ''), basketProductId: product.ids?.basketProductId,
      name: product.name, quantity: product.quantity?.increments ?? 0,
      customizations: (product.customizations || []).map(choice => ({
        group: choice.groupName || choice.name, name: choice.customizationName,
        quantity: choice.quantity?.increments ?? 1,
      })),
    }));
    return { store: storeSummary(store), lineCount: products.length,
      itemCount: products.reduce((sum, product) => sum + product.quantity, 0),
      total: basket?.basketPrice?.totalFormatted || basket?.basketPrice?.final?.formatted || null, products };
  }
  let mutationPending = false;
  function nativeResult(promise, mutation = false, timeout = 15000) {
    let timer;
    return Promise.race([promise, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(mutation
        ? 'Glovo is still processing the basket update. Its outcome is unknown; read the basket before retrying. Further updates remain blocked until it finishes.'
        : 'Glovo has not answered yet. Try reading again shortly.'), { code: mutation ? 'UNKNOWN_OUTCOME' : 'READ_TIMEOUT' })), timeout);
    })]).finally(() => clearTimeout(timer));
  }
  async function mutate(operation) {
    if (mutationPending) throw new Error('A basket update is already running. Read the basket before trying again.');
    mutationPending = true;
    const pending = new Set();
    // Finish within Runtime.evaluate's 60-second limit, including the initial read.
    const deadline = Date.now() + 45000;
    const write = task => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw Object.assign(new Error('The batch time limit was reached before this write started.'), { code: 'BATCH_TIME_LIMIT' });
      const native = Promise.resolve().then(task); pending.add(native);
      native.then(() => pending.delete(native), () => pending.delete(native));
      return nativeResult(native, true, Math.min(15000, remaining));
    };
    const release = () => {
      if (pending.size) Promise.allSettled([...pending]).then(() => { mutationPending = false; });
      else mutationPending = false;
    };
    // A timed-out step halts the batch; the lock remains until its native promise settles.
    const result = Promise.resolve().then(() => operation(write));
    result.then(release, release);
    return result;
  }
  function batchItems(input) {
    const items = Array.isArray(input) ? input : input?.items;
    if (!Array.isArray(items) || !items.length || items.length > 20) throw new Error('Pass 1–20 items in an array or { items }.');
    return items;
  }
  const signature = choices => JSON.stringify((choices || []).map(choice => [normalize(choice.groupName || choice.name),
    normalize(choice.customizationName), choice.quantity?.increments ?? 1]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  function prepareAdds(items, context) {
    if (!context.store.open || !context.store.enabled) throw new Error('This store is not open for basket additions.');
    const entries = catalog(context);
    return items.map(input => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Pass { productId, quantity?, choices? }.');
      const entry = entries.get(String(input.productId));
      if (!entry) throw new Error('This product is not in the current store’s loaded menu. Search again on this store page.');
      return { data: entry.data, quantity: positiveQuantity(input.quantity ?? 1), selections: customizations(entry.data, input.choices ?? []) };
    });
  }
  async function performAdds(input, operation) {
    const start = Date.now(), context = storeContext(), { store } = context, operationId = identifier();
    let prepared;
    try { prepared = prepareAdds(batchItems(input), context); }
    catch (error) { record(operation, {}, { error: error.message }, 'rejected', start); throw error; }
    const sdk = cartSdk();
    if (typeof sdk.addProduct !== 'function') throw new Error('Glovo’s native addProduct function is unavailable.');
    return mutate(async write => {
      let basket = await nativeResult(sdk.getBasketByStore(store.id, store.addressId));
      baseline(basketSummary(basket, store));
      const results = [];
      for (let index = 0; index < prepared.length; index++) {
        const { data, quantity, selections } = prepared[index];
        const matching = product => String(product.ids?.id) === String(data.id) && signature(product.customizations) === signature(selections);
        const before = (basket?.products || []).filter(matching);
        const beforeQuantities = new Map(before.map(line => [line.ids?.basketProductId, line.quantity?.increments || 0]));
        const previousQuantity = before.reduce((sum, product) => sum + (product.quantity?.increments || 0), 0);
        try {
          const response = await write(() => sdk.addProduct({ handlingStrategy: 'DELIVERY', store, storeId: store.id,
            storeAddressId: store.addressId, storeCategoryId: store.categoryId,
            product: { ids: { id: String(data.id), externalId: data.externalId, legacyId: String(data.id), storeProductId: data.storeProductId },
              quantity: { increments: quantity }, customizations: selections } }));
          const lines = (response?.products || []).filter(matching);
          const total = lines.reduce((sum, product) => sum + (product.quantity?.increments || 0), 0);
          const changed = lines.filter(line => (line.quantity?.increments || 0) > (beforeQuantities.get(line.ids?.basketProductId) || 0));
          if (total !== previousQuantity + quantity || changed.length !== 1 || !changed[0].ids?.basketProductId) {
            throw new Error('Glovo’s response did not confirm the exact requested quantity and options. Read the basket before retrying.');
          }
          basket = response;
          const receipt = { id: identifier(), operationId, store: storeSummary(store), productId: String(data.id), name: data.name,
            basketProductId: changed[0].ids.basketProductId, quantityAdded: quantity, quantityRemaining: quantity,
            choices: basketSummary({ products: [changed[0]] }, store).products[0].customizations, createdAt: new Date().toISOString() };
          receipts.set(receipt.id, receipt);
          results.push({ status: 'added', productId: receipt.productId, name: data.name, quantity, receiptId: receipt.id, basketProductId: receipt.basketProductId });
        } catch (error) {
          results.push({ status: error.code === 'BATCH_TIME_LIMIT' ? 'not_attempted' : 'unknown', productId: String(data.id), name: data.name, error: error.message });
          for (const next of prepared.slice(index + 1)) results.push({ status: 'not_attempted', productId: String(next.data.id), name: next.data.name });
          const result = { operationId, status: error.code === 'BATCH_TIME_LIMIT' ? 'partial' : 'unknown', results, basket: basketSummary(basket, store), basketIsLastConfirmed: true };
          record(operation, { items: prepared.map(item => ({ productId: String(item.data.id), quantity: item.quantity })) }, result, result.status, start);
          return result;
        }
      }
      const result = { operationId, status: 'complete', results, basket: basketSummary(basket, store) };
      record(operation, { itemCount: prepared.length }, result, 'complete', start);
      return result;
    });
  }
  function consumeReceipts(storeId, lineId, quantity, receiptIds) {
    for (const receipt of receipts.values()) {
      if (receipt.store.id !== String(storeId) || receipt.basketProductId !== lineId || (receiptIds && !receiptIds.includes(receipt.id))) continue;
      const consumed = Math.min(quantity, receipt.quantityRemaining); receipt.quantityRemaining -= consumed; quantity -= consumed;
      if (!quantity) break;
    }
  }
  async function performRemovals(input, operation) {
    const start = Date.now(), { store } = storeContext(), sdk = cartSdk(), operationId = identifier();
    let items, receiptIds;
    if (input?.receiptIds !== undefined) {
      receiptIds = input.receiptIds;
      if (!Array.isArray(receiptIds) || !receiptIds.length || receiptIds.length > 20 || new Set(receiptIds).size !== receiptIds.length) throw new Error('Pass 1–20 unique receiptIds.');
      items = receiptIds.map(id => {
        const receipt = receipts.get(id);
        if (!receipt || receipt.store.id !== String(store.id) || !receipt.quantityRemaining) throw new Error('Receipt is missing, already consumed, or belongs to another store.');
        return { basketProductId: receipt.basketProductId, quantity: receipt.quantityRemaining };
      });
    } else items = batchItems(input);
    const totals = new Map();
    for (const item of items) {
      if (!item?.basketProductId || typeof item.basketProductId !== 'string') throw new Error('Pass a basketProductId returned by getStoreCart.');
      totals.set(item.basketProductId, (totals.get(item.basketProductId) || 0) + positiveQuantity(item.quantity ?? 1));
    }
    return mutate(async write => {
      let basket = await nativeResult(sdk.getBasketByStore(store.id, store.addressId));
      for (const [id, quantity] of totals) {
        const line = basket?.products?.find(product => product.ids?.basketProductId === id);
        if (!line) throw new Error('This basket line is not in the current store’s basket.');
        if (quantity > (line.quantity?.increments || 0)) throw new Error('Removal quantity exceeds this basket line’s quantity.');
        if (receiptIds) {
          const original = baselines.get(String(store.id))?.products.find(product => product.basketProductId === id)?.quantity || 0;
          if (line.quantity.increments - quantity < original) throw new Error('The basket changed outside this batch. Receipt cleanup would remove pre-existing quantity; reconcile the basket first.');
        }
      }
      const plan = [...totals], results = [];
      for (let index = 0; index < plan.length; index++) {
        const [basketProductId, quantity] = plan[index];
        const previousQuantity = basket.products.find(product => product.ids?.basketProductId === basketProductId).quantity.increments;
        try {
          const response = await write(() => sdk.decreaseProductsQuantity({ store, storeId: store.id, storeAddressId: store.addressId, basketProductId, decreaseBy: quantity }));
          if (!response || (response.products?.find(product => product.ids?.basketProductId === basketProductId)?.quantity?.increments || 0) !== previousQuantity - quantity) {
            throw new Error('Glovo did not confirm the removal. Read the basket before retrying.');
          }
          basket = response; consumeReceipts(store.id, basketProductId, quantity, receiptIds);
          results.push({ status: 'removed', basketProductId, quantity });
        } catch (error) {
          results.push({ status: error.code === 'BATCH_TIME_LIMIT' ? 'not_attempted' : 'unknown', basketProductId, error: error.message });
          for (const [id] of plan.slice(index + 1)) results.push({ status: 'not_attempted', basketProductId: id });
          const result = { operationId, status: error.code === 'BATCH_TIME_LIMIT' ? 'partial' : 'unknown', results, basket: basketSummary(basket, store), basketIsLastConfirmed: true };
          record(operation, { receiptIds: receiptIds || null }, result, result.status, start); return result;
        }
      }
      const result = { operationId, status: 'complete', results, basket: basketSummary(basket, store) };
      record(operation, { receiptIds: receiptIds || null }, result, 'complete', start); return result;
    });
  }
  const panelConfig = { dock: options.dock || 'left', collapsed: options.panel === 'collapsed' };
  const panel = {
    state() {
      const host = document.getElementById('shopping-assistant-glovo-panel');
      return { mounted: !!host, visible: !!host && !host.hidden, collapsed: panelConfig.collapsed, dock: panelConfig.dock };
    },
    show(input = {}) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Pass {dock?, collapsed?}.');
      if (input.dock !== undefined && !['left', 'right'].includes(input.dock)) throw new Error('Panel dock must be left or right.');
      if (input.collapsed !== undefined && typeof input.collapsed !== 'boolean') throw new Error('collapsed must be a boolean.');
      if (input.dock) panelConfig.dock = input.dock;
      const host = document.getElementById('shopping-assistant-glovo-panel') || mountPanel();
      host.hidden = false;
      host.style.left = panelConfig.dock === 'left' ? '20px' : 'auto'; host.style.right = panelConfig.dock === 'right' ? '20px' : 'auto';
      panel.collapse({ collapsed: input.collapsed ?? panelConfig.collapsed });
      return panel.state();
    },
    hide() { const host = document.getElementById('shopping-assistant-glovo-panel'); if (host) host.hidden = true; return panel.state(); },
    collapse(input = {}) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Pass {collapsed?:boolean}.');
      if (input.collapsed !== undefined && typeof input.collapsed !== 'boolean') throw new Error('collapsed must be a boolean.');
      panelConfig.collapsed = input.collapsed ?? true;
      const host = document.getElementById('shopping-assistant-glovo-panel');
      if (host) {
        host.toggleAttribute('data-collapsed', panelConfig.collapsed);
        const button = host.shadowRoot.querySelector('.collapse');
        button.textContent = panelConfig.collapsed ? 'Expand' : 'Collapse';
        button.setAttribute('aria-expanded', String(!panelConfig.collapsed));
      }
      return panel.state();
    },
  };
  function nativeBasket() {
    const selectors = ['[data-testid="store-cart"]', '[class*="StoreCart_cartContent"]', '[class*="StoreCart_storeCartContainer"]'];
    const visible = element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; };
    let element;
    for (const selector of selectors) { element = [...document.querySelectorAll(selector)].find(visible); if (element) break; }
    if (!element) return { found: false, text: '', rows: [] };
    const rect = element.getBoundingClientRect(), rows = [];
    for (const image of element.querySelectorAll('img[alt]')) {
      let row = image;
      for (let depth = 0; row && depth < 8; depth++, row = row.parentElement) {
        if (row.querySelectorAll('img').length === 1 && row.querySelector('button[aria-label="Increase quantity"]')) {
          const text = row.innerText || '', quantity = text.match(/(?:^|\n)\s*(\d+)\s*(?:\n|$)/)?.[1];
          rows.push({ name: image.alt, quantity: quantity ? Number(quantity) : null, text: text.slice(0, 1500) }); break;
        }
      }
    }
    return { found: true, text: (element.innerText || '').slice(0, 8000), rows,
      rectangle: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      visibleInViewport: rect.top >= 0 && rect.bottom <= globalThis.innerHeight && rect.left >= 0 && rect.right <= globalThis.innerWidth,
      element };
  }
  async function basketEvidence(input = {}, prepare = false) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Pass {refresh?:boolean}.');
    if (input.refresh !== undefined && typeof input.refresh !== 'boolean') throw new Error('refresh must be a boolean.');
    const start = Date.now(), panelBefore = panel.state();
    if (prepare) panel.hide();
    let basket;
    try { basket = await adapter.getStoreCart({ refresh: input.refresh ?? true }); }
    catch (error) {
      if (prepare && panelBefore.visible) panel.show({ dock: panelBefore.dock, collapsed: panelBefore.collapsed });
      throw error;
    }
    let ui = nativeBasket();
    if (prepare && ui.element) ui.element.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    const agrees = view => {
      if (!view.found) return false;
      if (basket.itemCount === 0) return view.rows.length === 0 && /will appear here|empty|pust|pojawi/i.test(view.text);
      if (view.rows.length !== basket.lineCount) return false;
      const remaining = [...view.rows];
      return basket.products.every(product => {
        const index = remaining.findIndex(row => normalize(row.name) === normalize(product.name) && row.quantity === product.quantity
          && product.customizations.every(choice => normalize(row.text).includes(normalize(choice.name))));
        if (index < 0) return false;
        remaining.splice(index, 1); return true;
      });
    };
    for (let attempt = 0; !agrees(ui) && attempt < 10; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50)); ui = nativeBasket();
    }
    const { element, ...nativeUi } = ui;
    const result = { capturedAt: new Date().toISOString(), basket, nativeUi, nativeMatchesStructured: agrees(ui), panelBefore, panel: panel.state() };
    record(prepare ? 'prepareBasketScreenshot' : 'getBasketEvidence', { refresh: input.refresh ?? true }, result, result.nativeMatchesStructured ? 'verified' : 'mismatch', start);
    return result;
  }
  const adapter = {
    source: 'shopping-assistant/glovo',
    version: '0.4.2',
    sessionId,
    panel,
    describe() {
      return { version: this.version, batchLimit: 20, optionChoice: 'Explicit IDs or unique names; no automatic required choices',
        methods: {
          searchMany: { input: 'string[] or {queries, limit?:3, includeOptions?:false|selected|all, fuzzy?:true, aliases?:true}', mutates: false },
          addMany: { input: '{items:[{productId, quantity?:1, choices?:[name|{groupId,attributeId,quantity?}]}]}', mutates: true },
          removeMany: { input: '{receiptIds:string[]} or {items:[{basketProductId,quantity?:1}]}', mutates: true },
          getReceipts: { input: '{activeOnly?:true}', mutates: false },
          getReport: { input: '{refresh?:false, notes?:string[]}', mutates: false },
          prepareBasketScreenshot: { input: '{refresh?:true}', mutates: false },
          getBasketEvidence: { input: '{refresh?:true}', mutates: false },
          exportBasket: { input: 'none; fresh portable product quantities and choices, without credentials', mutates: false },
          importBasket: { input: '{basket: exported basket}; preserves existing quantities; replay in this document does not write again; full reload loses replay history', mutates: true },
          verifyBasketImport: { input: '{id: exported basket id}; fresh destination quantities compared with the import baseline', mutates: false },
          panel: { methods: ['show', 'hide', 'state', 'collapse'], show: '{dock?:left|right,collapsed?:boolean}' },
        } };
    },
    inspect() {
      let props = null, sdk = null, context = null;
      try { props = searchProps(); } catch {}
      try { sdk = cartSdk(); } catch {}
      try { context = storeContext(); } catch {}
      return { version: this.version, url: location.href, framework: 'React/Next.js', searchReady: !!props,
        cartReady: !!sdk, productSearchReady: !!context, addToBasketReady: !!context && typeof sdk?.addProduct === 'function',
        store: context ? storeSummary(context.store) : null, mutationPending,
        methods: ['search', 'suggest', 'searchProducts', 'searchMany', 'getProduct', 'addToBasket', 'addMany', 'removeFromBasket', 'removeMany',
          'getStoreCart', 'getCart', 'getReceipts', 'getReport', 'getOperationLog', 'getBasketEvidence', 'prepareBasketScreenshot', 'exportBasket', 'importBasket', 'verifyBasketImport', 'recordArtifact', 'describe', 'inspect', 'uninstall'],
        panel: panel.state(), sessionId,
        searchImplementation: props ? 'React component onSelectSuggestion callback' : null };
    },
    search(query) {
      const term = queryTerm(query);
      const props = searchProps();
      // Invoke Glovo's own search-selection callback. No synthesized click or keyboard event.
      props.onSelectSuggestion({ term });
      return { query: term, navigationRequested: true, implementation: 'Glovo React callback' };
    },
    async suggest(query) {
      const term = queryTerm(query);
      const response = await nativeResult(autocomplete()(term));
      return { query: term, implementation: 'Glovo native autocomplete service', suggestions: response.suggestions };
    },
    async getCart() {
      const baskets = await nativeResult(cartSdk().getBaskets());
      return { implementation: 'Glovo native cart SDK getBaskets', basketCount: baskets.length, baskets };
    },
    searchProducts(input = '') {
      const start = Date.now(), context = storeContext(), result = searchCatalog(catalog(context), input);
      record('searchProducts', { query: result.query }, { status: result.status, total: result.total, selectedProductId: result.selectedProductId }, 'complete', start);
      return { store: storeSummary(context.store), scope: 'current store loaded menu', ...result, implementation: 'Glovo native React menu data' };
    },
    searchMany(input) {
      const start = Date.now(), settings = Array.isArray(input) ? { queries: input } : input;
      if (!Array.isArray(settings?.queries) || !settings.queries.length || settings.queries.length > 20) throw new Error('Pass 1–20 queries.');
      if (settings.includeOptions !== undefined && ![false, 'selected', 'all'].includes(settings.includeOptions)) throw new Error('includeOptions must be false, selected or all.');
      const context = storeContext(), entries = catalog(context);
      const results = settings.queries.map(query => {
        const result = searchCatalog(entries, { query, limit: settings.limit ?? 3, compact: true, fuzzy: settings.fuzzy, aliases: settings.aliases });
        for (const product of result.products) if (settings.includeOptions === 'all' || (settings.includeOptions === 'selected' && product.id === result.selectedProductId)) {
          product.attributeGroups = publicProduct(entries.get(product.id)).attributeGroups;
        }
        return result;
      });
      record('searchMany', { queries: settings.queries }, { results: results.map(({ query, status, selectedProductId }) => ({ query, status, selectedProductId })) }, 'complete', start);
      return { store: storeSummary(context.store), scope: 'current store loaded menu', results };
    },
    getProduct(input) {
      const productId = input && typeof input === 'object' && !Array.isArray(input) ? input.productId : input;
      return publicProduct(productEntry(storeContext(), productId));
    },
    async getStoreCart(options = {}) {
      if (!options || typeof options !== 'object' || Array.isArray(options) || (options.refresh !== undefined && typeof options.refresh !== 'boolean')) {
        throw new Error('Pass { refresh: true } to force a server read, or omit the argument.');
      }
      const start = Date.now(), { store } = storeContext();
      // Glovo's controls use the SDK cache, which is updated with each server-confirmed mutation.
      const basket = await nativeResult(cartSdk().getBasketByStore(store.id, store.addressId, !options.refresh));
      const result = basketSummary(basket, store); baseline(result);
      record('getStoreCart', { refresh: !!options.refresh }, result, 'complete', start); return result;
    },
    async addToBasket(input) {
      const result = await performAdds({ items: [input] }, 'addToBasket');
      if (result.status !== 'complete') throw Object.assign(new Error(result.results.find(item => item.error)?.error || 'The batch did not complete.'),
        { result, code: result.status === 'partial' ? 'BATCH_TIME_LIMIT' : 'UNKNOWN_OUTCOME' });
      return { added: true, ...result.results[0], implementation: 'Glovo native cart SDK addProduct', basket: result.basket };
    },
    addMany(input) { return performAdds(input, 'addMany'); },
    async exportBasket() {
      if (mutationPending) throw new Error('Wait for the basket update before exporting.');
      const basket = await this.getStoreCart({ refresh: true });
      if (!basket.lineCount || basket.lineCount > 20) throw new Error('Export requires 1–20 basket lines.');
      return { schema: 'glovo-basket/v1', id: identifier(), sourceSessionId: sessionId,
        store: basket.store, items: basket.products.map(product => ({ productId: product.productId,
          quantity: positiveQuantity(product.quantity), choices: product.customizations.map(choice => ({
            group: choice.group, name: choice.name, quantity: positiveQuantity(choice.quantity, 100),
          })) })) };
    },
    async importBasket(input) {
      const portable = input?.basket, { store } = storeContext();
      if (portable?.schema !== 'glovo-basket/v1' || typeof portable.id !== 'string' ||
          !portable.id.trim() || portable.id.length > 128) throw new Error('Pass a basket returned by exportBasket.');
      if (portable.sourceSessionId === sessionId) throw new Error('Import into a different browser session.');
      if (String(portable.store?.id) !== String(store.id) ||
          String(portable.store?.addressId) !== String(store.addressId)) throw new Error('Open the same store branch before importing.');
      // Only validated menu identities, quantities and choices enter this session's native SDK.
      const prepared = prepareAdds(batchItems(portable), storeContext());
      const items = prepared.map((item, index) => ({ productId: String(item.data.id), quantity: item.quantity,
        choices: portable.items[index].choices ?? [] }));
      const fingerprint = JSON.stringify(prepared.map(item => ({ productId: String(item.data.id),
        quantity: item.quantity, choices: signature(item.selections) })));
      const prior = imports.get(portable.id);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new Error('This basket ID already belongs to a different import.');
        return { ...clone(prior.result || { status: 'unknown' }), replayed: true,
          verification: await this.verifyBasketImport({ id: portable.id }) };
      }
      if (imports.size >= 100) throw new Error('This document has reached its import limit.');
      if (mutationPending) throw new Error('Wait for the current basket update before importing.');
      const before = await this.getStoreCart({ refresh: true });
      // Another import may have reserved this ID while the fresh read was pending.
      if (imports.has(portable.id) || mutationPending) throw new Error('An import or basket update started; read its result before retrying.');
      const entry = { id: portable.id, fingerprint, before, items: prepared.map(item => ({
        productId: String(item.data.id), quantity: item.quantity, customizations: item.selections.map(choice => ({
          group: choice.groupName || choice.name, name: choice.customizationName, quantity: choice.quantity.increments,
        })) })), result: { status: 'unknown', importId: portable.id } };
      imports.set(portable.id, entry);
      try {
        entry.result = { ...await performAdds({ items }, 'importBasket'), importId: portable.id };
        return { ...clone(entry.result), verification: await this.verifyBasketImport({ id: portable.id }) };
      } catch (error) {
        entry.result.error = error.message;
        throw error;
      }
    },
    async verifyBasketImport(input) {
      const entry = imports.get(input?.id);
      if (!entry) throw new Error('This session has no import with that ID.');
      const basket = await this.getStoreCart({ refresh: true });
      const key = product => JSON.stringify([product.productId, product.customizations.map(choice =>
        [normalize(choice.group), normalize(choice.name), choice.quantity]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
      const quantities = products => {
        const map = new Map();
        for (const product of products) map.set(key(product), (map.get(key(product)) || 0) + product.quantity);
        return map;
      };
      const expected = quantities([...entry.before.products, ...entry.items]), actual = quantities(basket.products);
      const matches = !mutationPending && basket.store.id === entry.before.store.id &&
        basket.store.addressId === entry.before.store.addressId && expected.size === actual.size &&
        [...expected].every(([identity, quantity]) => actual.get(identity) === quantity);
      return { importId: entry.id, matches, mutationPending, basket };
    },
    async removeFromBasket(input) {
      const result = await performRemovals({ items: [input] }, 'removeFromBasket');
      if (result.status !== 'complete') throw Object.assign(new Error(result.results.find(item => item.error)?.error || 'The batch did not complete.'),
        { result, code: result.status === 'partial' ? 'BATCH_TIME_LIMIT' : 'UNKNOWN_OUTCOME' });
      return { removed: true, quantity: result.results[0].quantity, basket: result.basket };
    },
    removeMany(input) { return performRemovals(input, 'removeMany'); },
    getReceipts(input = {}) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || (input.activeOnly !== undefined && typeof input.activeOnly !== 'boolean')) throw new Error('Pass {activeOnly?:boolean}.');
      return clone([...receipts.values()].filter(receipt => input.activeOnly === false || receipt.quantityRemaining > 0));
    },
    getOperationLog() { return clone({ version: this.version, sessionId, startedAt, events, droppedEvents, receipts: [...receipts.values()], baselines: [...baselines.values()], imports: [...imports.values()] }); },
    async getReport(input = {}) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Pass {refresh?:boolean, notes?:string[]}.');
      if (input.notes !== undefined && (!Array.isArray(input.notes) || input.notes.some(note => typeof note !== 'string'))) throw new Error('notes must be a string array.');
      const finalBasket = await this.getStoreCart({ refresh: input.refresh ?? false });
      return { ...this.getOperationLog(), generatedAt: new Date().toISOString(), mutationPending, finalBasket, notes: input.notes || [] };
    },
    recordArtifact(input) {
      if (typeof input?.path !== 'string' || !input.path || typeof input?.kind !== 'string') throw new Error('Pass {kind, path}.');
      record('artifact', { kind: input.kind, path: input.path }, { capturedAt: input.capturedAt || new Date().toISOString() }, 'complete', Date.now());
      return { recorded: true };
    },
    getBasketEvidence(input) { return basketEvidence(input); },
    prepareBasketScreenshot(input) { return basketEvidence(input, true); },
    uninstall() {
      if (mutationPending) throw new Error('Wait for the basket update to finish before uninstalling or reinjecting.');
      document.getElementById('shopping-assistant-glovo-panel')?.remove();
      document.getElementById('shopping-assistant-glovo-api')?.remove();
      if (window.glovoBridge === adapter) {
        if (previous === undefined) delete window.glovoBridge;
        else window.glovoBridge = previous;
      }
      return { removed: window.glovoBridge !== adapter };
    },
  };
  function mountPanel() {
  if (location.hostname !== 'glovoapp.com' || !window.glovoBridge) throw new Error('Inject the Glovo adapter first.');
  document.getElementById('shopping-assistant-glovo-panel')?.remove();
  const host = document.createElement('div');
  host.id = 'shopping-assistant-glovo-panel';
  host.style.cssText = 'position:fixed;left:20px;bottom:20px;width:400px;max-width:calc(100vw - 40px);z-index:2147483647';
  const root = host.attachShadow({ mode: 'open' });
  const info = window.glovoBridge.inspect();
  // Static local markup only. Product names, options, and all API results use textContent.
  root.innerHTML = `<style>
    :host{font:14px/1.4 system-ui,sans-serif;color:#1c2430}*{box-sizing:border-box}
    section{background:#fff;border:1px solid #d8e0e8;border-radius:16px;box-shadow:0 12px 48px #0003;padding:18px;max-height:calc(100vh - 40px);overflow:auto}
    header,.line{display:flex;justify-content:space-between;align-items:center;gap:8px}h2{font-size:17px;margin:0}p{margin:5px 0 12px;color:#657083;font-size:12px}
    label{display:block;font-size:12px;font-weight:600;margin-bottom:5px}input,select{width:100%;border:1px solid #bac8d5;border-radius:8px;padding:8px;font:inherit;background:white;color:inherit}
    input[type=number]{width:62px}input[type=checkbox]{width:auto}.buttons{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}
    button{font:600 12px system-ui;cursor:pointer;border:1px solid #c8d8d3;border-radius:7px;padding:8px;background:#e9f6f0;color:#145841}
    button:disabled{opacity:.55;cursor:wait}.close{background:transparent;border:0;font-size:18px;padding:0 5px;color:#657083}
    h3{font-size:12px;margin:14px 0 5px}ul{padding:0;list-style:none;margin:0;max-height:230px;overflow:auto}li{padding:8px 0;border-bottom:1px solid #eef1f5;font-size:12px}
    .meta,.result{font-size:12px;color:#657083}.status{margin-top:12px;font-size:11px;color:#657083}.error{color:#ad2828}
    details{margin-top:14px}summary{cursor:pointer;font-size:12px;font-weight:600}fieldset{border:1px solid #d8e0e8;border-radius:8px;margin:10px 0;padding:10px}legend{font-size:12px;font-weight:600}
    .option{display:flex;gap:8px;align-items:center;font-weight:400;margin:6px 0}.option span{flex:1}[hidden]{display:none!important}:host([data-collapsed]) section>:not(header){display:none}
  </style><section aria-label="Glovo JS adapter">
    <header><h2>Glovo JS adapter</h2><button class="collapse" aria-label="Collapse or expand adapter panel">Collapse</button><button class="close" aria-label="Hide adapter panel">×</button></header>
    <p>Calls Glovo’s native JavaScript · No WebMCP</p>
    <div id="store-tools">
      <p id="store-name"></p>
      <form id="product-search-form"><label for="product-query">Search this store’s products</label><input id="product-query" value="McDouble">
        <div class="buttons"><button id="find-products" type="submit">Find products</button><button id="store-cart" type="button">Read basket</button></div>
      </form>
      <h3 id="products-title">Products</h3><ul id="products"><li>Search the loaded store menu.</li></ul>
      <form id="configuration" hidden><h3 id="configuration-title"></h3><div id="options"></div>
        <label for="quantity">Quantity</label><input id="quantity" type="number" min="1" max="20" value="1" required>
        <div class="buttons"><button type="submit">Add to basket</button><button id="cancel-options" type="button">Cancel</button></div>
      </form>
      <h3>Store basket</h3><div id="store-cart-result" class="result">Run Read basket to see items.</div><ul id="basket-lines"></ul>
    </div>
    <details id="global-tools"><summary>Glovo search and all baskets</summary>
      <label for="query">Search query</label><input id="query" value="pizza">
      <div class="buttons"><button id="suggest">Suggestions</button><button id="cart">Read all baskets</button><button id="search">Open search</button></div>
      <h3 id="suggestions-title">Suggestions</h3><ul id="suggestions"><li>Run Suggestions to call autocomplete.</li></ul>
      <h3>All baskets</h3><div class="result" id="cart-result">Run Read all baskets to call the cart SDK.</div>
    </details>
    <div class="status" id="status" role="status" aria-live="polite">Adapter ready</div>
  </section>`;
  const $ = id => root.getElementById(id), status = $('status');
  $('store-tools').hidden = !info.productSearchReady;
  $('global-tools').open = !info.productSearchReady;
  $('search').disabled = !info.searchReady;
  $('store-name').textContent = info.store?.name || '';
  let busy = false, configuredProduct = null, optionReaders = [];
  async function run(operation) {
    if (busy) return;
    busy = true;
    const controls = [...root.querySelectorAll('button,input,select')];
    const prior = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    status.className = 'status'; status.textContent = 'Calling Glovo…';
    try { const message = await operation(); status.textContent = message || 'Native call completed'; }
    catch (error) { status.className = 'status error'; status.textContent = error.message; }
    finally { controls.forEach((control, index) => { control.disabled = prior[index]; }); busy = false; }
  }
  function renderBasket(basket) {
    $('store-cart-result').textContent = `${basket.itemCount} item${basket.itemCount === 1 ? '' : 's'}${basket.total ? ` · ${basket.total}` : ''}`;
    const list = $('basket-lines'); list.replaceChildren();
    for (const product of basket.products) {
      const row = document.createElement('li'), line = document.createElement('div'), title = document.createElement('span');
      line.className = 'line'; title.textContent = `${product.quantity} × ${product.name || product.productId}`; line.append(title);
      if (product.basketProductId) {
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove 1';
        remove.setAttribute('aria-label', `Remove one ${product.name || product.productId}`);
        remove.addEventListener('click', () => run(async () => {
          const result = await window.glovoBridge.removeFromBasket({ basketProductId: product.basketProductId });
          renderBasket(result.basket); return `Removed one ${product.name || 'item'}`;
        })); line.append(remove);
      }
      row.append(line);
      if (product.customizations.length) {
        const options = document.createElement('div'); options.className = 'meta';
        options.textContent = product.customizations.map(choice => `${choice.group}: ${choice.name}`).join(' · '); row.append(options);
      }
      list.append(row);
    }
  }
  function configure(product) {
    configuredProduct = product; optionReaders = [];
    $('products').hidden = true; $('configuration').hidden = false;
    $('configuration-title').textContent = `${product.name} · ${product.displayPrice || ''}`;
    $('quantity').value = '1'; const options = $('options'); options.replaceChildren();
    for (const group of product.attributeGroups) {
      const fieldset = document.createElement('fieldset'), legend = document.createElement('legend');
      legend.textContent = `${group.name} (${group.min}–${group.max})`; fieldset.append(legend);
      if (group.max === 1) {
        const select = document.createElement('select'); select.setAttribute('aria-label', group.name); select.required = group.min > 0;
        const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = group.min ? 'Choose an option…' : 'No extra option'; select.append(placeholder);
        for (const attribute of group.attributes) {
          const option = document.createElement('option'); option.value = attribute.id;
          option.textContent = `${attribute.name}${attribute.displayPrice ? ` · +${attribute.displayPrice}` : ''}`; select.append(option);
        }
        fieldset.append(select);
        optionReaders.push(() => select.value ? [{ groupId: group.id, attributeId: select.value }] : []);
      } else {
        for (const attribute of group.attributes) {
          const label = document.createElement('label'), input = document.createElement('input'), name = document.createElement('span'); label.className = 'option';
          input.type = group.multipleSelection ? 'number' : 'checkbox';
          if (input.type === 'number') { input.min = '0'; input.max = String(group.max); input.value = '0'; }
          name.textContent = `${attribute.name}${attribute.displayPrice ? ` · +${attribute.displayPrice}` : ''}`; label.append(input, name); fieldset.append(label);
          optionReaders.push(() => {
            const quantity = input.type === 'checkbox' ? Number(input.checked) : Number(input.value);
            return quantity ? [{ groupId: group.id, attributeId: attribute.id, quantity }] : [];
          });
        }
      }
      options.append(fieldset);
    }
  }
  function cancelConfiguration() { $('configuration').hidden = true; $('products').hidden = false; configuredProduct = null; }
  async function addProduct(product, quantity = 1, choices = []) {
    const result = await window.glovoBridge.addToBasket({ productId: product.id, quantity, choices });
    renderBasket(result.basket); cancelConfiguration(); return `Added ${quantity} × ${product.name}`;
  }
  $('product-search-form').addEventListener('submit', event => {
    event.preventDefault(); run(async () => {
      const result = window.glovoBridge.searchProducts({query:$('product-query').value,compact:true});
      cancelConfiguration(); $('products-title').textContent = `Products (${result.total}${result.hasMore ? ` · showing ${result.products.length}` : ''})`;
      const list = $('products'); list.replaceChildren();
      for (const product of result.products) {
        const row = document.createElement('li'), line = document.createElement('div'), title = document.createElement('span'), add = document.createElement('button');
        line.className = 'line'; title.textContent = `${product.name} · ${product.displayPrice || product.price}`;
        add.type = 'button'; add.textContent = product.optionGroupCount ? 'Choose options' : 'Add 1';
        add.setAttribute('aria-label', `${add.textContent} · ${product.name}`);
        add.addEventListener('click', () => {
          if (busy) return;
          if (product.optionGroupCount) configure(window.glovoBridge.getProduct(product.id));
          else run(() => addProduct(product));
        }); line.append(title, add); row.append(line); list.append(row);
      }
      if (!result.products.length) { const row = document.createElement('li'); row.textContent = 'No matching products in the loaded menu.'; list.append(row); }
      return `Searched ${result.store.name}’s loaded menu`;
    });
  });
  $('configuration').addEventListener('submit', event => {
    event.preventDefault(); const product = configuredProduct;
    if (product) run(() => addProduct(product, Number($('quantity').value), optionReaders.flatMap(read => read())));
  });
  $('cancel-options').addEventListener('click', cancelConfiguration);
  $('store-cart').addEventListener('click', () => run(async () => { renderBasket(await window.glovoBridge.getStoreCart()); }));
  $('suggest').addEventListener('click', () => run(async () => {
    const result = await window.glovoBridge.suggest($('query').value);
    $('suggestions-title').textContent = `Suggestions (${result.suggestions.length})`;
    const list = $('suggestions'); list.replaceChildren();
    for (const item of result.suggestions) {
      const row = document.createElement('li'); row.textContent = item.searchSubVerticalName ? `${item.term} · ${item.searchSubVerticalName}` : item.term; list.append(row);
    }
  }));
  $('cart').addEventListener('click', () => run(async () => {
    const result = await window.glovoBridge.getCart(); $('cart-result').textContent = `${result.basketCount} active basket${result.basketCount === 1 ? '' : 's'}`;
  }));
  $('search').addEventListener('click', () => run(() => { window.glovoBridge.search($('query').value); }));
  root.querySelector('.close').addEventListener('click', () => panel.hide());
  root.querySelector('.collapse').addEventListener('click', () => panel.collapse({collapsed:!panel.state().collapsed}));
  document.documentElement.append(host);
  return host;
  }
  function mountNativeApi() {
    // A DOM transport for browser tools whose JavaScript evaluation is read-only.
    // Requests call the same public methods as the JavaScript bridge.
    const allowed = new Set(['inspect', 'describe', 'searchProducts', 'searchMany', 'getProduct',
      'getStoreCart', 'getReceipts', 'addToBasket', 'addMany', 'removeFromBasket', 'removeMany',
      'getBasketEvidence', 'prepareBasketScreenshot', 'exportBasket', 'importBasket', 'verifyBasketImport']);
    const host = document.createElement('section');
    host.id = 'shopping-assistant-glovo-api';
    host.setAttribute('aria-label', 'Glovo adapter API');
    host.style.cssText = 'position:fixed;left:20px;bottom:20px;width:360px;max-width:calc(100vw - 40px);z-index:2147483647;background:white;color:#1c2430;border:1px solid #bac8d5;border-radius:10px;padding:12px;font:12px system-ui';
    const heading = document.createElement('h2'); heading.textContent = 'Glovo adapter API';
    const form = document.createElement('form');
    const label = document.createElement('label'); label.htmlFor = 'glovo-adapter-request'; label.textContent = 'Adapter request';
    const input = document.createElement('textarea'); input.id = label.htmlFor;
    input.setAttribute('aria-label', 'Adapter request'); input.rows = 2; input.maxLength = 65536;
    input.style.cssText = 'box-sizing:border-box;width:100%;font:12px monospace';
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Run adapter method';
    const output = document.createElement('pre'); output.id = 'glovo-adapter-response';
    output.setAttribute('aria-label', 'Adapter response'); output.setAttribute('role', 'status');
    output.dataset.state = 'idle'; output.textContent = JSON.stringify({ state: 'idle' });
    output.style.cssText = 'max-height:180px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px monospace';
    let busy = false;
    const responses = new Map();
    const publish = response => {
      output.textContent = JSON.stringify(response);
      output.dataset.requestId = response.requestId;
      output.dataset.state = response.state;
    };
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      busy = true; submit.disabled = true; input.disabled = true;
      let requestId = identifier(), fingerprint, response;
      try {
        const request = JSON.parse(input.value);
        if (!request || typeof request !== 'object' || Array.isArray(request)) {
          throw new Error('Pass {method,input?} using a supported public adapter method.');
        }
        if (request.requestId !== undefined) {
          if (typeof request.requestId !== 'string' || !request.requestId.trim() || request.requestId.length > 128) {
            throw new Error('requestId must be a nonempty string of at most 128 characters.');
          }
          requestId = request.requestId;
        }
        if (!allowed.has(request.method)) throw new Error('Pass {method,input?} using a supported public adapter method.');
        fingerprint = JSON.stringify([request.method, request.input]);
        const cached = responses.get(requestId);
        if (cached) {
          if (cached.fingerprint !== fingerprint) throw new Error('requestId already belongs to a different request.');
          publish(cached.response);
          return;
        }
        publish({ requestId, state: 'pending', method: request.method });
        const value = await adapter[request.method](request.input);
        response = { requestId, state: 'complete', ok: true, method: request.method, value };
      } catch (error) {
        response = { requestId, state: 'complete', ok: false, error: error.message, code: error.code, result: error.result };
      } finally {
        if (response) {
          if (fingerprint && !responses.has(requestId)) {
            responses.set(requestId, { fingerprint, response });
            if (responses.size > 32) responses.delete(responses.keys().next().value);
          }
          publish(response);
        }
        submit.disabled = false; input.disabled = false; busy = false;
      }
    });
    form.append(label, input, submit); host.append(heading, form, output);
    document.documentElement.append(host);
  }
  window.glovoBridge = adapter;
  if (options.panel !== false && options.panel !== 'hidden') panel.show();
  if (options.nativeApi) mountNativeApi();
  return JSON.stringify(adapter.inspect());
})()
