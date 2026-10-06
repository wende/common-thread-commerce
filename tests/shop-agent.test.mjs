import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../shopping-agent/shop-agent.js', import.meta.url), 'utf8');
// A native Store API contract stub. Live integration checks cover the actual DOM/themes.
function fixture() {
  const storage = new Map(), state = {cart:[], requests:[], behavior:null, configurable:false, outOfStock:false, count:530, overrides:{},discoveryWrites:0};
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
  function boot({collision=false,unsupported=false,blockedStorage=false,magentoReady=false,registry}={}) {
    const window = {CustomEvent:class{}, ...(collision ? {mcp:{unrelated:true}} : {})};
    if (magentoReady) { window.BASE_URL='https://shop.test/';window.require=Object.assign(()=>{}, {specified:name=>name==='mage/url'}); }
    const document = {readyState:'loading',addEventListener(){},body:{dispatchEvent(){}},querySelector(selector) {
      if (unsupported) return null;
      if (selector.startsWith('body.woocommerce')) return {};
      if (selector.startsWith('link[rel=')) return {href:'https://shop.test/wp-json/'};
      if (selector.startsWith('a.cart-contents')) return {href:'https://shop.test/cart/'};
      return null;
    }};
    if (registry) document.modelContext=registry;
    const context = vm.createContext({window,document,location:{origin:'https://shop.test',href:'https://shop.test/',pathname:'/'},
      sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>{if(blockedStorage)throw Error('Blocked');if(k.includes(':discovery:'))state.discoveryWrites++;storage.set(k,v);}},
      fetch,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,performance,console,CustomEvent:class{},
      DOMParser:class { parseFromString(s) { return {body:{textContent:s.replace(/<[^>]*>/g,'')}}; } }});
    vm.runInContext(source,context);
    return {api:(collision ? window.shopAgent : window.mcp).data,publicApi:collision ? window.shopAgent : window.mcp,window,context};
  }
  return {boot,state,storage};
}
const writes = f => f.state.requests.filter(r => r.method === 'POST').length;
const add = (id='a',productId='1',quantity=1) => ({requestId:id,items:[{productId,quantity}]});

test('Magento full catalog supplies empty native criteria and retains every record', async () => {
  const f=fixture(),{api,context}=f.boot({unsupported:true,magentoReady:true});const calls=[];
  context.fetch=async (_url,options)=>{
    const body=JSON.parse(options.body),v=body.variables;calls.push(body);
    assert.match(body.query,/filter:\$filter/);
    assert.ok(v.search || (v.filter && Object.keys(v.filter).length===0),'Magento requires an argument even without search criteria');
    const start=(v.page-1)*v.size;
    const items=Array.from({length:Math.max(0,Math.min(v.size,30-start))},(_,i)=>({id:start+i+1,sku:'M-'+(start+i+1),name:'Merchandise '+(start+i+1),url_key:'product-'+(start+i+1),__typename:'SimpleProduct',stock_status:i===0?'OUT_OF_STOCK':'IN_STOCK',categories:[],short_description:{html:'Short'},description:{html:'Description'},price_range:{minimum_price:{regular_price:{value:25,currency:'USD'},final_price:{value:25,currency:'USD'}}}}));
    return new Response(JSON.stringify({data:{products:{total_count:30,items}}}),{headers:{'Content-Type':'application/json'}});
  };
  const all=await api.catalog({limit:30,maxPages:2});
  assert.equal(all.products.length,30);assert.equal(all.coverage.complete,true);assert.equal(all.products[0].inStock,false);
  assert.ok(calls.every(x=>Object.keys(x.variables.filter).length===0));
  await api.list({query:'merchandise',limit:1});assert.equal(calls.at(-1).variables.search,'merchandise');assert.equal(calls.at(-1).variables.filter,undefined);
  const before=calls.length;await assert.rejects(api.list({category:'x'}),{code:'INVALID_ARGUMENT'});assert.equal(calls.length,before);
});

