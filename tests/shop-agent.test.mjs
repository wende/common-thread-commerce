import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../shopping-agent/shop-agent.js', import.meta.url), 'utf8');
// A native Store API contract stub. Live integration checks cover the actual DOM/themes.
function fixture() {
  const storage = new Map(), state = {cart:[], requests:[], behavior:null, configurable:false, outOfStock:false, count:530, overrides:{}};
  const prices = {price:'2500',regular_price:'3000',currency_code:'USD',currency_minor_unit:2};
  const product = id => ({id:Number(id),name:`Product ${id}`,sku:`SKU-${id}`,permalink:`https://shop.test/product/${id}/`,type:'simple',
    prices,images:[{src:'https://shop.test/shirt.jpg',alt:'Product image'}],attributes:[],categories:[],on_sale:true,is_in_stock:!state.outOfStock,is_purchasable:true,has_options:state.configurable,
    add_to_cart:{minimum:1,maximum:10},description:'Description',short_description:'Short',...state.overrides[id]});
  function cart() {
    return {items:state.cart.map(l => ({...product(l.id),key:l.key,quantity:l.quantity,variation:[],totals:{line_total:String(l.quantity*2500),currency_minor_unit:2,currency_code:'USD'}})),
      totals:{total_items:String(state.cart.reduce((n,l) => n+l.quantity*2500,0)),total_price:'0',currency_minor_unit:2,currency_code:'USD'}};
  }
  async function fetch(input, options) {
    const u = new URL(input); state.requests.push({url:u.href,method:options.method,body:options.body});
    let value;
    if (u.pathname.endsWith('/products/categories')) value = [{id:7,name:'Accessories',count:2}];
    else if (u.pathname.endsWith('/products')) { const size=Number(u.searchParams.get('per_page')) || 20, start=(Number(u.searchParams.get('page') || 1)-1)*size; value=Array.from({length:Math.max(0,Math.min(size,state.count-start))},(_,i)=>product(start+i+1)); }
    else if (/\/products\/\d+$/.test(u.pathname)) value = product(u.pathname.split('/').at(-1));
    else if (u.pathname.endsWith('/cart')) value = cart();
    else if (u.pathname.endsWith('/cart/add-item')) {
      const item = JSON.parse(options.body);
      if (state.behavior === 'reject') return new Response(JSON.stringify({code:'bad',message:'Rejected'}),{headers:{'Content-Type':'application/json'}});
      if (state.behavior === 'fail-before') throw new TypeError('Network lost');
      const line = state.cart.find(l => l.id === item.id);
      if (line) line.quantity += item.quantity; else state.cart.push({id:item.id,key:`line-${item.id}`,quantity:item.quantity});
      if (state.behavior === 'fail-after') throw new TypeError('Response lost');
      if (state.behavior === 'alter-other') state.cart.find(l => l.id === 99).quantity++;
      value = cart();
    } else if (/\/cart\/(update-item|remove-item)$/.test(u.pathname)) {
      const item = JSON.parse(options.body), line = state.cart.find(l => l.key === item.key);
      if (item.quantity) line.quantity = item.quantity; else state.cart = state.cart.filter(l => l.key !== item.key);
      value = cart();
    } else throw new Error(`Unexpected endpoint ${u}`);
    return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json','Nonce':'test-nonce','X-WP-Total':String(state.count)}});
  }
  function boot({collision=false,unsupported=false,blockedStorage=false,magentoReady=false}={}) {
    const window = {CustomEvent:class{}, ...(collision ? {mcp:{unrelated:true}} : {})};
    if (magentoReady) { window.BASE_URL='https://shop.test/';window.require=Object.assign(()=>{}, {specified:name=>name==='mage/url'}); }
    const document = {readyState:'loading',addEventListener(){},body:{dispatchEvent(){}},querySelector(selector) {
      if (unsupported) return null;
      if (selector.startsWith('body.woocommerce')) return {};
      if (selector.startsWith('link[rel=')) return {href:'https://shop.test/wp-json/'};
      if (selector.startsWith('a.cart-contents')) return {href:'https://shop.test/cart/'};
      return null;
    }};
    const context = vm.createContext({window,document,location:{origin:'https://shop.test',href:'https://shop.test/',pathname:'/'},
      sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>{if(blockedStorage)throw Error('Blocked');storage.set(k,v);}},
      fetch,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,performance,console,CustomEvent:class{},
      DOMParser:class { parseFromString(s) { return {body:{textContent:s.replace(/<[^>]*>/g,'')}}; } }});
    vm.runInContext(source,context);
    return {api:(collision ? window.shopAgent : window.mcp).data,publicApi:collision ? window.shopAgent : window.mcp,window,context};
  }
  return {boot,state,storage};
}
const writes = f => f.state.requests.filter(r => r.method === 'POST').length;
const add = (id='a',productId='1',quantity=1) => ({requestId:id,items:[{productId,quantity}]});

