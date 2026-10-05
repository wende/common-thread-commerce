import test from 'node:test';
import assert from 'node:assert/strict';
import { CommerceBroker,commerceToolFor } from './commerce-broker.mjs';
import { CommerceAdapter } from './commerce-adapter.mjs';
import { BLOCKED } from './broker.mjs';

const assignment=handle=>({handle,target:{name:'woocommerce',url:'http://assigned.test/'},context:{},page:{url:()=> 'http://assigned.test/',screenshot:async()=>{}},verify:async()=>({ok:true})});
test('shop and browser share assignment checks and handoff revocation',async()=>{
  const b=new CommerceBroker();const a=assignment('a'),other=assignment('b');b.register('one',a);b.register('two',other);
  let touched=0;a.commerce.inspect=async()=>{touched++;return {products:[]}};
  a.commerce.prepareHandoff=async()=>({ok:true,basket:{items:[]}});
  for(const tool of ['assigned_shop','assigned_browser'])await assert.rejects(b.call('one',{handle:'b',action:'inspect'},tool),{message:BLOCKED});
  assert.equal(touched,0);
  await b.call('one',{handle:'a',action:'inspect'},'assigned_shop');assert.equal(touched,1);
  await assert.rejects(b.call('one',{handle:'a',action:'inspect',cartId:'other'},'assigned_shop'),{message:BLOCKED});
  await b.call('one',{handle:'a',action:'handoff'},'assigned_shop');
  for(const tool of ['assigned_shop','assigned_browser'])await assert.rejects(b.call('one',{handle:'a',action:'inspect'},tool),{message:BLOCKED});
  assert.equal(touched,1);
});
test('foreign product handles cannot initiate any request',async()=>{
  const a=assignment('a');const adapter=new CommerceAdapter(a,a.target);let reads=0;
  adapter.basket=async()=>{reads++;return {items:[],revision:'r'}};
  await assert.rejects(adapter.sync({items:[{product:'foreign-product',quantity:1}],ifRevision:'r',operationId:'one'}),{message:BLOCKED});
  assert.equal(reads,0);
});
test('stale revisions and duplicate operation IDs do not repeat writes',async()=>{
  const a=assignment('a');const adapter=new CommerceAdapter(a,a.target);let writes=0;
  adapter.products.set('p',{sku:'SKU',price:5,purchasable:true,optionsRequired:false});adapter.native.set('p',{id:1});
  let items=[];adapter.basket=async()=>({items,revision:items.length?'new':'old'});
  adapter.request=async()=>{writes++;items=[{sku:'SKU',quantity:1,unitPrice:5}];return {data:{responses:[{status:201}]}}};
  const args={items:[{product:'p',quantity:1}],ifRevision:'old',operationId:'plan'};
  await assert.rejects(adapter.sync({...args,ifRevision:'stale'}),/revision changed/);assert.equal(writes,0);
  assert.equal((await adapter.sync(args)).status,'SUCCESS');assert.equal(writes,1);
  assert.equal((await adapter.sync(args)).idempotentReplay,true);assert.equal(writes,1);
  await assert.rejects(adapter.sync({...args,items:[{product:'p',quantity:2}]}),/already used/);assert.equal(writes,1);
});
test('an unapproved redirect is rejected before sending it',async()=>{
  const a=assignment('a');let requests=0;
  a.context.request={fetch:async()=>{requests++;return {status:()=>302,headers:()=>({location:'http://foreign.test/cart'}),body:async()=>Buffer.alloc(0)}}};
  const adapter=new CommerceAdapter(a,a.target);
  await assert.rejects(adapter.request('/cart'),{message:BLOCKED});assert.equal(requests,1);
});
test('catalog-once schema omits redundant discovery and broker rejects it without reads',async()=>{
  const tool=commerceToolFor({catalogOnce:true,stopAtHandoff:true});
  assert.ok(!tool.inputSchema.properties.action.enum.includes('search_many'));
  assert.ok(!tool.inputSchema.properties.action.enum.includes('products'));
  assert.ok(!Object.hasOwn(tool.inputSchema.properties,'queries'));
  const b=new CommerceBroker({catalogOnce:true}),a=assignment('a');b.register('one',a);
  let reads=0;a.commerce.catalog=async()=>{reads++;return []};
  await assert.rejects(b.call('one',{handle:'a',action:'search_many',queries:['red']},'assigned_shop'),/repeated discovery/);
  await assert.rejects(b.call('one',{handle:'a',action:'products',products:[]},'assigned_shop'),/repeated discovery/);
  assert.equal(reads,0);
  await assert.rejects(b.call('one',{handle:'foreign',action:'search_many',queries:[]},'assigned_shop'),{message:BLOCKED});
});
test('initial inspection includes full available detail and inventory summaries',async()=>{
  const a=assignment('a'),adapter=new CommerceAdapter(a,a.target,{catalogOnce:true});
  const product={product:'p',categories:['Clothing'],description:'Short',discountPercent:20,purchasable:true,optionsRequired:false,attributes:[]};
  adapter.catalog=async()=>[product];adapter.basket=async()=>({items:[],revision:'r'});
  adapter.native.set('p',{detailDescription:'Full description'});adapter.coverage={returned:1,total:1,totalPages:1,complete:true};
  const result=await adapter.inspect();
  assert.equal(result.products[0].detailDescription,'Full description');
  assert.deepEqual(result.catalogSummary.categories,{Clothing:1});
  assert.equal(result.catalogSummary.discountedProducts,1);
  assert.equal(result.catalogSummary.productsWithAttributes,0);
  assert.match(result.catalogSummary.discoveryInstruction,/entire catalog/);
});