test('reference persistence coalesces listing batches and survives immediate reload after await', async () => {
  const f=fixture();const {api}=f.boot();await api.catalog({limit:100,maxPages:5});
  assert.ok(f.state.discoveryWrites<=6,`Unexpected discovery writes: ${f.state.discoveryWrites}`);
  const stored=JSON.parse([...f.storage].find(([k])=>k.includes(':discovery:'))[1]);
  assert.equal(stored.length,100);assert.ok(stored.every(p=>Object.keys(p).sort().join(',')==='id,sku,url'));
  const next=f.boot().api;assert.equal((await next.products({ids:['1','100']})).results.length,2);
  assert.equal((await next.products({ids:['100']})).results[0].id,'100');
});

test('decision columns stay stable when shared values change between catalog pages', async () => {
  const f=fixture();f.state.count=3;f.state.overrides[2]={on_sale:false,is_in_stock:false,short_description:'Different description'};
  const {api}=f.boot();const first=await api.catalogTable({limit:1});
  const second=await api.catalogTable({limit:1,cursor:first.nextCursor});
  const core=['id','name','price','inStock','description','onSale','regularPrice'];
  assert.deepEqual([...first.products.columns].slice(0,7),core);
  assert.deepEqual([...second.products.columns].slice(0,7),core);
  assert.equal(second.products.rows[0][0],'2');assert.equal(second.products.rows[0][3],false);
  assert.equal(second.products.rows[0][4],'Different description');assert.equal(second.products.rows[0][5],false);
  assert.equal(second.products.common.currency,'USD');
});

test('batched search tables retain every record, scope, error and continuation independently', async () => {
  const f=fixture();f.state.count=7;f.state.overrides[1]={is_in_stock:false};const {api,context}=f.boot();
  const tool=context.document.modelContext.getTools().find(t=>t.name==='shop_search');
  const result=await tool.execute({queries:[{query:'some',limit:2},{query:'other',limit:3},{query:'invalid',filters:{inStock:true}}]});
  assert.equal(result.results.length,3);assert.equal(result.results[0].products.rows.length,2);
  assert.equal(result.results[0].products.rows[0][3],false);assert.equal(result.results[0].nextCursor,'v3:1:2');
  assert.equal(result.results[1].products.rows.length,3);assert.equal(result.results[2].error.code,'INVALID_ARGUMENT');
  assert.match(result.scope,/no records are removed/);assert.match(result.note,/cannot establish catalog-wide absence/);
  const before=f.state.requests.length;await assert.rejects(api.searchTable({queries:[{query:'x'}],images:'tee'}),{code:'INVALID_ARGUMENT'});assert.equal(f.state.requests.length,before);
  assert.equal((await api.searchTable({queries:Array.from({length:20},()=>({query:'batch',limit:1}))})).results.length,20);
});

test('photo tool exposes one-page screenshot calling and refuses unknown identities before fetch', async () => {
  const f=fixture(),{context}=f.boot();const tool=context.document.modelContext.getTools().find(t=>t.name==='shop_view');
  assert.equal(tool.annotations.readOnlyHint,true);assert.match(tool.description,/page\.locator\(comparison.selector\)\.screenshot/);
  assert.equal((await tool.execute({ids:['not-discovered']})).error.code,'UNKNOWN_PRODUCT');
  assert.equal(f.state.requests.length,0);assert.equal((await tool.execute({ids:['1'],pageSize:37})).error.code,'INVALID_ARGUMENT');
});

test('compact listings retain later features and report truncation and known false sale status', async () => {
  const f=fixture();f.state.count=2;f.state.overrides[1]={on_sale:false,short_description:'x'.repeat(170)+' soft collar feature'};
  f.state.overrides[2]={short_description:'y'.repeat(400)};const {api}=f.boot();const c=await api.catalogTable({limit:2});
  const rows=c.products.rows.map(r=>({...c.products.common,...Object.fromEntries(c.products.columns.map((k,i)=>[k,r[i]]))}));
  assert.match(rows[0].description,/soft collar feature/);assert.equal(rows[0].descriptionTruncated,false);assert.equal(rows[0].onSale,false);
  assert.equal(rows[1].description.length,280);assert.equal(rows[1].descriptionTruncated,true);
});

