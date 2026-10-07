import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { constructBasket, createGlovoCatalog, createJevClient, categoryIndex, catalogSections,
  parseLosslessJson, normalizeItems, NO_MATCH } from '../tools/basket-constructor.mjs';

// These tests cannot fall back to the network, even if an injected dependency is forgotten.
globalThis.fetch = async () => { throw new Error('Live network access is forbidden in basket-constructor tests.'); };
const root = JSON.parse(await readFile(new URL('./fixtures/biedronka-navigation.json', import.meta.url), 'utf8'));
const layouts = JSON.parse(await readFile(new URL('./fixtures/biedronka-sections.json', import.meta.url), 'utf8'));
const exampleShopping = JSON.parse(await readFile(new URL('../examples/pasta-basket.json', import.meta.url), 'utf8'));
const shopping = ['Spaghetti', 'Passata', 'Bazylia', 'Tuna', 'Cream', 'Parsley'];
const store = { id: 207442, addressId: 336099, categoryId: 1, name: 'Biedronka', slug: 'biedronka-express-kra', open: true, enabled: true };
const profile = { headers: { 'glovo-delivery-location-latitude': '50', 'glovo-delivery-location-longitude': '20' } };
const clone = structuredClone;
const product = (id, name, extra = {}) => ({ id: String(id), name, storeProductId: `store-product-${id}`,
  externalId: `external-${id}`, price: 5.99, priceInfo: { amount: 5.99, currencyCode: 'PLN', displayText: '5,99 zł' },
  attributeGroups: [], outOfStock: false, ...extra });
const products = {
  Spaghetti: product('4611686018923518294', 'Makaron spaghetti durum 500 g'),
  Passata: product('4611686018923518295', 'Przecier pomidorowy passata 500 g'),
  Bazylia: product('4611686018923518296', 'Bazylia świeża 15 g'),
  Tuna: product('4611686018923518297', 'Tuńczyk kawałki w sosie własnym 170 g'),
  Cream: product('4611686018923518298', 'Śmietanka do gotowania 30% 250 ml'),
  Parsley: product('4611686018923518299', 'Natka pietruszki 30 g'),
};
const grid = (title, entries) => ({ type: 'GRID', data: { title, elements: entries.map(data => ({ type: 'PRODUCT_TILE', data })) } });
const categoryTargets = { Spaghetti: 'Kuchnia włoska', Passata: 'Kuchnia włoska', Bazylia: 'Warzywa i zioła',
  Tuna: 'Produkty konserwowe', Cream: 'Mleko i śmietana', Parsley: 'Warzywa i zioła' };
const sectionTargets = { Spaghetti: 'Włoskie makarony i ryże', Passata: 'Włoskie sosy i kremy', Bazylia: 'Warzywa.',
  Tuna: 'Konserwy rybne', Cream: 'Śmietana', Parsley: 'Warzywa.' };