test('installation needs no network and preserves an occupied namespace', () => {
  const f=fixture(),{api,window}=f.boot({collision:true});
  assert.equal(window.mcp.unrelated,true); assert.equal(api.help().namespace,'window.shopAgent'); assert.equal(f.state.requests.length,0);
});
test('unknown stores expose an explicit unsupported status', async () => {
  const {api}=fixture().boot({unsupported:true}); assert.equal(api.help().platform,'unsupported');
  await assert.rejects(api.cart.read(),{code:'UNSUPPORTED_STORE'});
});
test('Magento stays detectable after initialization consumes mage DOM attributes', () => {
  const {api}=fixture().boot({unsupported:true,magentoReady:true});
  assert.equal(api.help().platform,'magento');
});
test('bounded search carries native total/cursor, caches duplicate concurrent queries, and isolates query errors', async () => {
  const f=fixture(),{api}=f.boot();
  const r=await api.search({queries:[{query:'shirt',limit:1},{query:'shirt',limit:1},{query:'x',filters:{wrongFilter:2}}]});
  assert.equal(r.results[0].total,530); assert.equal(r.results[0].products.length,1); assert.equal(r.results[0].nextCursor,'v3:1:1');
  assert.equal(f.state.requests.length,1); assert.equal(r.results[2].error.code,'INVALID_ARGUMENT');
  await api.list({query:'shirt',limit:1,cursor:'2'}); assert.equal(new URL(f.state.requests.at(-1).url).searchParams.get('page'),'2');
});
test('invalid queries and arbitrary methods are rejected without requests', async () => {
  const f=fixture(),{api}=f.boot();
  assert.equal((await api.search({queries:[{query:'a',limit:999}]})).results[0].error.code,'INVALID_ARGUMENT');
  await assert.rejects(api.call('constructor',{}),{code:'UNKNOWN_METHOD'});
  await assert.rejects(api.call('checkout',{}),{code:'UNKNOWN_METHOD'}); assert.equal(f.state.requests.length,0);
});
test('fresh cart preserves unrelated lines and request replay survives reinjection/reload', async () => {
  const f=fixture();f.state.cart=[{id:99,key:'old',quantity:2}]; let {api}=f.boot();
  assert.equal((await api.cart.addMany(add())).status,'complete'); assert.equal(writes(f),1);
  assert.equal(f.state.cart[0].quantity,2);
  assert.equal((await api.cart.addMany(add())).replayed,true); assert.equal(writes(f),1);
  api=f.boot().api; assert.equal((await api.cart.addMany(add())).replayed,true); assert.equal(writes(f),1);
  await assert.rejects(api.cart.addMany(add('a','2')),{code:'REQUEST_ID_CONFLICT'});
});
test('all products validate before any batch writes (configuration and stock)', async () => {
  for(const key of ['configurable','outOfStock']) {
    const f=fixture(),{api}=f.boot();f.state[key]=true;
    await assert.rejects(api.cart.addMany({requestId:key,items:[{productId:'1',quantity:1},{productId:'2',quantity:1}]}));
    assert.equal(writes(f),0);
  }
});
test('duplicate IDs, stock limits and stale basket revision prevent writes', async () => {
  const f=fixture(),{api}=f.boot();
  await assert.rejects(api.cart.addMany({requestId:'dupes',items:[...add().items,...add().items]}),{code:'INVALID_ARGUMENT'});
  await assert.rejects(api.cart.addMany(add('limit','1',11)),{code:'QUANTITY_LIMIT'});
  await assert.rejects(api.cart.addMany({...add('stale'),expectedRevision:'old'}),{code:'CART_CHANGED'});
  assert.equal(writes(f),0);
});
test('unknown write stops the batch and blocks new writes, even after reload', async () => {
  const f=fixture();let {api}=f.boot();f.state.behavior='fail-before';
  const r=await api.cart.addMany({requestId:'lost',items:[{productId:'1',quantity:1},{productId:'2',quantity:1}]});
  assert.equal(r.status,'unknown');assert.equal(r.results[1].status,'not_attempted');assert.equal(writes(f),1);
  api=f.boot().api;
  await assert.rejects(api.cart.addMany(add('other')),{code:'WRITE_PENDING'});
  assert.equal((await api.cart.reconcile({requestId:'lost'})).status,'unknown');assert.equal(writes(f),1);
});
test('lost response reconciles an applied write without replaying it', async () => {
  const f=fixture(),{api}=f.boot();f.state.behavior='fail-after';
  assert.equal((await api.cart.addMany(add())).status,'unknown');
  assert.equal((await api.cart.reconcile({requestId:'a'})).status,'complete');
  assert.equal(writes(f),1);assert.equal(f.state.cart[0].quantity,1);
});
test('reload between confirmed last step and final result can reconcile', async () => {
  const f=fixture();let {api}=f.boot();await api.cart.addMany(add());
  const key=[...f.storage.keys()].find(k=>k.includes(':operations:')),ledger=JSON.parse(f.storage.get(key));
  ledger.a.status='pending';ledger.a.active=null;delete ledger.a.result;
  f.storage.set(key,JSON.stringify(ledger));api=f.boot().api;
  assert.equal((await api.cart.reconcile({requestId:'a'})).status,'complete');assert.equal(writes(f),1);
});
test('unrelated cart change prevents a false success', async () => {
  const f=fixture(),{api}=f.boot();f.state.cart=[{id:99,key:'old',quantity:1}];f.state.behavior='alter-other';
  assert.equal((await api.cart.addMany(add())).status,'unknown');
});
test('updates use absolute quantities and remove only the requested line', async () => {
  const f=fixture(),{api}=f.boot();f.state.cart=[{id:1,key:'one',quantity:1},{id:2,key:'two',quantity:3}];
  assert.equal((await api.cart.updateMany({requestId:'update',items:[{lineId:'one',quantity:2}]})).status,'complete');
  assert.equal((await api.cart.updateMany({requestId:'remove',items:[{lineId:'one',quantity:0}]})).status,'complete');
  assert.deepEqual(f.state.cart,[{id:2,key:'two',quantity:3}]);
});
test('session storage failure prevents the first write', async () => {
  const f=fixture(),{api}=f.boot({blockedStorage:true});
  await assert.rejects(api.cart.addMany(add()),{code:'STORAGE_UNAVAILABLE'});assert.equal(writes(f),0);
});
test('explicit store rejection is reported without automatic retries', async () => {
  const f=fixture(),{api}=f.boot();f.state.behavior='reject';
  const r=await api.cart.addMany(add());assert.equal(r.status,'partial');assert.equal(r.results[0].status,'rejected');assert.equal(writes(f),1);
});