test('photo failures remain visible and never remove compared products', async () => {
  const f=fixture();f.state.count=2;const {api,context}=f.boot();await api.list({limit:2});let images=[];
  const gallery={style:{},replaceChildren(){images=[];},setAttribute(){},append(){},scrollIntoView(){},querySelectorAll(){return images;}};
  context.document.getElementById=()=>gallery;
  context.document.createElement=tag=>{
    const element={style:{},dataset:{},append(){}};
    if(tag==='img') {const succeeds=images.length===0;images.push(element);element.decode=()=>{element.complete=true;element.naturalWidth=succeeds?800:0;return succeeds?Promise.resolve():Promise.reject(Error('Unavailable image'));};}
    return element;
  };
  const compared=await api.view({ids:['1','2'],pageSize:36});
  assert.deepEqual([...compared.shown].map(p=>p.id),['1','2']);
  assert.deepEqual([...compared.imageStatus.loaded],['1']);assert.deepEqual([...compared.imageStatus.failed],['2']);
  assert.match(compared.instruction,/no visual evidence/);
});

test('installation needs no network and preserves an occupied namespace', () => {
  const f=fixture(),{api,window}=f.boot({collision:true});
  assert.equal(window.mcp.unrelated,true); assert.equal(api.help().namespace,'window.shopAgent'); assert.equal(f.state.requests.length,0);
});
test('unknown stores expose an explicit unsupported status', async () => {
  const {api}=fixture().boot({unsupported:true}); assert.equal(api.help().platform,'unsupported');
  await assert.rejects(api.cart.read(),{code:'UNSUPPORTED_STORE'});
});

test('page tool discovery is network-free and executes only validated page methods', async () => {
  const f=fixture(),{context}=f.boot();
  const registry=context.document.modelContext, tools=registry.getTools();
  assert.deepEqual([...tools].map(t=>t.name),['shop_catalog','shop_search','shop_view','shop_cart','shop_agent']);const advanced=tools.find(t=>t.name==='shop_agent');assert.equal(f.state.requests.length,0);
  const help=await registry.executeTool(advanced,{method:'help'});
  assert.match(help.output,/NOT/);assert.equal(f.state.requests.length,0);
  const searched=await registry.executeTool(advanced,{method:'search',input:{queries:[{limit:2}]}});
  assert.equal(searched.results[0].products.length,2);assert.equal(searched.results[0].products[0].price,25);
  const invalid=await registry.executeTool(advanced,{method:'run',input:{source:'return 1'}});
  assert.equal(invalid.error.code,'UNKNOWN_METHOD');
  const unknown=await registry.executeTool(advanced,{method:'search',input:{queries:[{query:'a',unexpected:true}]}});
  assert.equal(unknown.results[0].error.code,'INVALID_ARGUMENT');
  assert.throws(()=>registry.executeTool({...advanced},{method:'help'}),{code:'UNKNOWN_METHOD'});
  const added=await registry.executeTool(advanced,{method:'cart.addMany',input:add('tool-write')});
  assert.equal(added.status,'complete');assert.equal(writes(f),1);
  const replay=await registry.executeTool(advanced,{method:'cart.addMany',input:add('tool-write')});
  assert.equal(replay.replayed,true);assert.equal(writes(f),1);
});

test('page tool interoperability preserves occupied registries and uses native registration when supplied', async () => {
  const existing={getTools:()=>[{name:'other'}]};const a=fixture().boot({registry:existing});
  assert.equal(a.context.document.modelContext,existing);assert.equal(existing.getTools()[0].name,'other');
  const registrations=[];const native={registerTool:t=>{registrations.push(t);}};
  const b=fixture().boot({registry:native});assert.equal(b.context.document.modelContext,native);
  assert.deepEqual(registrations.map(t=>t.name),['shop_catalog','shop_search','shop_view','shop_cart','shop_agent']);const registered=registrations.find(t=>t.name==='shop_agent');assert.equal((await registered.execute({method:'help'})).name,'Shop Agent');
});

