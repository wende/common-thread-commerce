/* Run in a LOCAL Common Thread shop page after injecting shop-agent.js.
 * Exercises real cart writes, then restores quantities present before this test.
 * This is an integration test, not a Luna prompt or an agent shopping tool.
 */
(async () => {
  const api = [window.mcp,window.shopAgent].find(x => x?.brand === 'shop-agent/page-api')?.data;
  if (!api) throw Error('Inject shopping-agent/shop-agent.js first.');
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const snapshot = basket => JSON.stringify(basket.lines.map(l => [l.lineId,l.productId,l.quantity]).sort());
  const prefix = 'integration-' + Date.now();
  const before = await api.cart.read(), report = {platform:api.help().platform,checks:[],before:snapshot(before)};
  let wrote = false;
  try {
    const first = await api.list({limit:20});
    check(first.nativeTotal >= 530 && first.nextCursor,'Native catalog must contain all 530 merchandise products.');
    const second = await api.list({limit:20,cursor:first.nextCursor});
    check(second.products.length <= 20 && second.products[0].id !== first.products[0].id,'Pagination must advance.');
    const details = await api.products({ids:[...first.products,...second.products].map(p=>p.id)});
    const available = details.results.filter(p=>!p.error && p.inStock===true && p.optionsSupport==='automatic' && p.purchasable!==false);
    const firstIds = new Set(first.products.map(p=>p.id));
    const candidates = [...available.filter(p=>firstIds.has(p.id)).slice(0,2),available.find(p=>!firstIds.has(p.id))];
    check(candidates.length===3 && candidates.every(Boolean),'Need three available simple products across two native pages.');
    const query = {queries:candidates.map(p=>({query:p.name,limit:2}))};
    const found = await api.search(query);
    check(found.results.every(r => r.products?.length && r.products.length <= 2),'Every bounded search must return a product.');
    const products = found.results.map((r,i) => r.products.find(p=>p.id===candidates[i].id));
    check(products.every(Boolean),'Native keyword search must retain the discovered products.');
    check(!first.products.some(p => p.id === products[2].id),'Target must be beyond the first native page.');
    report.checks.push('native-pagination','bounded-discovery-beyond-first-page');
    const requests = (await api.stats()).networkRequests;
    await api.search(query);
    check((await api.stats()).networkRequests === requests,'Repeated query should reuse the page cache.');
    report.checks.push('query-cache');
    const filterStart=(await api.stats()).networkRequests;
    let rejected=false;
    try { await api.list({query:'hoodie',category:'Hoodies',onSale:true,inStock:true,match:'all',limit:3,maxPages:3}); }
    catch(e) { rejected=e.code==='INVALID_ARGUMENT'; }
    check(rejected && (await api.stats()).networkRequests===filterStart,'Structured filters must be rejected before networking.');
    report.checks.push('structured-filters-rejected-before-networking');
    const detail = await api.products({ids:products.map(p => p.id)});
    check(detail.results.every(p => !p.error && p.optionsSupport === 'automatic'),'Expected simple, purchasable fixture products.');
    const input = {requestId:prefix+'-add',expectedRevision:(await api.cart.read()).revision,items:products.map(p => ({productId:p.id,quantity:1}))};
    wrote = true;
    const added = await api.cart.addMany(input);
    check(added.status === 'complete','Add batch must be confirmed: '+JSON.stringify(added));
    const replay = await api.cart.addMany(input);
    check(replay.replayed && snapshot(added.basket) === snapshot(replay.basket),'Replay must not add again.');
    report.checks.push('three-item-native-basket','request-replay');
    const verification = await api.cart.verify();
    check(verification.native.matched !== false,'Native basket must not disagree.');
    report.nativeVerification = verification.status;
    report.selected = products.map(p => ({id:p.id,name:p.name}));
    report.added = added.basket.lines.map(p => ({id:p.productId,quantity:p.quantity,price:p.price}));
  } finally {
    if (wrote) {
      const current = await api.cart.read();
      const changes = current.lines.map(l => ({lineId:l.lineId,quantity:before.lines.find(b => b.lineId === l.lineId)?.quantity || 0}))
        .filter(i => current.lines.find(l => l.lineId === i.lineId).quantity !== i.quantity);
      if (changes.length) {
        const restored = await api.cart.updateMany({requestId:prefix+'-restore',expectedRevision:current.revision,items:changes});
        check(restored.status === 'complete','Restoration needs attention: '+JSON.stringify(restored));
      }
      const after = await api.cart.read();
      check(snapshot(after) === snapshot(before),'Original basket quantities must be preserved.');
      report.checks.push('quantity-update-and-removal','original-basket-restored');
    }
  }
  report.status = 'pass';
  return report;
})();