function fixture({ mutateContent, transformAnswer, answerTargets = {}, failJev, failPut, requiredOptions = false, nested = false, nativeFailure } = {}) {
  const contents = new Map(layouts.categories.map(c => [c.endpoint, clone(c.content)]));
  const catalogEntries = categoryIndex(root, store);
  const tunaRoute = catalogEntries.find(c => c.title.endsWith(' > Produkty konserwowe')).endpoint;
  const tuna = grid('Konserwy rybne', [clone(products.Tuna), product('200', 'Fasola czerwona 400 g')]);
  contents.set(tunaRoute, { type: 'GRID_VIEW_LAYOUT', data: { body: [tuna] } });
  const vegetables = layouts.categories.find(c => c.name === 'Warzywa i zioła').endpoint;
  contents.get(vegetables).data.body[0] = grid('Warzywa.', [clone(products.Bazylia), clone(products.Parsley), product('201', 'Pietruszka korzeń 500 g')]);
  const dairy = layouts.categories.find(c => c.name === 'Mleko i śmietana').endpoint;
  const cream = clone(products.Cream);
  if (requiredOptions) cream.attributeGroups = [{ id: 'size', name: 'Opakowanie', min: 1, max: 1,
    attributes: [{ id: 'small', name: '250 ml' }, { id: 'large', name: '500 ml' }] }];
  contents.get(dairy).data.body[0] = grid('Śmietana', [cream, product('202', 'Śmietana kwaśna 18% 200 g')]);
  const italian = layouts.categories.find(c => c.name === 'Kuchnia włoska').content;
  const pastaRoute = italian.data.body.find(n => n.data.title === sectionTargets.Spaghetti).data.contentUri;
  const sauceRoute = italian.data.body.find(n => n.data.title === sectionTargets.Passata).data.contentUri;
  contents.set(pastaRoute, grid('Włoskie makarony i ryże', [clone(products.Spaghetti),
    product('203', 'Makaron penne 500 g'), product('204', 'Makaron spaghetti pełnoziarnisty 500 g'),
    product('205', 'Spaghetti wyprzedane', { outOfStock: true })]));
  contents.set(sauceRoute, grid('Włoskie sosy i kremy', [clone(products.Passata), product('206', 'Zupa pomidorowa 400 g'), product('207', 'Pesto z bazylią 190 g')]));
  if (nested) contents.set(pastaRoute, { type: 'GRID_VIEW_LAYOUT', data: { body: [
    grid('Durum', [clone(products.Spaghetti)]), grid('Bezglutenowe', [product('208', 'Spaghetti bezglutenowe')]) ] } });
  mutateContent?.(contents);
  const requests = [], decisions = [], checkpoints = [];
  let basket, puts = 0;
  async function decide(request) {
    decisions.push(clone(request));
    const stage = request.questions.item_1.instructions.match(/^Choose the (\w+) /)[1];
    const answers = Object.fromEntries(request.state.items.map(item => {
      const criteria = request.questions[item.id].criteria;
      const target = answerTargets[stage]?.[item.query] ?? (stage === 'category' ? categoryTargets[item.query]
        : stage === 'subcategory' ? sectionTargets[item.query]
          : item.features.includes('wholegrain') ? 'Makaron spaghetti pełnoziarnisty 500 g' : products[item.query]?.name);
      const selected = Object.keys(criteria).find(key => key !== NO_MATCH &&
        (stage === 'product' ? JSON.parse(criteria[key]).name === target
          : stage === 'subcategory' ? JSON.parse(criteria[key]).section === target : criteria[key].endsWith(target)));
      assert.ok(selected, `Mock answer target is missing for ${item.query} at ${stage}`);
      return [item.id, { type: 'choice', choice: selected, confidence: .99,
        probabilities: Object.fromEntries(Object.keys(criteria).map(key => [key, key === selected ? 1 : 0])) }];
    }));
    transformAnswer?.(stage, answers);
    return { model: 'typesafe/jev-1.13-offline-fixture', provider: 'offline-mock', answers,
      usage: { input_tokens: 1000, output_tokens: 100, cost: .000042, input_tokens_details: { cached_tokens: 400 } } };
  }
  async function fetchImpl(url, options) {
    requests.push({ url, ...options });
    const parsed = new URL(url), path = parsed.pathname + parsed.search;
    const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (parsed.origin === 'https://openrouter.ai') {
      if (failJev) return response({ error: { message: 'unavailable' } }, failJev);
      return response(await decide(JSON.parse(options.body)));
    }
    assert.equal(parsed.origin, 'https://api.glovoapp.com');
    if (path.startsWith('/v3/stores/')) return response(store);
    if (path.startsWith('/v4/')) {
      if (nativeFailure?.(path)) return response({ error: 'Rate limited' }, 429);
      const content = parsed.search ? contents.get(path) : root;
      assert.ok(content, `Unexpected catalog fetch ${path}`);
      // Reproduce native JSON's unquoted 64-bit IDs, rather than hiding the precision bug with strings.
      const raw = JSON.stringify(content).replace(/"id":"(4611686018\d+)"/g, '"id":$1');
      return new Response(raw, { status: 200, headers: { 'content-type': 'application/json' } });
    }
    assert.ok(path.startsWith('/v2/guest/customers/'));
    if (!basket) basket = { basketId: 'offline-basket', customerId: Number(parsed.pathname.split('/')[4]), basketVersion: 0,
      storeId: store.id, storeAddressId: store.addressId, products: [], basketPrice: { totalFormatted: '35,94 zł' } };
    if (options.method === 'PUT') {
      puts++;
      if (puts === failPut) throw new Error('Mock write timeout');
      const body = JSON.parse(options.body);
      basket = { ...basket, basketVersion: basket.basketVersion + 1,
        products: body.products.map(line => ({ ...line, name: Object.values(products).find(p => p.id === line.ids.id)?.name || 'Synthetic alternative' })) };
    }
    return response(basket);
  }
  const catalog = createGlovoCatalog({ profile, fetchImpl, minIntervalMs: 0,
    checkpoint: async state => checkpoints.push(clone(state)) });
  const jev = createJevClient({ apiKey: 'offline-test-key', fetchImpl });
  return { catalog, jev, requests, decisions, checkpoints, contents, puts: () => puts };
}