test('command sequences stop before another write after an unknown effect and validate navigation order', async () => {
  const f=fixture(),{context}=f.boot();const r=context.document.modelContext,t=r.getTools().find(t=>t.name==='shop_agent');
  const invalid=await r.executeTool(t,{commands:[{method:'cart.open'},{method:'cart.read'}]});
  assert.equal(invalid.error.code,'INVALID_ARGUMENT');assert.equal(f.state.requests.length,0);
  const mixed=await r.executeTool(t,{method:'help',commands:[{method:'help'}]});assert.equal(mixed.error.code,'INVALID_ARGUMENT');
  f.state.behavior='fail-after';
  const result=await r.executeTool(t,{commands:[{method:'cart.addMany',input:add('uncertain')},{method:'cart.addMany',input:add('must-not-write','2')}]});
  assert.equal(result.status,'stopped');assert.equal(result.notAttempted,1);assert.equal(result.results[0].value.status,'unknown');assert.equal(writes(f),1);
  assert.equal(f.state.cart.length,1);
});

test('command sequences preserve journal replay and return every completed outcome', async () => {
  const f=fixture(),{context}=f.boot();const r=context.document.modelContext,t=r.getTools().find(t=>t.name==='shop_agent');
  const input={commands:[{method:'cart.addMany',input:add('sequenced')},{method:'cart.read'}]};
  const first=await r.executeTool(t,input);assert.equal(first.status,'complete');assert.equal(first.results.length,2);assert.equal(first.results[1].value.lines[0].quantity,1);
  const replay=await r.executeTool(t,input);assert.equal(replay.results[0].value.replayed,true);assert.equal(writes(f),1);
});

test('dedicated tools validate inputs and preserve confirmed writes when review fails', async () => {
  const f=fixture(),{context}=f.boot();const r=context.document.modelContext;
  const catalog=r.getTools().find(t=>t.name==='shop_catalog'),cart=r.getTools().find(t=>t.name==='shop_cart');
  const scan=await r.executeTool(catalog,{limit:2,images:false});
  assert.equal(scan.products.rows.length,2);assert.equal(scan.comparison,undefined);
  const rows=scan.products.rows.map(row=>({...scan.products.common,...Object.fromEntries(scan.products.columns.map((c,i)=>[c,row[i]]))}));
  assert.equal(rows[0].id,'1');assert.equal(rows[0].inStock,true);assert.equal(rows[0].price,25);assert.equal(rows[0].description,'Short');
  const before=f.state.requests.length;
  assert.equal((await r.executeTool(cart,{action:'verify',items:[]})).error.code,'INVALID_ARGUMENT');
  assert.equal((await r.executeTool(cart,{action:'buy'})).error.code,'INVALID_ARGUMENT');assert.equal(f.state.requests.length,before);
  const input={action:'add_review',...add('review-failure')};
  const result=await r.executeTool(cart,input);
  assert.equal(result.status,'complete');assert.equal(result.handoff,'not-opened');assert.ok(result.reviewError);assert.equal(writes(f),1);
  const replay=await r.executeTool(cart,input);assert.equal(replay.replayed,true);assert.equal(writes(f),1);
});

function nativeFrame(f,context,{changed=false,blocked=false}={}) {
  let removed=0,navigated=null;
  const frame={style:{},setAttribute(){},remove(){removed++},contentWindow:{location:{href:'https://shop.test/cart/'}}};
  const d={defaultView:{},readyState:'complete',querySelector:()=>({}),querySelectorAll:()=>{
    const rows=f.state.cart.map(l=>{const quantity=l.quantity;return {querySelector:s=>s.startsWith('a.') ? {href:`https://shop.test/product/${l.id}/`} : {value:quantity}};});
    if(changed)f.state.cart[0].quantity++;
    return rows;
  }};
  Object.defineProperty(frame,'contentDocument',{get(){if(blocked)throw Error('Frame denied');return d;}});
  context.document.createElement=()=>frame;context.document.body.append=()=>{};context.location.assign=u=>{navigated=u;};
  if(blocked){let now=0;context.Date=class extends Date{static now(){return now+=5000;}};}
  return {removed:()=>removed,navigated:()=>navigated};
}
test('review certifies a rendered native frame, removes it and opens the cart without duplicate writes', async () => {
  const f=fixture(),{api,context}=f.boot();await api.list({limit:1});const frame=nativeFrame(f,context);
  const first=await api.cart.review(add('framed'));assert.equal(first.verification,'verified');assert.equal(first.native.source,'rendered-native-cart-frame');assert.equal(first.handoff,'opened');assert.equal(frame.removed(),1);assert.equal(frame.navigated(),'https://shop.test/cart/');
  const replay=await api.cart.review(add('framed'));assert.equal(replay.replayed,true);assert.equal(writes(f),1);assert.equal(frame.removed(),2);
});
test('a basket change during frame verification prevents a certified handoff', async () => {
  const f=fixture(),{api,context}=f.boot();await api.list({limit:1});const frame=nativeFrame(f,context,{changed:true});
  const result=await api.cart.review(add('framed-change'));assert.equal(result.status,'complete');assert.equal(result.verification,'mismatch');assert.equal(result.handoff,'not-opened');assert.equal(frame.navigated(),null);assert.equal(frame.removed(),1);assert.equal(writes(f),1);
});
test('denied frames never certify verification and retain main-cart fallback', async () => {
  const f=fixture(),{api,context}=f.boot();await api.list({limit:1});const frame=nativeFrame(f,context,{blocked:true});
  const result=await api.cart.review(add('framed-denied'));assert.equal(result.verification,'unsupported-markup');assert.equal(result.handoff,'opened');assert.equal(result.native.matched,null);assert.equal(frame.removed(),1);assert.equal(writes(f),1);
});