test('discovered IDs survive reload, but details and cart preflight remain fresh', async () => {
  const f=fixture(); let {api}=f.boot();
  const r=await api.search({queries:[{query:'shirt'}]});
  assert.equal(r.results[0].products[0].images[0].url,'https://shop.test/shirt.jpg');
  const refs=JSON.parse(f.storage.get('shop-agent:v2:discovery:https://shop.test'));
  assert.deepEqual(Object.keys(refs[0]).sort(),['id','sku','url']);
  api=f.boot().api;
  assert.equal((await api.products({ids:['1']})).results[0].description,'Description');
  f.state.outOfStock=true;
  await assert.rejects(api.cart.addMany(add('fresh')),{code:'UNAVAILABLE'});
  assert.equal(writes(f),0);
});
test('category names resolve to native IDs, with explicit scope and no silent fallback', async () => {
  const f=fixture(),{api}=f.boot();
  assert.equal((await api.categories()).categories[0].id,'7');
  await api.list({category:'accessories'});
  assert.equal(new URL(f.state.requests.at(-1).url).searchParams.get('category'),'7');
  await assert.rejects(api.list({category:'made up'}),{code:'UNKNOWN_CATEGORY'});
});
test('run supports async JavaScript batching and compact result selection', async () => {
  const f=fixture(),{api}=f.boot();
  const result=await api.run(async shop => {
    const r=await shop.search({queries:[{query:'shirt',limit:2},{query:'shirt',limit:2}]});
    return r.results.map(x=>x.products.filter(p=>p.onSale).map(p=>p.id));
  });
  assert.equal(JSON.stringify(result),'[["1","2"],["1","2"]]');
  assert.equal(f.state.requests.length,1);
  await assert.rejects(api.run('return 1'),{code:'INVALID_ARGUMENT'});
});