test('recorded navigation preserves all 100 links, including the restricted tile and Promotions', () => {
  const categories = categoryIndex(root, store);
  assert.equal(categories.length, 100);
  assert.equal(new Set(categories.map(c => c.endpoint)).size, 100);
  assert.ok(categories.some(c => c.title === 'Promotions'));
  assert.ok(categories.some(c => c.title.includes('Odkryj wyjątkowy smak.')));
  const italian = layouts.categories.find(c => c.name === 'Kuchnia włoska').content;
  const sections = catalogSections(italian, store, 'Italian');
  assert.equal(sections.length, 7);
  assert.equal(sections.filter(s => s.endpoint).length, 6);
  assert.equal(sections[0].title, 'Włoskie sery');
});

test('the current example omits basil while preserving the other five requested items', async () => {
  assert.deepEqual(exampleShopping, ['Spaghetti', 'Passata', 'Tuna', 'Cream', 'Parsley']);
  const f = fixture();
  const result = await constructBasket({ items: exampleShopping, catalog: f.catalog, jev: f.jev });
  assert.deepEqual(result.matches.map(match => match.query), exampleShopping);
  assert.equal(result.manifest.items.length, 5);
  assert.equal(result.jevRequestCount, 3);
  assert.ok(f.decisions.every(request => request.state.items.length === 5));
});

test('the six-input plan uses exactly three batched Jev calls, resolves lazy leaves and preserves every item', async () => {
  const f = fixture();
  const result = await constructBasket({ items: shopping, catalog: f.catalog, jev: f.jev });
  assert.equal(result.status, 'planned');
  assert.equal(result.jevRequestCount, 3);
  assert.deepEqual(result.decisions.map(d => d.stage), ['category', 'subcategory', 'product']);
  assert.deepEqual(result.matches.map(m => m.query), shopping);
  assert.deepEqual(result.matches.map(m => m.productId), shopping.map(q => products[q].id));
  assert.equal(result.manifest.items.length, 6);
  for (const request of f.decisions) assert.equal(Object.keys(request.questions).length, 6);
  for (const question of Object.values(f.decisions[0].questions)) assert.equal(Object.keys(question.criteria).length, 101);
  assert.ok(Object.values(f.decisions[2].questions.item_1.criteria).some(v => v.includes('penne')));
  assert.ok(Object.values(f.decisions[2].questions.item_1.criteria).some(v => v.includes('pełnoziarnisty')));
  assert.ok(!Object.values(f.decisions[2].questions.item_1.criteria).some(v => v.includes('wyprzedane')));
  assert.equal(result.fetchedContentPaths.length, 6); // Four unique categories plus two selected lazy sections.
  assert.equal(new Set(result.fetchedContentPaths).size, 6);
  assert.equal(f.puts(), 0);
  assert.ok(!f.requests.some(r => r.url.includes('/guest/customers/')));
  assert.equal(result.decisions[0].usage.input_tokens_details.cached_tokens, 400);
});