test('catalog pagination retains every native record without pruning', async () => {
  const f=fixture();f.state.count=55;f.state.overrides[1]={name:'UNWANTED label',is_in_stock:false};
  const {api}=f.boot();let cursor,ids=[];
  do {const r=await api.catalog({limit:7,maxPages:2,...(cursor?{cursor}:{})});ids.push(...r.products.map(p=>p.id));cursor=r.nextCursor;}while(cursor);
  assert.deepEqual(ids,Array.from({length:55},(_,i)=>String(i+1)));
  assert.equal((await api.catalog({limit:100,maxPages:30})).coverage.complete,true);
  const scoped=await api.catalog({query:'red',limit:100,maxPages:30});assert.equal(scoped.products.length,55);assert.ok(scoped.products.some(p=>p.textMatch==='none'));assert.match(scoped.note,/does not prove catalog-wide absence/);
});
test('catalog, list and search reject every exclusion and structured filter before networking', async () => {
  const f=fixture(),{api}=f.boot();
  for(const field of [{excludeText:['unwanted']},{category:'Tees'},{onSale:true},{inStock:true},{minPrice:1},{maxPrice:10},{filters:{onSale:true}},{match:'all'}]){
    await assert.rejects(api.catalog(field),{code:'INVALID_ARGUMENT'});await assert.rejects(api.list(field),{code:'INVALID_ARGUMENT'});
    assert.equal((await api.search({queries:[field]})).results[0].error.code,'INVALID_ARGUMENT');
  }
  assert.equal(f.state.requests.length,0);await assert.rejects(api.catalog({images:'tee'}),{code:'INVALID_ARGUMENT'});
});
test('raw catalog table preserves dedicated-tool records and validates before networking', async () => {
  const f=fixture(),{api}=f.boot();const result=await api.catalogTable({limit:2});
  const rows=result.products.rows.map(row=>({...result.products.common,...Object.fromEntries(result.products.columns.map((key,i)=>[key,row[i]]))}));
  assert.equal(rows.length,2);assert.equal(result.products.common.currency,'USD');assert.equal(result.products.common.purchasable,true);assert.equal(rows[0].id,'1');assert.equal(rows[0].description,'Short');assert.equal(rows[0].inStock,true);assert.equal(result.coverage.complete,false);
  const requests=f.state.requests.length;await assert.rejects(api.catalogTable({invalid:true}),{code:'INVALID_ARGUMENT'});assert.equal(f.state.requests.length,requests);
  const projected=await api.catalogTable({limit:2,images:false,probes:['Product']});assert.equal(projected.comparison,undefined);assert.equal(projected.probes.allRecordsScanned,false);assert.equal(projected.probes.results[0].count,2);
});
test('catalog probes share one scan and match whole words without inferring colour or absence', async () => {
  const f=fixture();f.state.count=3;f.state.overrides={1:{name:'Red Scarf'},2:{name:'Tide Tee',short_description:'A tapered silhouette'},3:{short_description:'Cotton pique with a soft collar'}};
  const {api}=f.boot();const result=await api.catalog({probes:['red','pique soft collar','mug']});
  assert.deepEqual([...result.probes[0].matchedIds],['1']);assert.deepEqual([...result.probes[1].matchedIds],['3']);assert.equal(result.probes[2].count,0);assert.equal(result.probes[2].allRecordsScanned,true);assert.match(result.probes[2].scope,/not full product text, image colour, fit or semantic absence/);assert.equal(f.state.requests.length,1);
  await assert.rejects(api.catalog({probes:['?']}),{code:'INVALID_ARGUMENT'});assert.equal(f.state.requests.length,1);
});

