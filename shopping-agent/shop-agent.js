/* Shop Agent 0.3.0 — dependency-free, page-local shopping API.
 * Install: <script defer src="/shop-agent.js"></script>
 * No service, credentials, build step, or agent plugin required.
 */
(() => {
  'use strict';
  const VERSION = '0.3.0';
  const BRAND = 'shop-agent/page-api';
  const existing = [window.mcp, window.shopAgent].find(x => x?.brand === BRAND);
  if (existing) { existing.panel.show(); return; }
  const namespace = window.mcp === undefined ? 'mcp' : 'shopAgent';
  if (window[namespace] !== undefined) { console.warn('Shop Agent: both namespaces are occupied.'); return; }
  const origin = location.origin;
  const cache = new Map(), known = new Map(), events = [];
  let adapter, panel, pending = false, nonce, storageAvailable = true;
  const discoveryKey = 'shop-agent:v2:discovery:' + origin;
  const storageKey = 'shop-agent:v1:operations:' + origin;
  let ledger = {};
  try { ledger = JSON.parse(sessionStorage.getItem(storageKey) || '{}'); } catch { storageAvailable = false; }
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) ledger = {};
  const own = (x, k) => Object.prototype.hasOwnProperty.call(x, k);
  const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };
  const errorJSON = e => ({code:e.code || 'ERROR', message:e.message});
  const integer = (v, min, max, name) => Number.isInteger(v) && v >= min && v <= max ? v : fail('INVALID_ARGUMENT', `${name} must be an integer ${min}–${max}.`);
  const array = (v, max, name) => Array.isArray(v) && v.length && v.length <= max ? v : fail('INVALID_ARGUMENT', `${name} must contain 1–${max} entries.`);
  const string = (v, name, max = 200) => typeof v === 'string' && v.trim() && v.length <= max ? v : fail('INVALID_ARGUMENT', `${name} must be a nonempty string, at most ${max} characters.`);
  function keys(o, allowed) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) fail('INVALID_ARGUMENT', 'Expected an object.');
    for (const key of Object.keys(o)) if (!allowed.includes(key)) fail('INVALID_ARGUMENT', `Unknown field: ${key}`);
  }
  const doc = html => new DOMParser().parseFromString(html, 'text/html');
  const plain = html => doc(String(html || '')).body.textContent.replace(/\s+/g, ' ').trim();
  const url = value => {
    const u = new URL(value, location.href);
    if (u.origin !== origin || !/^https?:$/.test(u.protocol) || u.username || u.password) fail('OUTSIDE_STORE', 'Only this store origin is supported.');
    return u;
  };
  const money = (value, currency) => ({amount:value == null || !Number.isFinite(Number(value)) ? null : Number(value), currency:currency || null});
  const clone = value => JSON.parse(JSON.stringify(value));
  function yaml(value) {
    const seen = new Set();
    const quote = text => JSON.stringify(text).replace(/[\u007f-\u009f\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4,'0'));
    const key = k => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && !/^(null|true|false|yes|no|on|off)$/i.test(k) ? k : quote(k);
    function emit(v, indent) {
      if (v == null) return 'null';
      if (typeof v === 'string') return quote(v);
      if (typeof v === 'boolean') return String(v);
      if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace(/^(\-?\d+)e/,'$1.0e') : 'null';
      if (typeof v !== 'object' || (!Array.isArray(v) && Object.prototype.toString.call(v) !== '[object Object]')) fail('UNSERIALIZABLE_RESULT','Return plain data from run().');
      if (seen.has(v)) fail('UNSERIALIZABLE_RESULT','Cyclic result; return selected fields.');
      seen.add(v);
      const entries = Array.isArray(v) ? v.map(x=>['-',x]) : Object.entries(v).filter(([,x])=>x !== undefined).map(([k,x])=>[key(k)+':',x]);
      const result = entries.length ? entries.map(([k,x])=> {
        const nested = x && typeof x === 'object' && (Array.isArray(x) ? x.length : Object.values(x).some(v=>v !== undefined));
        return ' '.repeat(indent)+k+(nested ? '\n'+emit(x,indent+2) : ' '+emit(x,indent+2));
      }).join('\n') : Array.isArray(v) ? '[]' : '{}';
      seen.delete(v); return result;
    }
    return emit(value,0);
  }
  function compact(value) {
    if (Array.isArray(value)) return value.map(compact);
    if (!value || typeof value !== 'object') return value;
    // Only product records are projected. Never discard operation errors or outcomes.
    if (value.id !== undefined && value.name && value.price && value.description !== undefined) {
      const p = {id:value.id,name:value.name,price:value.price.amount,currency:value.price.currency};
      if (value.optionsSupport === 'use-native-product-page') p.url = value.url;
      if (value.onSale) { p.onSale = true; p.regularPrice = value.regularPrice?.amount; }
      for (const k of ['inStock','purchasable','requiresOptions','optionsSupport','quantityLimits','textMatch']) if (value[k] != null) p[k] = value[k];
      if (value.description) p.description = value.description.slice(0,value.optionsSupport ? 1200 : 160);
      for (const k of ['attributes','options','variants']) if (value[k]?.length) p[k] = value[k];
      if (value.images?.length) p.imageCount = value.images.length;
      return p;
    }
    return Object.fromEntries(Object.entries(value).filter(([,v])=>v !== undefined).map(([k,v])=>[k,compact(v)]));
  }
  async function pool(items, fn, concurrency = 4) {
    const result = new Array(items.length); let next = 0;
    await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
      while (next < items.length) { const i = next++; result[i] = await fn(items[i],i); }
    })); return result;
  }
  function saveLedger() {
    try { sessionStorage.setItem(storageKey, JSON.stringify(ledger)); }
    catch { storageAvailable = false; fail('STORAGE_UNAVAILABLE', 'Session storage is required for safe cart writes.'); }
  }
  function log(method, started, status) {
    events.push({method, durationMs:Math.round(performance.now() - started), status});
    if (events.length > 200) events.shift();
  }
  async function request(value, {method = 'GET', json, form, raw = false, readOnly = method === 'GET'} = {}) {
    const u = url(value), controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const headers = {'X-Requested-With':'XMLHttpRequest'};
    let body;
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form !== undefined) body = new URLSearchParams(form);
    if (adapter?.name === 'woocommerce' && method !== 'GET' && nonce) headers.Nonce = nonce;
    const start = performance.now();
    try {
      const r = await fetch(u, {method, body, headers, credentials:'same-origin', cache:'no-store', redirect:'error', signal:controller.signal});
      if (r.headers.get('Nonce')) nonce = r.headers.get('Nonce');
      if (!r.ok) fail(readOnly ? 'HTTP_ERROR' : 'WRITE_UNCERTAIN', `Store returned HTTP ${r.status}. Read/reconcile the basket before retrying a write.`);
      const result = raw ? await r.text() : await r.json();
      log('http:' + method, start, 'complete');
      return {value:result, headers:r.headers};
    } catch (e) {
      log('http:' + method, start, 'error');
      if (typeof e.code === 'string') throw e;
      throw Object.assign(new Error(e.message), {code:readOnly ? 'READ_FAILED' : 'WRITE_UNCERTAIN'});
    } finally { clearTimeout(timeout); }
  }
  const get = async u => (await request(u)).value;
  const html = async u => doc((await request(u, {raw:true})).value);
  async function cached(key, fn) {
    const old = cache.get(key);
    if (old && Date.now() - old.time < 15000) return clone(await old.promise);
    if (cache.size >= 40) cache.delete(cache.keys().next().value);
    const entry = {time:Date.now(), promise:fn()}; cache.set(key, entry);
    try { return clone(await entry.promise); } catch (e) { cache.delete(key); throw e; }
  }
  // Persist only public lookup references, never native payloads/tokens or stale prices.
  try {
    const saved = JSON.parse(sessionStorage.getItem(discoveryKey) || '[]');
    for (const p of Array.isArray(saved) ? saved.slice(-500) : []) {
      if (p && /^\d+$/.test(String(p.id)) && typeof p.url === 'string') {
        url(p.url); known.set(String(p.id), {product:{id:String(p.id), url:p.url, sku:p.sku}});
      }
    }
  } catch { /* Reads still work if storage is unavailable or malformed. */ }
  function persistDiscovery() {
    try { sessionStorage.setItem(discoveryKey, JSON.stringify([...known.values()].map(({product:p}) => ({id:p.id,url:p.url,sku:p.sku})))); } catch {}
  }
  function remember(p, internal = {}) {
    known.set(String(p.id), {...known.get(String(p.id)), ...internal, product:p});
    if (known.size > 500) known.delete(known.keys().next().value);
    persistDiscovery();
    return p;
  }
  function record(id) { return known.get(String(id)) || fail('UNKNOWN_PRODUCT', 'Use an ID returned by search/list/products in this tab session.'); }
  function pageResult(products, total, page, limit, extra = {}) {
    return {products, total:total ?? null, page, limit, nextCursor:total == null ? null : page * limit < total ? String(page + 1) : null,
      scope:'native-catalog-query', exhaustive:total != null && page === 1 && products.length >= total, ...extra};
  }
  function parseJSONAssignment(d, name) {
    for (const s of d.scripts) {
      const match = s.textContent.match(new RegExp('(?:var|let|const)\\s+' + name + '\\s*=\\s*'));
      if (!match) continue;
      const text = s.textContent.slice(match.index + match[0].length);
      let quoted = false, escaped = false, depth = 0;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
        else if (c === '"') quoted = true;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) return JSON.parse(text.slice(0, i + 1));
      }
    }
    fail('UNSUPPORTED_THEME', `Could not read native ${name} JSON. Use the ordinary page.`);
  }
  const currencyMeta = d => d.querySelector('[itemprop="priceCurrency"]')?.content || null;

  function images(items) {
    return (items || []).slice(0,6).flatMap(i => {
      try { const u = new URL(i.url || i.src, location.href); return /^https?:$/.test(u.protocol) ? [{url:u.href,alt:plain(i.alt || i.label || '')}] : []; } catch { return []; }
    });
  }
  function woo() {
    const root = url(document.querySelector('link[rel="https://api.w.org/"]')?.href || '/wp-json/');
    function endpoint(path, params = {}) {
      const u = new URL(root);
      if (u.searchParams.has('rest_route')) u.searchParams.set('rest_route', '/wc/store/v1/' + path);
      else u.pathname = u.pathname.replace(/\/?$/, '/') + 'wc/store/v1/' + path;
      for (const [k,v] of Object.entries(params)) u.searchParams.set(k, String(v));
      return u;
    }
    const price = p => money(Number(p.price) / 10 ** p.currency_minor_unit, p.currency_code);
    function product(p, detail = false) {
      return remember({id:String(p.id), name:plain(p.name), sku:p.sku, url:p.permalink, type:p.type,
        price:price(p.prices), regularPrice:price({...p.prices, price:p.prices.regular_price}), onSale:p.on_sale,
        inStock:p.is_in_stock, purchasable:p.is_purchasable, requiresOptions:!!p.has_options,
        images:images(p.images), categories:p.categories?.map(c => ({id:String(c.id), name:c.name})), attributes:p.attributes || [],
        description:plain(detail ? p.description : p.short_description).slice(0, detail ? 4000 : 280),
        ...(detail ? {variants:p.variations || [], quantityLimits:{min:p.add_to_cart?.minimum, max:p.add_to_cart?.maximum}, optionsSupport:p.type === 'simple' || p.type === 'variation' ? 'automatic' : 'use-native-product-page'} : {})}, {raw:p});
    }
    async function search(q) {
      const params = {per_page:q.limit, page:q.page, search:q.query || ''};
      if (q.category) params.category = q.category;
      const mapping = {onSale:'on_sale', inStock:'stock_status'};
      const supported = {onSale:'on_sale', inStock:'stock_status'};
      for (const [k,v] of Object.entries(q.filters)) {
        if (!(k in supported)) fail('UNSUPPORTED_FILTER', `WooCommerce v1 supports onSale and inStock; received ${k}.`);
        params[mapping[k]] = k === 'inStock' ? v ? 'instock' : 'outofstock' : v;
      }
      const r = await request(endpoint('products', params));
      return pageResult(r.value.map(p => product(p)), Number(r.headers.get('X-WP-Total')), q.page, q.limit, {appliedFilters:q.filters});
    }
    async function read() {
      const c = await get(endpoint('cart'));
      return {lines:c.items.map(p => ({lineId:p.key, productId:String(p.id), url:p.permalink, name:plain(p.name), quantity:p.quantity,
        options:p.variation || [], price:price(p.prices), lineTotal:money(Number(p.totals.line_total) / 10 ** p.totals.currency_minor_unit, p.totals.currency_code)})),
        subtotal:money(Number(c.totals.total_items) / 10 ** c.totals.currency_minor_unit, c.totals.currency_code),
        total:money(Number(c.totals.total_price) / 10 ** c.totals.currency_minor_unit, c.totals.currency_code),
        url:document.querySelector('a.cart-contents, a.wc-block-mini-cart__footer-cart')?.href || new URL('cart/', location.origin).href};
    }
    return {name:'woocommerce', filters:['onSale','inStock'], search, read,
      async categories() { const r = await request(endpoint('products/categories',{per_page:100})); return {categories:r.value.map(c=>({id:String(c.id),name:plain(c.name),count:c.count})),scope:'native-categories-first-100',exhaustive:Number(r.headers.get('X-WP-Total')) <= 100}; },
      async details(id) { return product(await get(endpoint('products/' + encodeURIComponent(id))), true); },
      async add(item) {
        const j = (await request(endpoint('cart/add-item'), {method:'POST', json:{id:Number(item.productId), quantity:item.quantity}})).value;
        if (j.code || j.errors?.length) fail('STORE_REJECTED', j.message || 'Store rejected the cart change.');
      },
      async update(item) { await request(endpoint(item.quantity ? 'cart/update-item' : 'cart/remove-item'), {method:'POST', json:{key:item.lineId, quantity:item.quantity}}); },
      async sync() {
        if (window.jQuery) window.jQuery(document.body).trigger('wc_fragment_refresh');
        document.body.dispatchEvent(new CustomEvent('wc-blocks_added_to_cart', {bubbles:true, detail:{preserveCartData:false}}));
      },
      nativeRows(d) {
        if (d === document && d.querySelector('.wc-block-cart-items')) {
          return {rows:[...d.querySelectorAll('.wc-block-cart-items__row')].map(r => ({url:r.querySelector('a.wc-block-components-product-name')?.href,
            quantity:Number(r.querySelector('input.wc-block-components-quantity-selector__input')?.value)})), recognized:true, identity:'url'};
        }
        const rows = [...d.querySelectorAll('.woocommerce-cart-form__cart-item')].map(r => ({lineId:r.querySelector('[data-cart_item_key]')?.dataset.cart_item_key,
          quantity:Number(r.querySelector('input.qty')?.value), name:r.querySelector('.product-name')?.textContent.trim()}));
        const renderedEmptyBlock = d === document && d.querySelector('.wc-block-cart__empty-cart__title') && !d.querySelector('.wp-block-woocommerce-cart.is-loading');
        return {rows, recognized:!!d.querySelector('.woocommerce-cart-form, .cart-empty') || !!renderedEmptyBlock, identity:'lineId'};
      }};
  }

  function presta() {
    const ps = window.prestashop;
    const endpoint = (name, params = {}) => {
      const u = url(ps.urls.pages[name]);
      for (const [k,v] of Object.entries(params)) u.searchParams.set(k, String(v));
      return u;
    };
    const currency = ps.currency.iso_code;
    function product(p, detail = false, d) {
      const optionInputs = d ? [...d.querySelectorAll('.product-variants [name^="group["]')] : [];
      const options = [...new Set(optionInputs.map(e => e.name))].map(name => ({name,
        values:optionInputs.filter(e => e.name === name).flatMap(e => e.tagName === 'SELECT' ? [...e.options].map(o => ({value:o.value, label:o.textContent.trim()})) : [{value:e.value, label:e.title || e.getAttribute('aria-label') || e.value}])}));
      const requiresOptions = options.length > 0 || Number(p.id_product_attribute) > 0 || !!p.customization_required;
      return remember({id:String(p.id_product || p.id), name:p.name, sku:p.reference, url:p.url || p.canonical_url || record(String(p.id_product || p.id)).product.url,
        price:money(p.price_amount, currency), regularPrice:money(p.regular_price_amount ?? p.price_without_reduction ?? p.price_amount, currency), onSale:!!p.has_discount,
        inStock:detail ? Number(p.quantity) > 0 || !!p.allow_oosp : null,
        purchasable:detail ? !!Number(p.available_for_order) : null, requiresOptions:detail ? requiresOptions : null,
        images:images((p.images?.length ? p.images : p.cover ? [p.cover] : []).map(i=>({url:i.bySize?.large_default?.url || i.large?.url || i.url,alt:i.legend}))),
        categories:p.category_name ? [{id:String(p.id_category_default || ''),name:p.category_name}] : [], attributes:p.features || [],
        description:plain(detail ? p.description : p.description_short).slice(0, detail ? 4000 : 280),
        ...(detail ? {options, optionsSupport:requiresOptions ? 'use-native-product-page' : 'automatic', quantityLimits:{min:Number(p.minimal_quantity || 1), max:p.allow_oosp ? null : Number(p.quantity)}} : {})}, {raw:p});
    }
    async function search(q) {
      if (Object.keys(q.filters).some(k=>k!=='onSale') || q.filters.onSale === false || (q.filters.onSale && (q.query || q.category))) fail('UNSUPPORTED_FILTER', 'PrestaShop supports {onSale:true} as a native sale listing without query/category. Filter those returned products in JavaScript; use ordinary text/category queries separately.');
      let u;
      if (q.filters.onSale) u = endpoint('prices_drop');
      else if (q.category) u = endpoint('category', {id_category:q.category});
      else if (!q.query) {
        const all = document.querySelector('a.all-product-link')?.href;
        if (!all) fail('QUERY_REQUIRED','Supply a search query or category ID on this page.');
        u = url(all);
      }
      else u = endpoint('search', {s:q.query});
      for (const [k,v] of Object.entries({ajax:1, resultsPerPage:q.limit, page:q.page})) u.searchParams.set(k, v);
      const j = await get(u);
      if (!Array.isArray(j.products)) fail('UNSUPPORTED_THEME', 'The native listing did not expose products.');
      return pageResult(j.products.map(p => product(p)), Number(j.pagination.total_items), q.page, q.limit, {appliedFilters:q.filters, note:'Native text search may match categories and descriptions. Check relevance.'});
    }
    async function read() {
      const d = await html(endpoint('cart', {action:'show'}));
      const c = parseJSONAssignment(d, 'prestashop').cart;
      return {lines:c.products.map(p => ({lineId:[p.id_product,p.id_product_attribute || 0,p.id_customization || 0].join(':'), productId:String(p.id_product), name:p.name,
        quantity:Number(p.cart_quantity ?? p.quantity), options:p.attributes || {}, price:money(p.price_amount, currency), lineTotal:money(p.total_amount, currency)})),
        subtotal:money(c.subtotals.products.amount, currency), total:money(c.totals.total.amount, currency), url:endpoint('cart', {action:'show'}).href};
    }
    const change = async fields => {
      const j = (await request(endpoint('cart'), {method:'POST', form:{ajax:1, action:'update', token:ps.static_token, ...fields}})).value;
      if (j.hasError || j.errors) fail('STORE_REJECTED', plain(JSON.stringify(j.errors)));
      if (!j.success) fail('WRITE_UNCERTAIN', 'Cart response did not confirm the change.');
    };
    return {name:'prestashop', filters:['onSale (native sale listing, without query/category)'], search, read,
      async categories() {
        const entries = [...document.querySelectorAll('[id^="category-"] > a')].flatMap(a=> {
          const id = a.parentElement.id.match(/^category-(\d+)$/)?.[1];
          return id ? [{id,name:a.textContent.trim(),url:url(a.href).href}] : [];
        });
        return {categories:[...new Map(entries.map(c=>[c.id,c])).values()],scope:'store-navigation',exhaustive:false};
      },
      async details(id) {
        const r = record(id), d = await html(r.product.url), el = d.querySelector('#product-details[data-product]');
        if (!el) fail('UNSUPPORTED_THEME', 'Product details are not available in this theme.');
        const p = JSON.parse(el.dataset.product); p.url = r.product.url;
        return product(p, true, d);
      },
      async add(item) { await change({add:1, id_product:item.productId, id_product_attribute:0, qty:item.quantity}); },
      async update(item, before) {
        const line = before.lines.find(p => p.lineId === item.lineId);
        const [id_product,id_product_attribute,id_customization] = item.lineId.split(':');
        const difference = item.quantity - line.quantity;
        if (difference || !item.quantity) await change({id_product,id_product_attribute,id_customization,
          ...(item.quantity ? {update:1, qty:Math.abs(difference), op:difference > 0 ? 'up' : 'down'} : {delete:1})});
      },
      async sync() { ps.emit?.('updateCart', {reason:{linkAction:'refresh'}, resp:{}}); },
      nativeRows(d) {
        const rows = [...d.querySelectorAll('.cart-item')].map(r => {
          const e = r.querySelector('[data-id-product]'), input = r.querySelector('input.js-cart-line-product-quantity');
          return {lineId:[e?.dataset.idProduct,e?.dataset.idProductAttribute || 0,e?.dataset.idCustomization || 0].join(':'), quantity:Number(input?.value), name:r.querySelector('.product-line-info a.label')?.textContent.trim()};
        });
        return {rows, recognized:!!d.querySelector('.cart-overview'), identity:'lineId'};
      }};
  }

  function magento() {
    const base = url(window.BASE_URL || document.querySelector('a.logo')?.href || '/');
    const endpoint = path => new URL(path, base);
    let currency = null;
    const fields = 'id sku name url_key url_suffix __typename stock_status small_image{url label} description{html} short_description{html} categories{id name} price_range{minimum_price{regular_price{value currency} final_price{value currency}}}';
    async function query(query, variables) {
      // GraphQL POSTs here contain queries only, never cart mutations.
      const j = (await request(endpoint('graphql'), {method:'POST', json:{query, variables}, readOnly:true})).value;
      if (j.errors) fail('GRAPHQL_ERROR', j.errors.map(e => e.message).join('; '));
      return j.data;
    }
    function product(p, detail = false) {
      const prices = p.price_range.minimum_price; currency = prices.final_price.currency;
      return remember({id:String(p.id), sku:p.sku, name:p.name, url:new URL(p.url_key + (p.url_suffix || ''), base).href, type:p.__typename,
        price:money(prices.final_price.value, currency), regularPrice:money(prices.regular_price.value, currency), onSale:prices.final_price.value < prices.regular_price.value,
        inStock:p.stock_status === 'IN_STOCK', purchasable:p.stock_status === 'IN_STOCK', requiresOptions:p.__typename !== 'SimpleProduct',
        images:images(p.small_image ? [p.small_image] : []), categories:p.categories.map(c => ({id:String(c.id), name:c.name})), attributes:[], description:plain(detail ? p.description.html : p.short_description.html).slice(0, detail ? 4000 : 280),
        ...(detail ? {optionsSupport:p.__typename === 'SimpleProduct' ? 'automatic' : 'use-native-product-page'} : {})}, {raw:p});
    }
    async function search(q) {
      if (Object.keys(q.filters).length) fail('UNSUPPORTED_FILTER', 'Magento v1 supports native search/category; inspect sale and stock on returned products.');
      const filter = q.category ? {category_id:{eq:String(q.category)}} : {};
      const j = await query(`query($search:String,$filter:ProductAttributeFilterInput,$page:Int!,$size:Int!){products(search:$search,filter:$filter,currentPage:$page,pageSize:$size){total_count items{${fields}}}}`, {search:q.query || undefined, filter, page:q.page, size:q.limit});
      return pageResult(j.products.items.map(p => product(p)), j.products.total_count, q.page, q.limit, {appliedFilters:{}});
    }
    async function read() {
      const u = endpoint('customer/section/load/'); u.searchParams.set('sections','cart'); u.searchParams.set('force_new_section_timestamp','true'); u.searchParams.set('_', Date.now());
      const c = (await get(u)).cart;
      if (!c || !Array.isArray(c.items)) fail('UNSUPPORTED_THEME', 'Native session cart unavailable.');
      return {lines:c.items.map(p => ({lineId:String(p.item_id), productId:String(p.product_id), sku:p.product_sku, name:plain(p.product_name), quantity:Number(p.qty),
        options:p.options || [], price:money(p.product_price_value, currency), lineTotal:money(p.product_price_value == null ? null : p.product_price_value * p.qty, currency)})),
        subtotal:money(c.subtotalAmount || 0, currency), total:null, url:endpoint('checkout/cart/').href};
    }
    const formKey = () => document.querySelector('input[name="form_key"]')?.value || decodeURIComponent(document.cookie.match(/(?:^|;\s*)form_key=([^;]*)/)?.[1] || '') || fail('SESSION_UNAVAILABLE','Native form key unavailable. Open the store page normally.');
    async function change(path, fields) {
      const j = (await request(endpoint(path), {method:'POST', form:{form_key:formKey(), ...fields}})).value;
      if (j.success === false || j.errors) fail('STORE_REJECTED', plain(j.error_message || j.message || 'Store rejected the change.'));
      if (j.backUrl || j.redirect) fail('WRITE_UNCERTAIN', 'Native cart requested navigation. Inspect the basket.');
    }
    return {name:'magento', filters:[], search, read,
      async categories() {
        const j = await query('query{categoryList{id name children{id name children{id name}}}}',{});
        const flatten = items => items.flatMap(c=>[{id:String(c.id),name:c.name},...flatten(c.children || [])]);
        return {categories:flatten(j.categoryList),scope:'native-category-tree-three-levels',exhaustive:false};
      },
      async details(id) {
        const r = record(id);
        const j = await query(`query($sku:String!){products(filter:{sku:{eq:$sku}},pageSize:1){items{${fields}}}}`, {sku:r.product.sku});
        if (!j.products.items.length) fail('NOT_FOUND', 'Product no longer available.');
        const p = product(j.products.items[0], true), d = await html(p.url);
        const form = d.querySelector('#product_addtocart_form');
        const custom = form && [...form.querySelectorAll('select,input,textarea')].some(e => /^(options|super_attribute|bundle_option|links)\[/.test(e.name));
        p.requiresOptions = p.requiresOptions || !!custom;
        p.optionsSupport = p.requiresOptions ? 'use-native-product-page' : 'automatic';
        // Luma renders this button disabled until its JS initializer runs.
        p.purchasable = p.purchasable && !!form?.querySelector('#product-addtocart-button');
        remember(p); return p;
      },
      async add(item) { await change('checkout/cart/add/', {product:item.productId, qty:item.quantity}); },
      async update(item) { await change(item.quantity ? 'checkout/sidebar/updateItemQty/' : 'checkout/sidebar/removeItem/', {item_id:item.lineId, item_qty:item.quantity}); },
      async sync() {
        if (typeof window.require === 'function') window.require(['Magento_Customer/js/customer-data'], data => { data.invalidate(['cart']); data.reload(['cart'], true); });
      },
      nativeRows(d) {
        const rows = [...d.querySelectorAll('#shopping-cart-table tbody.cart.item')].map(r => {
          const i = r.querySelector('input.qty');
          return {lineId:i?.name.match(/^cart\[(\d+)\]/)?.[1], quantity:Number(i?.value), name:r.querySelector('.product-item-name')?.textContent.trim()};
        });
        return {rows, recognized:!!d.querySelector('#shopping-cart-table, .cart-empty'), identity:'lineId'};
      }};
  }

  function getAdapter() {
    if (adapter) return adapter;
    if (window.prestashop?.urls?.pages?.cart) adapter = presta();
    else if (document.querySelector('body.woocommerce, body.woocommerce-page, link[href*="woocommerce"], script[src*="woocommerce"]') || window.wc_add_to_cart_params) adapter = woo();
    else if (window.BASE_URL && window.require && (document.querySelector('[data-mage-init], script[type="text/x-magento-init"]') ||
      window.require.specified?.('mage/url') || window.require.specified?.('Magento_Customer/js/customer-data'))) adapter = magento();
    else fail('UNSUPPORTED_STORE', 'Supported: WooCommerce Store API, PrestaShop Classic, Magento Luma. Use this store’s ordinary UI.');
    return adapter;
  }
  function normalizeQuery(q) {
    if (typeof q === 'string') q = {query:q};
    keys(q, ['query','category','filters','onSale','inStock','minPrice','maxPrice','limit','cursor','match','maxPages']);
    if (q.query !== undefined && (typeof q.query !== 'string' || q.query.length > 200)) fail('INVALID_ARGUMENT','query must be a string up to 200 characters.');
    if (q.category !== undefined) string(String(q.category),'category');
    if (q.filters !== undefined) keys(q.filters, ['onSale','inStock','minPrice','maxPrice']);
    const filters = {...(q.filters || {})};
    for (const k of ['onSale','inStock','minPrice','maxPrice']) if (q[k] !== undefined) {
      if (filters[k] !== undefined && filters[k] !== q[k]) fail('INVALID_ARGUMENT',`Conflicting ${k} filters.`);
      filters[k] = q[k];
    }
    for (const [k,v] of Object.entries(filters)) {
      if (['onSale','inStock'].includes(k) ? typeof v !== 'boolean' : typeof v !== 'number' || !Number.isFinite(v) || v < 0) fail('INVALID_ARGUMENT',`Invalid ${k} filter.`);
    }
    if (filters.minPrice != null && filters.maxPrice != null && filters.minPrice > filters.maxPrice) fail('INVALID_ARGUMENT','minPrice exceeds maxPrice.');
    let page = 1, offset = 0;
    if (q.cursor != null) {
      const m = String(q.cursor).match(/^(?:v3:)?(\d+)(?::(\d+))?$/);
      if (!m) fail('INVALID_ARGUMENT','Use nextCursor from the same query.');
      page = Number(m[1]); offset = Number(m[2] || 0);
    }
    const match = q.match || 'native';
    if (!['native','any','all'].includes(match)) fail('INVALID_ARGUMENT','match must be native, any, or all (whole words).');
    return {query:q.query || '',category:q.category,filters,match,limit:integer(q.limit ?? 5,1,20,'limit'),
      page:integer(page,1,10000,'cursor'),offset:integer(offset,0,19,'cursor offset'),maxPages:integer(q.maxPages ?? 3,1,10,'maxPages')};
  }
  async function categories() { return cached('categories',()=>getAdapter().categories()); }
  async function resolveCategory(q) {
    if (q.category === undefined || /^\d+$/.test(String(q.category))) return q;
    const list = (await categories()).categories;
    const matches = list.filter(c=>c.name.toLocaleLowerCase() === String(q.category).trim().toLocaleLowerCase());
    if (matches.length !== 1) fail('UNKNOWN_CATEGORY','Use a unique category name or ID from categories().');
    return {...q,category:matches[0].id};
  }
  async function queryProducts(q) {
    q = await resolveCategory(q);
    return cached('query:'+JSON.stringify(q),async()=>{
      const a = getAdapter(), nativeFilters = {}, localFilters = {...q.filters};
      if (a.name === 'woocommerce') for (const k of ['onSale','inStock']) if (localFilters[k] !== undefined) { nativeFilters[k] = localFilters[k]; delete localFilters[k]; }
      const nativeSale = a.name === 'prestashop' && !q.category && localFilters.onSale === true;
      if (nativeSale) { nativeFilters.onSale = true; delete localFilters.onSale; }
      const nativeQuery = nativeSale ? '' : q.query;
      const words = text => String(text).toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
      const terms = [...new Set(words(q.query))];
      // Classic category listings do not apply a simultaneous native text query.
      const match = a.name === 'prestashop' && (q.category || nativeSale) && terms.length && q.match === 'native' ? 'any' : q.match;
      const textRelevant = p => {
        const text = new Set(words([p.name,p.description,JSON.stringify(p.attributes || [])].join(' ')));
        const matched = terms.filter(t=>text.has(t));
        if (terms.length) p.textMatch = matched.length === terms.length ? 'all' : matched.length ? 'some' : 'none';
        return !terms.length || match === 'native' || (match === 'all' ? matched.length === terms.length : matched.length > 0);
      };
      const filterMatches = (p,k,v) => {
        const actual = k.endsWith('Price') ? p.price?.amount : p[k];
        return actual != null && (k === 'minPrice' ? actual >= v : k === 'maxPrice' ? actual <= v : actual === v);
      };
      const products = []; let page = q.page, offset = q.offset, pagesRead = 0, inspected = 0, unknown = 0, total = null, nextCursor = null;
      while (pagesRead < q.maxPages) {
        const r = await cached('native:'+JSON.stringify([a.name,nativeQuery,q.category,nativeFilters,page]),()=>a.search({...q,query:nativeQuery,page,limit:20,filters:nativeFilters}));
        total = r.total; pagesRead++;
        const candidates = r.products.slice(offset);
        // Cheap listing evidence first: do not fetch stock details for irrelevant filler.
        const relevance = new Map(candidates.map(p=>[p.id,textRelevant(p)]));
        const stockCandidates = candidates.filter(p=>relevance.get(p.id) && Object.entries(localFilters).every(([k,v])=>k === 'inStock' || filterMatches(p,k,v)));
        if (localFilters.inStock !== undefined) await pool(stockCandidates,async p=> {
          if (p.inStock == null) Object.assign(p,await a.details(p.id));
        });
        for (let i = 0; i < candidates.length; i++) {
          const p = candidates[i]; inspected++;
          let eligible = relevance.get(p.id);
          for (const [k,v] of Object.entries(localFilters)) {
            const actual = k.endsWith('Price') ? p.price?.amount : p[k];
            if (actual == null) { unknown++; eligible = false; }
            else if (k === 'minPrice' ? actual < v : k === 'maxPrice' ? actual > v : actual !== v) eligible = false;
          }
          if (eligible) products.push(p);
          const nextOffset = offset + i + 1;
          nextCursor = nextOffset < r.products.length ? `v3:${page}:${nextOffset}` : r.nextCursor ? `v3:${page+1}:0` : null;
          if (products.length >= q.limit) break;
        }
        if (!candidates.length) nextCursor = r.nextCursor ? `v3:${page+1}:0` : null;
        if (products.length >= q.limit || !r.nextCursor) break;
        page++; offset = 0;
      }
      return {products,nativeTotal:total,total:Object.keys(localFilters).length || match !== 'native' ? null : total,
        nextCursor,query:q.query,category:q.category,filters:q.filters,match,
        coverage:{inspected,pagesRead,complete:q.page===1 && q.offset===0 && nextCursor===null,scope:nativeSale ? 'native-sale-listing' : a.name === 'prestashop' && q.category ? 'native-category' : 'native-query',unknownFilterValues:unknown},
        outcome:products.length ? 'candidates' : nextCursor ? 'no-match-in-scanned-pages' : 'no-match-in-native-query',
        note:'Search coverage is not proof of catalog-wide absence. textMatch compares whole words in supplied text, not image content or semantic similarity.'};
    });
  }
  async function view(input) {
    keys(input,['ids','page']); const allIds = array(input.ids,100,'ids');
    const page = integer(input.page ?? 1,1,Math.ceil(allIds.length/6),'page');
    const ids = allIds.slice((page-1)*6,page*6);
    // Reuse details already read in this page; native mutation preflight remains fresh.
    const products = await Promise.all(ids.map(async id=>{
      const p = record(id).product;
      return p.optionsSupport ? p : getAdapter().details(String(id));
    }));
    let gallery = document.getElementById('shop-agent-comparison');
    if (!gallery) { gallery = document.createElement('section'); gallery.id = 'shop-agent-comparison'; panel.append(gallery); }
    gallery.replaceChildren(); gallery.setAttribute('aria-label','Product comparison');
    gallery.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;';
    for (const p of products) {
      const card = document.createElement('article'); card.style.cssText = 'width:250px;padding:10px;background:white;color:#162c45;';
      const heading = document.createElement('strong'); heading.textContent = `${p.name} (ID ${p.id})`; card.append(heading);
      if (p.images?.[0]) {
        const img = document.createElement('img'); img.src = p.images[0].url; img.alt = p.images[0].alt || p.name;
        img.style.cssText = 'display:block;width:230px;height:230px;object-fit:contain;'; card.append(img);
      }
      const detail = document.createElement('p'); detail.textContent = `${p.price.amount ?? '?'} ${p.price.currency || ''}${p.onSale ? ' • On sale' : ''}. ${p.description}`; card.append(detail);
      gallery.append(card);
    }
    gallery.scrollIntoView({block:'start'});
    await Promise.all([...gallery.querySelectorAll('img')].map(img=>Promise.race([img.decode().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))])));
    return {page,total:allIds.length,nextPage:page*6<allIds.length ? page+1 : null,shown:products.map(p=>({id:p.id,name:p.name,hasImage:!!p.images?.length})),selector:'#shop-agent-comparison',instruction:products.some(p=>p.images?.length) ? 'Screenshot this comparison only if visual evidence is needed. No navigation needed; images do not establish fit.' : 'No product images are available in this comparison. A screenshot adds no product-image evidence.'};
  }
  const schemas = {
    search:'search({queries:["scarf",{query:"bag",category:"Accessories",onSale:true,maxPrice:50,limit:5,match:"any",maxPages:3,cursor:"returned cursor"}]}) — independent bounded queries; match native/any/all. Top-level filters or filters:{...} both work.',
    list:'list(queryObject) — one search, same fields as search queries.',
    categories:'categories() — category names/IDs, with coverage scope.',
    products:'products({ids:[...]}) — fresh descriptions, attributes, options, availability. Up to 100 IDs, fetched four at a time. Unknown fields stay unknown.',
    view:'view({ids:[...],page:1}) — show six product images per comparison page; returns nextPage. Up to 100 IDs; screenshot only if visual evidence is needed.',
    run:'run(async shop => { ... }) — shop returns JavaScript objects; your final returned value becomes YAML. Use Promise.all, filter/map/sort and window variables. Ordinary page JavaScript, not a sandbox.',
    'cart.read':'cart.read() — fresh basket lines, totals, revision.',
    'cart.addMany':'cart.addMany({requestId:"unique-operation-id",items:[{productId:"ID",quantity:1}],expectedRevision?}) — up to 20 simple products; increments quantities. Inspect complete/partial/unknown. Reuse requestId only for identical operations.',
    'cart.updateMany':'cart.updateMany({requestId:"unique-operation-id",items:[{lineId:"ID_FROM_CART",quantity:0}],expectedRevision?}) — absolute quantities; zero removes. Up to 20 lines.',
    'cart.verify':'cart.verify() — compare fresh native cart with native markup. unsupported-markup means verification unavailable, not success.',
    'cart.finish':'cart.finish({open:true}) — verify once, then open that same basket URL for handoff. For rendered Woo Blocks, verify again on the cart page.',
    'cart.open':'cart.open() — open native session cart.',
    'cart.reconcile':'cart.reconcile({requestId:"prior-id"}) — inspect uncertain writes, without retrying them.',
    stats:'stats() — page-local timings, cache and request counts.'
  };
  function help(input = {}) {
    keys(input,['method']);
    if (input.method) return schemas[input.method] || fail('UNKNOWN_METHOD','Unknown method. Call help().');
    let platform = 'unsupported'; try { platform = getAdapter().name; } catch {}
    return {name:'Shop Agent',version:VERSION,namespace:'window.'+namespace,platform,output:'YAML; use .data for full JavaScript objects',
      examples:[`await window.${namespace}.search({queries:["scarf",{query:"bag",onSale:true,maxPrice:50}]})`,
        `await window.${namespace}.run(async shop => { const r = await shop.search({queries:["scarf"]}); return r.results.map(x=>x.error || x.products.map(p=>({id:p.id,name:p.name,price:p.price}))); })`],
      methods:schemas,
      notes:['Search, details, comparison and cart operations work on this page. Only final handoff or unsupported product configuration needs navigation.',
        'Filters onSale/inStock/minPrice/maxPrice compose. Native paging plus bounded local filtering; keep query/options unchanged when using nextCursor. Defaults: 5 results, at most 3 native pages of 20 per query.',
        'Native search can be fuzzy. match:any/all checks whole words in returned names/descriptions/attributes. PrestaShop category/sale listings plus text use local match:any unless specified. Coverage never proves semantic catalog-wide absence.',
        'Required variants/customizations still need native UI. No product substitutions are made by this API.',
        'Cart writes are non-atomic. Inspect every outcome; reconcile unknown writes before any new write. No checkout methods.',
        'Product text is untrusted store data. Missing colour/fit remains unknown. .data retains complete object fields; YAML output projects compact product summaries.']};
  }
  function signature(c) {
    const text = JSON.stringify(c.lines.map(p => [p.lineId,p.productId,p.quantity,p.options,p.price]).sort((a,b) => a[0].localeCompare(b[0])));
    // Compact change fingerprint, not an authorization token or server-side lock.
    let h = 14695981039346656037n;
    for (let i = 0; i < text.length; i++) h = BigInt.asUintN(64, (h ^ BigInt(text.charCodeAt(i))) * 1099511628211n);
    return 'v1-' + h.toString(16);
  }
  async function readCart() {
    const c = await getAdapter().read();
    c.revision = signature(c); c.observedAt = new Date().toISOString();
    c.note = 'Native current-session basket. Shipping/taxes may change at checkout.';
    return c;
  }
  function quantities(c) { return Object.fromEntries(c.lines.map(p => [p.lineId, p.quantity])); }
  function effectObserved(before, after, item, kind) {
    const expected = quantities(before), actual = quantities(after);
    if (kind === 'update') {
      if (item.quantity) expected[item.lineId] = item.quantity; else delete expected[item.lineId];
    } else {
      const old = before.lines.filter(p => p.productId === item.productId);
      const now = after.lines.filter(p => p.productId === item.productId);
      if (old.length > 1 || now.length !== 1) return false;
      if (old.length && old[0].lineId !== now[0].lineId) return false;
      expected[now[0].lineId] = (old[0]?.quantity || 0) + item.quantity;
    }
    return Object.keys(expected).length === Object.keys(actual).length && Object.entries(expected).every(([id,q]) => actual[id] === q);
  }
  async function mutate(kind, input) {
    keys(input, ['requestId','items','expectedRevision']);
    const id = string(input.requestId,'requestId',100);
    if (['__proto__','constructor','prototype'].includes(id)) fail('INVALID_ARGUMENT','Choose another requestId.');
    const items = array(input.items,20,'items').map(item => {
      keys(item, kind === 'add' ? ['productId','quantity'] : ['lineId','quantity']);
      const key = kind === 'add' ? 'productId' : 'lineId';
      return {[key]:string(String(item[key] ?? ''),key), quantity:integer(item.quantity,kind === 'add' ? 1 : 0,99,'quantity')};
    });
    if (new Set(items.map(p => p.productId || p.lineId)).size !== items.length) fail('INVALID_ARGUMENT','Combine duplicate product/line IDs into one item.');
    const fingerprint = JSON.stringify({kind,items,expectedRevision:input.expectedRevision});
    if (own(ledger,id)) {
      if (ledger[id].fingerprint !== fingerprint) fail('REQUEST_ID_CONFLICT','This requestId belongs to another operation.');
      if (ledger[id].status === 'pending' || ledger[id].status === 'unknown') return reconcile({requestId:id});
      return {...clone(ledger[id].result), replayed:true, basket:await readCart()};
    }
    if (pending || Object.values(ledger).some(r => ['pending','unknown'].includes(r.status))) fail('WRITE_PENDING','Resolve the prior operation with cart.reconcile({requestId}) before another write.');
    if (!storageAvailable) fail('STORAGE_UNAVAILABLE','Session storage is required for cart writes.');
    if (Object.keys(ledger).length >= 100) fail('SESSION_LIMIT','100 mutation requests recorded. Use the native cart for further changes.');
    pending = true;
    let entry;
    try {
      const a = getAdapter();
      let basket = await readCart();
      if (input.expectedRevision !== undefined && input.expectedRevision !== basket.revision) fail('CART_CHANGED','Basket changed; read it and reconsider the request.');
      if (kind === 'add') {
        const products = await Promise.all(items.map(i => a.details(i.productId)));
        products.forEach((p,i) => {
          if (p.requiresOptions || p.optionsSupport !== 'automatic') fail('OPTIONS_REQUIRED', `Use the native product page to configure ${p.name}: ${p.url}`);
          if (p.inStock === false || p.purchasable === false) fail('UNAVAILABLE', `${p.name} is unavailable.`);
          const min = p.quantityLimits?.min || 1, max = p.quantityLimits?.max;
          const existingQty = basket.lines.filter(l => l.productId === p.id).reduce((n,l) => n + l.quantity,0);
          if (items[i].quantity < min || (max != null && existingQty + items[i].quantity > max)) fail('QUANTITY_LIMIT', `Quantity is outside native limits for ${p.name}.`);
        });
      } else for (const i of items) if (!basket.lines.some(l => l.lineId === i.lineId)) fail('UNKNOWN_LINE','Use a lineId from the current cart.');
      entry = ledger[id] = {fingerprint,status:'pending',kind,results:items.map(item => ({...item,status:'not_attempted'})),active:null};
      saveLedger();
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        entry.active = {index,item,before:basket}; saveLedger();
        try {
          if (kind === 'add') await a.add(item); else await a.update(item,basket);
          const after = await readCart();
          if (!effectObserved(basket,after,item,kind)) fail('WRITE_UNCERTAIN','Native basket did not match the expected change.');
          basket = after; entry.results[index].status = 'complete'; entry.active = null; saveLedger();
        } catch (e) {
          const rejected = e.code === 'STORE_REJECTED';
          entry.results[index] = {...entry.results[index], status:rejected ? 'rejected' : 'unknown', error:errorJSON(e)};
          entry.status = rejected ? 'partial' : 'unknown';
          if (rejected) entry.active = null;
          try { basket = await readCart(); } catch {}
          break;
        }
      }
      if (entry.status === 'pending') entry.status = 'complete';
      entry.result = {requestId:id,status:entry.status,results:entry.results,basket}; saveLedger(); cache.clear();
      try { await a.sync(); } catch { entry.result.uiRefresh = 'failed; open the native cart'; }
      return clone(entry.result);
    } finally { pending = false; }
  }
  async function reconcile(input) {
    keys(input, ['requestId']); const id = string(input.requestId,'requestId',100);
    if (!own(ledger,id)) fail('UNKNOWN_REQUEST','No request with this ID in this tab session.');
    const e = ledger[id], basket = await readCart();
    if (pending) return {requestId:id,status:'pending',basket};
    if (['pending','unknown'].includes(e.status)) {
      if (!e.active) {
        e.status = e.results.every(r => r.status === 'complete') ? 'complete' : 'partial';
      } else if (effectObserved(e.active.before,basket,e.active.item,e.kind)) {
        e.results[e.active.index].status = 'complete'; e.active = null;
        e.status = e.results.every(r => r.status === 'complete') ? 'complete' : 'partial';
      } else e.status = 'unknown';
      e.result = {requestId:id,status:e.status,results:e.results,basket}; saveLedger();
    }
    return {...clone(e.result),requestId:id,status:e.status,basket};
  }
  async function verify() {
    const a = getAdapter(), basket = await readCart();
    let native = a.nativeRows(await html(basket.url)), source = 'fresh-native-cart-html';
    if (!native.recognized && url(basket.url).pathname === location.pathname) { native = a.nativeRows(document); source = 'rendered-native-cart'; }
    const compare = () => {
      const key = native.identity || 'lineId';
      const unique = new Set(basket.lines.map(l => l[key])).size === basket.lines.length && basket.lines.every(l => l[key]);
      return native.recognized && unique ? native.rows.length === basket.lines.length && basket.lines.every(l => native.rows.some(n => n[key] === l[key] && n.quantity === l.quantity)) : null;
    };
    let matched = compare();
    // Block carts update asynchronously after the native invalidation event.
    const deadline = Date.now() + 3000;
    while (source === 'rendered-native-cart' && matched !== true && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve,150));
      native = a.nativeRows(document); matched = compare();
    }
    return {basket, native:{matched, source, rows:native.rows}, status:matched === true ? 'verified' : matched === false ? 'mismatch' : 'unsupported-markup'};
  }
  const methods = {
    help, categories, view,
    async run(fn) { if (typeof fn !== 'function') fail('INVALID_ARGUMENT','run expects an async JavaScript callback.'); return await fn(data); },
    async search(input) {
      if (Array.isArray(input)) input = {queries:input};
      keys(input,['queries']); const queries = array(input.queries,12,'queries');
      return {results:await Promise.all(queries.map(async q => {
        try { return await queryProducts(normalizeQuery(q)); }
        catch(e) { return {query:typeof q === 'string' ? q : q?.query,error:errorJSON(e)}; }
      }))};
    },
    async list(input = {}) { const q = normalizeQuery(input); return queryProducts(q); },
    async products(input) {
      keys(input,['ids']); const ids = array(input.ids,100,'ids');
      return {results:await pool(ids,async id => { try { record(id); return await getAdapter().details(String(id)); } catch(e) { return {id,error:errorJSON(e)}; } })};
    },
    'cart.read':readCart, 'cart.addMany':input => mutate('add',input), 'cart.updateMany':input => mutate('update',input),
    async 'cart.finish'(input = {}) {
      keys(input,['open']); if (input.open !== undefined && typeof input.open !== 'boolean') fail('INVALID_ARGUMENT','open must be boolean.');
      if (pending) fail('WRITE_PENDING','Wait for the write to finish.');
      const v = await verify(); const opened = input.open !== false && v.status !== 'mismatch';
      if (opened) location.assign(url(v.basket.url).href);
      return {...v,handoff:opened ? 'opened' : 'not-opened'};
    },
    'cart.verify':verify, 'cart.reconcile':reconcile,
    async 'cart.open'() { if (pending) fail('WRITE_PENDING','Wait for the write to finish before navigating.'); const c = await readCart(); location.assign(url(c.url).href); return {url:c.url}; },
    stats() { return {version:VERSION, events:clone(events), networkRequests:events.filter(e => e.method.startsWith('http:')).length, cachedQueries:cache.size, knownProducts:known.size}; }
  };
  async function call(method, input) {
    if (!own(methods,method)) fail('UNKNOWN_METHOD','Use help() to list supported methods.');
    const start = performance.now();
    try { const value = await methods[method](input); log(method,start,'complete'); return value; }
    catch(e) { log(method,start,e.code || 'error'); throw e; }
  }
  const data = {help,call,cart:{}};
  for (const name of Object.keys(methods)) {
    if (name === 'help') continue;
    if (name.startsWith('cart.')) data.cart[name.slice(5)] = input => call(name,input);
    else data[name] = input => call(name,input);
  }
  const respond = async (method,input) => { try { return yaml(compact(await call(method,input))); } catch(e) { return yaml({error:errorJSON(e)}); } };
  const api = {brand:BRAND,version:VERSION,data,yaml,cart:{},
    help(input) { try { return yaml(help(input)); } catch(e) { return yaml({error:errorJSON(e)}); } },
    call:respond,panel:{show(){ if (panel) panel.hidden = false; }}};
  for (const name of Object.keys(methods)) {
    if (name === 'help') continue;
    if (name.startsWith('cart.')) api.cart[name.slice(5)] = input => respond(name,input);
    else api[name] = input => respond(name,input);
  }
  Object.freeze(data.cart); Object.freeze(data); Object.freeze(api.cart); Object.freeze(api.panel); Object.freeze(api);
  Object.defineProperty(window,namespace,{value:api,configurable:true});
  function mount() {
    if (document.getElementById('shop-agent-tools')) return;
    panel = document.createElement('section'); panel.id = 'shop-agent-tools'; panel.setAttribute('aria-label','Shopping tools for agents');
    panel.style.cssText = 'display:block;position:relative;box-sizing:border-box;margin:0;padding:12px 20px;background:#eff6ff;color:#162c45;border-bottom:1px solid #aec7e3;font:14px/1.5 system-ui;text-align:left;';
    const title = document.createElement('strong'); title.textContent = 'Shopping tools for agents';
    const notice = document.createElement('p'); notice.style.margin = '4px 0';
    notice.textContent = `For agentic use call window.${namespace}.help(). Search, inspect product images/details, and manage this basket without page navigation. JavaScript batching supported. Or open Agent tools below.`;
    const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Agent tools';
    const instructions = document.createElement('p'); instructions.textContent = 'Responses are YAML. Submit JSON: {"method":"help"}. Responses appear below. For other commands use {"method":"search","input":{"queries":[{"query":"scarf"}]}}.';
    const form = document.createElement('form'), label = document.createElement('label'); label.textContent = 'Agent request'; label.htmlFor = 'shop-agent-request';
    const input = document.createElement('textarea'); input.id = label.htmlFor; input.value = '{"method":"help"}'; input.rows = 3; input.maxLength = 16000;
    input.style.cssText = 'display:block;width:100%;max-width:900px;color:#162c45;background:white;font:13px monospace;';
    const button = document.createElement('button'); button.type = 'submit'; button.textContent = 'Run agent command';
    const output = document.createElement('pre'); output.id = 'shop-agent-response'; output.setAttribute('aria-label','Agent response'); output.setAttribute('role','status');
    output.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:500px;overflow:auto;color:#162c45;background:white;font:13px/1.5 monospace;';
    const publish = value => { output.dataset.state = value.state; output.textContent = yaml(compact(value)); };
    publish({state:'idle'});
    form.addEventListener('submit',async event => {
      event.preventDefault(); if (button.disabled) return;
      button.disabled = true; input.disabled = true; let requestId;
      try {
        const req = JSON.parse(input.value); keys(req,['method','input','requestId']);
        requestId = req.requestId || req.input?.requestId || null;
        publish({state:'pending',requestId,method:req.method});
        const value = await call(req.method,req.input);
        publish({state:'complete',requestId,ok:true,value});
      } catch(e) { publish({state:'complete',requestId,ok:false,error:errorJSON(e)}); }
      finally { button.disabled = false; input.disabled = false; }
    });
    form.append(label,input,button); details.append(summary,instructions,form,output); panel.append(title,notice,details); document.body.prepend(panel);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',mount,{once:true}); else mount();
})();