test('mocked native basket receives six exact products and is checked by a fresh GET; no live services', async () => {
  const f = fixture();
  const result = await constructBasket({ items: shopping, catalog: f.catalog, jev: f.jev, commit: true });
  assert.equal(result.status, 'complete');
  assert.equal(result.jevRequestCount, 3);
  assert.equal(f.puts(), 6);
  assert.equal(f.requests.at(-1).method, 'GET');
  assert.deepEqual(result.basket.products.map(p => p.productId), shopping.map(q => products[q].id));
  assert.deepEqual(f.checkpoints.filter(c => c.phase === 'write_pending').map(c => c.pendingProductId), shopping.map(q => products[q].id));
  assert.equal(f.checkpoints.at(-1).phase, 'complete');
  const modelBodies = f.requests.filter(r => r.url.startsWith('https://openrouter.ai')).map(r => r.body).join('');
  assert.ok(!/latitude|longitude|delivery-location|offline-test-key|customerId|sessionId/.test(modelBodies));
  const native = f.requests.filter(r => r.url.startsWith('https://api.glovoapp.com'));
  assert.ok(native.every(r => !Object.keys(r.headers).some(k => /cookie|authorization/i.test(k))));
});

test('herb routing retains the parent category and complete loaded inventory behind a broad section label', async () => {
  const f = fixture();
  await constructBasket({ items: shopping, catalog: f.catalog, jev: f.jev });
  for (const id of ['item_3', 'item_6']) {
    const question = f.decisions[1].questions[id];
    const sections = Object.entries(question.criteria).filter(([key]) => key !== NO_MATCH).map(([, value]) => JSON.parse(value));
    assert.ok(sections.every(section => section.parentCategory === 'Owoce i warzywa > Warzywa i zioła'));
    const vegetables = sections.find(section => section.section === 'Warzywa.');
    assert.equal(vegetables.inventoryStatus, 'loaded');
    assert.deepEqual(vegetables.loadedProducts.map(product => product.name), [products.Bazylia.name, products.Parsley.name, 'Pietruszka korzeń 500 g']);
    assert.ok(sections.some(section => section.inventoryStatus === 'not_fetched' && section.loadedProducts === null));
    assert.match(question.instructions, /broad section label/);
  }
  const pasta = Object.entries(f.decisions[1].questions.item_1.criteria).filter(([key]) => key !== NO_MATCH).map(([, value]) => JSON.parse(value));
  assert.equal(pasta.find(section => section.section === sectionTargets.Spaghetti).inventoryStatus, 'not_fetched');
  assert.equal(f.decisions.length, 3);
  assert.equal(f.requests.filter(request => request.url.startsWith('https://api.glovoapp.com')).length, 8);
});