test('cached results restore lookup references after a catalog exceeds the retention bound', async () => {
  const f=fixture();f.state.count=2100;const {api}=f.boot();await api.catalog({limit:1});let cursor;
  do {const r=await api.catalog({limit:100,maxPages:30,...(cursor?{cursor}:{})});cursor=r.nextCursor;}while(cursor);
  await api.catalog({limit:1});assert.equal((await api.products({ids:['1']})).results[0].id,'1');
});
test('rediscovered references become recent before a broad scan evicts old references', async () => {
  const f=fixture();f.state.count=2300;const {api}=f.boot();await api.list({limit:1});
  for(let page=1;page<=96;page+=5)await api.catalog({cursor:String(page),limit:100,maxPages:5});
  await api.products({ids:['1']});
  for(let page=101;page<=111;page+=5)await api.catalog({cursor:String(page),limit:100,maxPages:5});
  assert.equal((await api.products({ids:['2']})).results[0].error.code,'UNKNOWN_PRODUCT');
  assert.equal((await api.products({ids:['1']})).results[0].id,'1');
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
test('search accepts a single query and catalog-sized bounds without losing query validation', async () => {
  const f=fixture(),{api}=f.boot();
  const single=await api.search({query:'shirt',limit:100,maxPages:30});assert.equal(single.results[0].products.length,100);
  const text=await api.search('shirt');assert.equal(text.results[0].products.length,5);
  await assert.rejects(api.search({queries:['shirt'],query:'ignored'}),{code:'INVALID_ARGUMENT'});
  const invalid=await api.search({query:'shirt',limit:101});assert.equal(invalid.results[0].error.code,'INVALID_ARGUMENT');
});
test('contact-sheet pagination retains every ID and reuses listing evidence without detail requests', async () => {
  const f=fixture(),{api,context}=f.boot();const result=await api.catalog({limit:40,maxPages:2});
  const gallery={replaceChildren(){},setAttribute(){},append(){},scrollIntoView(){},querySelectorAll(){return []},style:{}};
  context.document.getElementById=()=>gallery;context.document.createElement=()=>({style:{},dataset:{},append(){}});
  const before=f.state.requests.length,ids=result.products.map(p=>p.id);
  const first=await api.view({ids,pageSize:36});assert.equal(first.shown.length,36);assert.equal(first.nextPage,2);
  const second=await api.view({ids,pageSize:36,page:2});assert.equal(second.shown.length,4);assert.equal(second.nextPage,null);
  assert.deepEqual([...first.shown,...second.shown].map(p=>p.id),[...ids]);assert.equal(f.state.requests.length,before);
  await assert.rejects(api.view({ids,pageSize:37}),{code:'INVALID_ARGUMENT'});
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
test('category discovery stays read-only while category filtering is rejected', async () => {
  const f=fixture(),{api}=f.boot();assert.equal((await api.categories()).categories[0].id,'7');
  const before=f.state.requests.length;await assert.rejects(api.list({category:'accessories'}),{code:'INVALID_ARGUMENT'});assert.equal(f.state.requests.length,before);
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

test('native keyword queries retain partial matches and preserve pagination evidence', async () => {
  const f=fixture(),{api}=f.boot();f.state.count=65;f.state.overrides[3]={name:'Red shirt'};
  let cursor,ids=[];
  do {const r=await api.list({query:'red shirt',limit:9,maxPages:1,...(cursor?{cursor}:{})});ids.push(...r.products.map(p=>p.id));cursor=r.nextCursor;assert.equal(r.total,65);}while(cursor);
  assert.deepEqual(ids,Array.from({length:65},(_,i)=>String(i+1)));assert.ok(f.state.requests.every(r=>new URL(r.url).searchParams.get('search')==='red shirt'));
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