test('filtered scans resume inside and between native pages without losing matches', async () => {
  const f=fixture(),{api}=f.boot(); f.state.count=65;
  for (const id of [3,20,21,44,65]) f.state.overrides[id]={name:'Red shirt'};
  let cursor, ids=[];
  do {
    const r=await api.list({query:'red shirt',match:'all',limit:2,maxPages:1,...(cursor?{cursor}:{})});
    assert.equal(r.total,null); assert.ok(r.coverage.pagesRead<=1);
    ids.push(...r.products.map(p=>p.id)); cursor=r.nextCursor;
  } while(cursor);
  assert.deepEqual(ids,['3','20','21','44','65']);
});
test('bounded empty filtered results report remaining coverage instead of absence', async () => {
  const f=fixture(),{api}=f.boot(); f.state.overrides[65]={name:'Red shirt'};
  const r=await api.list({query:'red shirt',match:'all',maxPages:3});
  assert.equal(r.products.length,0);assert.equal(r.coverage.inspected,60);
  assert.equal(r.outcome,'no-match-in-scanned-pages');assert.equal(r.nextCursor,'v3:4:0');
  assert.equal((await api.list({query:'red shirt',match:'all',cursor:r.nextCursor})).products[0].id,'65');
});
test('price filters compose with native sale filters and batch errors stay local', async () => {
  const f=fixture(),{api}=f.boot(); f.state.count=3;
  f.state.overrides[2]={prices:{price:'1000',regular_price:'2000',currency_code:'USD',currency_minor_unit:2}};
  const r=await api.search(['shirt',{query:'shirt',onSale:true,maxPrice:15},{query:'shirt',filters:[]},null]);
  assert.equal(r.results[0].products.length,3);
  assert.equal(r.results[1].products[0].id,'2');assert.equal(r.results[1].products.length,1);
  assert.equal(r.results[2].error.code,'INVALID_ARGUMENT');assert.equal(r.results[3].error.code,'INVALID_ARGUMENT');
  assert.ok(f.state.requests.some(r=>new URL(r.url).searchParams.get('on_sale')==='true'));
});
test('YAML is the default, raw objects support batching, and errors stay structured', async () => {
  const f=fixture(),{api,publicApi}=f.boot();
  assert.match(publicApi.help(),/output: "YAML/);
  const rendered=await publicApi.search(['shirt']);
  assert.match(rendered,/results:\n/);assert.match(rendered,/price: 25/);
  assert.doesNotMatch(rendered,/permalink:|images:|https:\/\/shop.test\/shirt/);
  const raw=await api.search(['shirt']);assert.equal(raw.results[0].products[0].price.amount,25);
  assert.equal(await publicApi.run(async shop=>(await shop.list({limit:1})).products.map(p=>p.id)),'- "1"');
  assert.match(await publicApi.call('checkout'),/code: "UNKNOWN_METHOD"/);
});
test('larger detail batches are bounded and do not reject 21 discovered products', async () => {
  const f=fixture(),{api}=f.boot();
  const a=await api.list({limit:20}),b=await api.list({limit:1,cursor:a.nextCursor});
  const details=await api.products({ids:[...a.products,...b.products].map(p=>p.id)});
  assert.equal(details.results.length,21);assert.ok(details.results.every(p=>!p.error));
});
test('YAML scalar escaping and cycles', () => {
  const {publicApi}=fixture().boot();
  assert.equal(publicApi.yaml({yes:'on',text:'line\nnext\u0085',empty:[],nested:{x:null}}),'"yes": "on"\ntext: "line\\nnext\\u0085"\nempty: []\nnested:\n  x: null');
  assert.equal(publicApi.yaml({empty:{omitted:undefined},big:1e21}),'empty: {}\nbig: 1.0e+21');
  const cyclic={};cyclic.self=cyclic;assert.throws(()=>publicApi.yaml(cyclic),{code:'UNSERIALIZABLE_RESULT'});
  assert.throws(()=>publicApi.yaml(new Date()),{code:'UNSERIALIZABLE_RESULT'});
});