test('basil absent from vegetables can resolve through the positively ranked spices route within three calls', async () => {
  const spices = categoryIndex(root, store).find(category => category.title.endsWith(' > Przyprawy, sól i pieprz'));
  const alternateIndex = categoryIndex(root, store).findIndex(category => category.endpoint === spices.endpoint);
  const f = fixture({
    mutateContent: contents => {
      const vegetables = layouts.categories.find(category => category.name === 'Warzywa i zioła').endpoint;
      contents.get(vegetables).data.body[0] = grid('Warzywa.', [clone(products.Parsley), product('201', 'Pietruszka korzeń 500 g')]);
      contents.set(spices.endpoint, grid('Przyprawy', [product(products.Bazylia.id, 'Kamis Bazylia 8 g'), product('209', 'Pieprz czarny')]));
    },
    transformAnswer: (stage, answers) => {
      if (stage === 'category') answers.item_3.probabilities[`option_${alternateIndex}`] = .04;
    },
    answerTargets: { subcategory: { Bazylia: 'Przyprawy' }, product: { Bazylia: 'Kamis Bazylia 8 g' } },
  });
  const result = await constructBasket({ items: shopping, catalog: f.catalog, jev: f.jev });
  assert.equal(result.jevRequestCount, 3);
  assert.equal(result.matches[2].category, spices.title);
  assert.equal(result.matches[2].productName, 'Kamis Bazylia 8 g');
  assert.equal(result.matches[5].category, 'Owoce i warzywa > Warzywa i zioła');
  assert.equal(f.requests.filter(request => request.url.endsWith(spices.endpoint)).length, 1);
  assert.equal(result.fetchedContentPaths.length, 7);
  assert.equal(f.puts(), 0);
});

test('explicit feature constraints reach Jev unchanged and alternatives are not pruned', async () => {
  const f = fixture();
  const result = await constructBasket({ items: [{ query: 'Spaghetti', features: ['wholegrain'], quantity: 2 }], catalog: f.catalog, jev: f.jev });
  assert.equal(result.matches[0].productName, 'Makaron spaghetti pełnoziarnisty 500 g');
  assert.equal(result.manifest.items[0].quantity, 2);
  assert.deepEqual(f.decisions[2].state.items[0].features, ['wholegrain']);
  assert.equal(Object.keys(f.decisions[2].questions.item_1.criteria).length, 4); // All three in-stock candidates plus abstention.
});

test('an unavailable ingredient causes no writes and no fourth Jev call', async () => {
  const f = fixture({ transformAnswer: (stage, answers) => { if (stage === 'product') answers.item_6.choice = NO_MATCH; } });
  await assert.rejects(constructBasket({ items: shopping, catalog: f.catalog, jev: f.jev, commit: true }), /No suitable product for Parsley/);
  assert.equal(f.decisions.length, 3); assert.equal(f.puts(), 0);
  assert.ok(!f.requests.some(r => r.url.includes('/guest/customers/')));
});

test('an invented product option and a missing answer cannot be added', async () => {
  for (const mode of ['invented', 'missing']) {
    const f = fixture({ transformAnswer: (stage, answers) => {
      if (stage === 'product') { if (mode === 'invented') answers.item_1.choice = 'https://invalid/product'; else delete answers.item_2; }
    } });
    await assert.rejects(constructBasket({ items: shopping, catalog: f.catalog, jev: f.jev, commit: true }), /invalid product|every item/);
    assert.equal(f.puts(), 0);
  }
});

test('required product options are validated for the whole list before creating a basket', async () => {
  const f = fixture({ requiredOptions: true });
  await assert.rejects(constructBasket({ items: shopping, catalog: f.catalog, jev: f.jev, commit: true }), /Choose 1/);
  assert.equal(f.puts(), 0);
  assert.ok(!f.requests.some(r => r.url.includes('/guest/customers/')));
  const configured = fixture({ requiredOptions: true });
  const items = shopping.map(query => query === 'Cream' ? { query, choices: [{ groupId: 'size', attributeId: 'small' }] } : query);
  const result = await constructBasket({ items, catalog: configured.catalog, jev: configured.jev, commit: true });
  assert.deepEqual(result.manifest.items[4].choices, [{ groupId: 'size', attributeId: 'small', quantity: 1 }]);
});

test('a deeper catalog stops at the three-request budget instead of taking an incomplete product list', async () => {
  const f = fixture({ nested: true });
  await assert.rejects(constructBasket({ items: shopping, catalog: f.catalog, jev: f.jev, commit: true }), error => error.code === 'CATEGORY_DEPTH_BUDGET');
  assert.equal(f.decisions.length, 2); assert.equal(f.puts(), 0);
});

test('a lazy placeholder nested beside product rows cannot masquerade as a complete leaf', async () => {
  const f = fixture({ mutateContent: contents => {
    for (const [path, content] of contents) {
      if (content.data?.title === 'Włoskie makarony i ryże') content.data.elements.push({
        type: 'CONTENT_PLACEHOLDER', data: { title: 'More pasta',
          contentUri: '/v4/stores/207442/addresses/336099/content/partial?component=section&id=999' } });
    }
  } });
  await assert.rejects(constructBasket({ items: shopping, catalog: f.catalog, jev: f.jev, commit: true }), error => error.code === 'CATEGORY_DEPTH_BUDGET');
  assert.equal(f.decisions.length, 2); assert.equal(f.puts(), 0);
});

test('HTTP 429 from either dependency stops immediately, without automatic retries or basket writes', async () => {
  const jev = fixture({ failJev: 429 });
  await assert.rejects(constructBasket({ items: shopping, catalog: jev.catalog, jev: jev.jev, commit: true }), /Jev rejected.*429/);
  assert.equal(jev.requests.filter(r => r.url.startsWith('https://openrouter.ai')).length, 1);
  assert.equal(jev.puts(), 0);
  const glovo = fixture({ nativeFailure: path => path.includes('link=') });
  await assert.rejects(constructBasket({ items: shopping, catalog: glovo.catalog, jev: glovo.jev, commit: true }), /Native GET failed.*429/);
  assert.equal(glovo.requests.filter(r => r.url.includes('link=')).length, 1);
  assert.equal(glovo.decisions.length, 1); assert.equal(glovo.puts(), 0);
});

test('duplicate requested ingredients keep both input rows and combine quantities into one native SKU', async () => {
  const f = fixture();
  const result = await constructBasket({ items: ['Spaghetti', 'Spaghetti'], catalog: f.catalog, jev: f.jev, commit: true });
  assert.equal(result.matches.length, 2);
  assert.equal(result.manifest.items.length, 1);
  assert.equal(result.manifest.items[0].quantity, 2);
  assert.equal(f.puts(), 1);
});

test('uncertain native writes are checkpointed and never replayed', async () => {
  const f = fixture({ failPut: 2 });
  await assert.rejects(constructBasket({ items: shopping, catalog: f.catalog, jev: f.jev, commit: true }), /Mock write timeout/);
  assert.equal(f.puts(), 2);
  assert.equal(f.decisions.length, 3);
  assert.equal(f.checkpoints.at(-1).phase, 'unknown');
  assert.equal(f.checkpoints.at(-1).pendingProductId, products.Passata.id);
});

test('lossless parsing preserves native 64-bit product IDs and navigation cannot cross stores or origins', () => {
  const parsed = parseLosslessJson('{"id":4611686018923518294,"price":5.99,"count":6}');
  assert.equal(parsed.id, '4611686018923518294');
  assert.equal(parsed.price, 5.99); assert.equal(parsed.count, 6);
  for (const path of ['//evil.test/path', '/v4/stores/999/addresses/336099/content/main', 'https://api.glovoapp.com/v4/stores/207442/addresses/336099/content/main']) {
    const changed = clone(root);
    changed.data.body[0].data.action.data.path = path;
    assert.throws(() => categoryIndex(changed, store), /this store and address/);
  }
});

test('invalid user input and the CLI live guard prevent any accidental run', () => {
  for (const items of [[], [''], [{ query: 'Cream', quantity: 0 }], [{ query: 'Tuna', features: 'fresh' }]])
    assert.throws(() => normalizeItems(items));
  const file = new URL('../tools/basket-constructor.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [file.pathname, 'create'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--live/);
  const help = spawnSync(process.execPath, [file.pathname, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Offline tests/);
});
