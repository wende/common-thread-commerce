// Experiment-only storefront adapters. No merchant API keys or platform changes.
import { randomUUID, createHash } from 'node:crypto';
import { BLOCKED } from './broker.mjs';

const productFields='__typename id sku name url_key stock_status description { html } short_description { html } categories { name } small_image { url } price_range { minimum_price { regular_price { value currency } final_price { value currency } } }';
const cartFields='total_quantity itemsV2(pageSize:100) { total_count items { uid quantity product { sku name } prices { price { value currency } } } page_info { total_pages } } prices { subtotal_excluding_tax { value currency } grand_total { value currency } }';
const money=n=>Math.round(Number(n)*100)/100;
const revision=items=>createHash('sha256').update(JSON.stringify(items.map(i=>[i.sku,i.quantity,i.unitPrice]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex').slice(0,20);

export class CommerceAdapter {
  constructor(assignment,target,{catalogOnce=false}={}){
    this.a=assignment;this.target=target;this.origin=new URL(target.url).origin;
    this.catalogOnce=catalogOnce;
    this.products=new Map();this.native=new Map();this.operations=new Map();
    assignment.apiAudit=[];assignment.internalBrowser={evaluations:0,navigations:0,clicksOrFills:0};
  }
  async evaluate(fn,arg){this.a.internalBrowser.evaluations++;return this.a.page.evaluate(fn,arg);}
  async goto(path){
    const url=new URL(path,this.origin);if(url.origin!==this.origin)throw new Error(BLOCKED);
    this.a.internalBrowser.navigations++;
    await this.a.page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
  }
  async request(path,{method='GET',json,form,headers={},operation='read',nativeOperations=0}={}){
    let url=new URL(path,this.origin);
    for(let redirect=0;redirect<6;redirect++){
      if(url.origin!==this.origin)throw new Error(BLOCKED);
      const entry={method,path:url.pathname,operation,nativeOperations,at:Date.now(),startedAt:performance.now()};
      this.a.apiAudit.push(entry);
      try{
        const response=await this.a.context.request.fetch(url.href,{method,maxRedirects:0,timeout:60000,headers,...(json?{data:json}:form?{form}:{})});
        const body=await response.body();entry.status=response.status();entry.bytes=body.length;
        const responseHeaders=response.headers();
        if(entry.status>=300&&entry.status<400&&responseHeaders.location){
          url=new URL(responseHeaders.location,url);if(url.origin!==this.origin)throw new Error(BLOCKED);
          if(entry.status===303||([301,302].includes(entry.status)&&method==='POST')){method='GET';json=undefined;form=undefined;headers={};operation='read';nativeOperations=0;}
          continue;
        }
        let data;try{data=JSON.parse(body.toString())}catch{data=null}
        if(entry.status>=400)throw new Error('HTTP '+entry.status+' at '+url.pathname+': '+(data?.message||'request failed'));
        return {status:entry.status,data,headers:responseHeaders,bytes:body.length};
      }catch(error){entry.error=error.message;throw error}
      finally{entry.endedAt=performance.now();entry.seconds=Math.round(entry.endedAt-entry.startedAt)/1000;}
    }
    throw new Error('Too many redirects');
  }
  async graphql(query,variables={},operation='read',nativeOperations=0){
    const r=await this.request('/graphql',{method:'POST',json:{query,variables},operation,nativeOperations});
    if(r.data?.errors?.length)throw new Error('GraphQL: '+r.data.errors.map(x=>x.message).join('; '));
    if(!r.data?.data)throw new Error('Missing GraphQL data');return r.data.data;
  }
  async initialize(){
    if(this.target.name==='prestashop'&&!this.presta){
      this.presta=await this.evaluate(()=>({urls:window.prestashop.urls.pages,token:window.prestashop.static_token,currency:window.prestashop.currency?.iso_code||'USD',listing:document.querySelector('a.all-product-link')?.href}));
      if(!this.presta.listing)throw new Error('No catalog listing descriptor');
    }
  }
  async catalog(){
    if(this.catalogLoaded)return [...this.products.values()];
    await this.initialize();let raws=[],records=[],coverage={};
    if(this.target.name==='woocommerce'){
      const fields='id,type,name,permalink,sku,short_description,description,on_sale,prices,images,categories,attributes,variations,is_in_stock,is_purchasable,add_to_cart';
      const r=await this.request('/wp-json/wc/store/v1/products?per_page=100&_fields='+fields);
      raws=r.data;coverage={returned:raws.length,total:Number(r.headers['x-wp-total'])||raws.length,totalPages:Number(r.headers['x-wp-totalpages'])||1};
      records=raws.map(p=>({id:p.id,sku:p.sku,name:p.name,url:p.permalink,price:Number(p.prices.price)/10**p.prices.currency_minor_unit,regularPrice:Number(p.prices.regular_price)/10**p.prices.currency_minor_unit,currency:p.prices.currency_code,inStock:p.is_in_stock,purchasable:p.is_purchasable??p.is_in_stock,categories:p.categories.map(c=>c.name),description:p.short_description,detailDescription:p.description,images:p.images.map(i=>i.src),attributes:p.attributes||[],optionsRequired:!!p.variations?.length||(p.type&&p.type!=='simple')}));
    }else if(this.target.name==='prestashop'){
      const url=new URL(this.presta.listing);url.searchParams.set('ajax','1');
      const r=await this.request(url.href);raws=r.data.products;
      coverage={returned:raws.length,total:r.data.pagination?.total_items??raws.length,totalPages:r.data.pagination?.pages_count??1};
      records=raws.map(p=>({id:p.id_product,sku:p.reference,name:p.name,url:p.url,price:Number(p.price_amount),regularPrice:Number(p.regular_price_amount),currency:this.presta.currency,inStock:p.add_to_cart_url?true:null,purchasable:!!p.add_to_cart_url,categories:[p.category_name],description:p.description_short,images:[p.cover?.large?.url].filter(Boolean),attributes:[],optionsRequired:Number(p.id_product_attribute||0)>0}));
    }else if(this.target.name==='magento'){
      const d=await this.graphql(`{products(filter:{},pageSize:100){total_count page_info{total_pages} items{${productFields}}}}`);raws=d.products.items;
      coverage={returned:raws.length,total:d.products.total_count,totalPages:d.products.page_info.total_pages};
      records=raws.map(p=>({id:p.id,sku:p.sku,name:p.name,url:this.origin+'/'+p.url_key+'.html',price:p.price_range.minimum_price.final_price.value,regularPrice:p.price_range.minimum_price.regular_price.value,currency:p.price_range.minimum_price.final_price.currency,inStock:p.stock_status==='IN_STOCK',purchasable:p.stock_status==='IN_STOCK',categories:p.categories.map(c=>c.name),description:p.short_description.html,detailDescription:p.description.html,images:[p.small_image?.url].filter(Boolean),attributes:[],optionsRequired:p.__typename!=='SimpleProduct'}));
    }else throw new Error('Unsupported platform '+this.target.name);
    records=await this.evaluate(records=>records.map(p=>{
      const plain=html=>{const d=document.createElement('div');d.innerHTML=html||'';return d.textContent.trim()};
      return {...p,name:plain(p.name),description:plain(p.description),detailDescription:plain(p.detailDescription)};
    }),records);
    records.forEach((p,i)=>{
      const product={product:randomUUID(),sku:p.sku,name:p.name,url:p.url,price:money(p.price),regularPrice:money(p.regularPrice),currency:p.currency,discountPercent:p.regularPrice>p.price?money((1-p.price/p.regularPrice)*100):0,inStock:p.inStock,purchasable:p.purchasable,categories:p.categories,description:p.description,images:p.images,attributes:p.attributes,optionsRequired:Boolean(p.optionsRequired),color:null,sizeOptions:[],evidenceSource:'assigned storefront API'};
      this.products.set(product.product,product);this.native.set(product.product,{...p,raw:raws[i]});
    });
    this.coverage={...coverage,complete:coverage.returned===coverage.total&&coverage.totalPages===1};this.catalogLoaded=true;
    return [...this.products.values()];
  }
  product(handle){const p=this.products.get(handle);if(!p)throw new Error(BLOCKED);return p;}
  finishBasket(items,subtotal,total,currency){
    return {items:items.map(i=>({...i,quantity:Number(i.quantity),unitPrice:money(i.unitPrice)})),merchandiseSubtotal:money(subtotal),totalObserved:money(total),currency,revision:revision(items),observedAt:new Date().toISOString(),totalContext:'Shipping/tax can change after frontend recalculation; this is an observed total.'};
  }
  async basket(){
    await this.initialize();
    if(this.target.name==='woocommerce'){
      const r=await this.request('/wp-json/wc/store/v1/cart');this.nonce=r.headers.nonce;
      const divisor=10**r.data.totals.currency_minor_unit;
      return this.finishBasket(r.data.items.map(i=>({line:i.key,sku:i.sku,name:i.name,quantity:i.quantity,unitPrice:Number(i.prices.price)/10**i.prices.currency_minor_unit})),Number(r.data.totals.total_items)/divisor,Number(r.data.totals.total_price)/divisor,r.data.totals.currency_code);
    }
    if(this.target.name==='prestashop'){
      const url=new URL(this.presta.urls.cart);url.searchParams.set('ajax','1');url.searchParams.set('action','update');
      const r=await this.request(url.href);if(!r.data?.cart)throw new Error('Missing storefront cart');
      return this.finishBasket(r.data.cart.products.map(i=>({line:String(i.id_product),sku:i.reference,name:i.name,quantity:i.quantity,unitPrice:i.price_amount})),r.data.cart.subtotals.products.amount,r.data.cart.totals.total.amount,this.presta.currency);
    }
    const r=await this.request('/customer/section/load/?sections=cart&force_new_section_timestamp=true');
    this.maskedId=r.data?.cart?.masked_quote_id||this.maskedId;
    if(!this.maskedId&&Number(r.data?.cart?.summary_count||0)>0){
      await this.goto('/checkout/');
      this.maskedId=await this.evaluate(()=>window.checkoutConfig?.quoteData?.entity_id);
      if(!this.maskedId)throw new Error('Cannot establish browser basket identity');
    }
    if(!this.maskedId)return this.finishBasket([],0,0,'USD');
    const d=await this.graphql(`query($id:String!){cart(cart_id:$id){${cartFields}}}`,{id:this.maskedId});
    if(d.cart.itemsV2.page_info.total_pages!==1)throw new Error('Basket exceeds supported page size');
    return this.finishBasket(d.cart.itemsV2.items.map(i=>({line:i.uid,sku:i.product.sku,name:i.product.name,quantity:i.quantity,unitPrice:i.prices.price.value})),d.cart.prices.subtotal_excluding_tax.value,d.cart.prices.grand_total.value,d.cart.prices.grand_total.currency);
  }
  async inspect(){
    const products=await this.catalog(),basket=await this.basket();
    const catalogSummary=this.catalogOnce?{
      categories:Object.fromEntries([...new Set(products.flatMap(p=>p.categories))].map(category=>[category,products.filter(p=>p.categories.includes(category)).length])),
      discountedProducts:products.filter(p=>p.discountPercent>0).length,
      purchasableSimpleProducts:products.filter(p=>p.purchasable&&!p.optionsRequired).length,
      productsWithAttributes:products.filter(p=>p.attributes.length>0).length,
      fullDescriptionsIncluded:true,
      discoveryInstruction:this.coverage.complete?'This is the entire catalog. Select from these records; further catalog searches cannot reveal additional products. If a requested type is absent, choose a sensible alternative.':'Catalog coverage is incomplete. Use the assigned browser only if missing inventory prevents a sensible selection.',
      evidenceInstruction:'Unknown color or size is an information limit. Do not search synonyms to recover unavailable attributes or claim verified color, fit, or winter suitability without supporting evidence. Images are references only.'
    }:undefined;
    return {platform:this.target.name,products:this.catalogOnce?products.map(p=>({...p,detailDescription:this.native.get(p.product).detailDescription||p.description})):products,coverage:this.coverage,basket,...(catalogSummary?{catalogSummary}:{}),capabilities:{structuredCatalog:true,batchBasketSync:true,nativeBatchWrites:this.target.name!=='prestashop',supportedProducts:'simple products; use assigned_browser if options require UI',search:this.catalogOnce?'Not exposed: initial inspection includes the catalog and full available descriptions.':'case-insensitive matching of API names, descriptions, categories and SKU',knownLimitations:['Color and size fields are unknown unless present in attributes.','Images are references, not independently verified color evidence.','No purchase or checkout mutation is exposed.']}};
  }
  async searchMany(queries){
    const products=await this.catalog();
    return {searchSemantics:'Local matching over the structured storefront catalog; all query words must occur in name, description, category or SKU.',coverage:this.coverage,results:queries.map(query=>{const terms=query.toLowerCase().split(/\s+/).filter(Boolean);return {query,products:products.filter(p=>terms.every(t=>[p.name,p.description,...p.categories,p.sku].join(' ').toLowerCase().includes(t)))}})};
  }
  async details(handles){
    return {products:handles.map(handle=>({...this.product(handle),detailDescription:this.native.get(handle).detailDescription||this.product(handle).description}))};
  }
  async sync({items,ifRevision,operationId}){
    const plan=JSON.stringify(items);
    if(this.operations.has(operationId)){
      const prior=this.operations.get(operationId);if(prior.plan!==plan)throw new Error('Operation ID already used for another plan');
      return {...prior.receipt,idempotentReplay:true,basket:await this.basket()};
    }
    const selected=items.map(i=>({product:this.product(i.product),quantity:i.quantity,native:this.native.get(i.product)}));
    if(new Set(selected.map(x=>x.product.sku)).size!==items.length)throw new Error('Duplicate product in plan');
    const before=await this.basket();if(ifRevision&&before.revision!==ifRevision)throw new Error('Basket revision changed; inspect again before applying this plan');
    if(selected.some(x=>!x.product.purchasable||x.product.optionsRequired))throw new Error('Selected item is unavailable or requires options; inspect alternatives or use the browser fallback');
    const outcomes=[];
    // Remember attempted plans before writes; uncertain retries read state, never repeat additive writes blindly.
    this.operations.set(operationId,{plan,receipt:{status:'INCOMPLETE',outcomes,basket:before}});
    try{
      if(this.target.name==='woocommerce'){
        const requests=selected.flatMap(s=>{const line=before.items.find(i=>i.sku===s.product.sku);if(line?.quantity===s.quantity){outcomes.push({sku:s.product.sku,status:'UNCHANGED'});return []}
          return [{path:'/wc/store/v1/cart/'+(line?'update-item':'add-item'),method:'POST',headers:{Nonce:this.nonce},body:line?{key:line.line,quantity:s.quantity}:{id:s.native.id,quantity:s.quantity}}];});
        if(requests.length){const r=await this.request('/wp-json/wc/store/v1/batch',{method:'POST',json:{requests},operation:'write',nativeOperations:requests.length});
          r.data.responses.forEach((x,i)=>outcomes.push({status:x.status>=200&&x.status<300?'APPLIED':'ERROR',httpStatus:x.status,message:x.body?.message||null,operationIndex:i}));}
      }else if(this.target.name==='prestashop'){
        for(const s of selected){
          const old=before.items.find(i=>i.sku===s.product.sku)?.quantity||0;const delta=s.quantity-old;
          if(!delta){outcomes.push({sku:s.product.sku,status:'UNCHANGED'});continue}
          const url=new URL(s.native.raw.add_to_cart_url);const form={...Object.fromEntries(url.searchParams),qty:String(Math.abs(delta)),op:delta>0?'up':'down',ajax:'1',action:'update'};
          const r=await this.request(url.pathname,{method:'POST',form,operation:'write',nativeOperations:1});
          outcomes.push({sku:s.product.sku,status:r.data?.success&&!r.data.hasError&&!r.data.errors?'APPLIED':'ERROR',message:r.data?.errors||null});
        }
      }else{
        let remaining=[...selected];
        if(!this.maskedId){
          const seed=remaining.shift();
          // Inspect the assigned page's form; navigate only that page if the item isn't on the homepage.
          let descriptor=await this.evaluate(id=>{const f=Array.from(document.forms).find(f=>f.querySelector('[name="product"]')?.value===String(id));return f?{action:f.action,form:Object.fromEntries(new FormData(f))}:null},seed.native.id);
          if(!descriptor){await this.goto(seed.product.url);descriptor=await this.evaluate(()=>{const f=document.querySelector('#product_addtocart_form');return f?{action:f.action,form:Object.fromEntries(new FormData(f))}:null});}
          if(!descriptor)throw new Error('Missing frontend add descriptor');
          await this.request(descriptor.action,{method:'POST',form:{...descriptor.form,qty:String(seed.quantity),isAjax:'1'},headers:{'X-Requested-With':'XMLHttpRequest'},operation:'write',nativeOperations:1});
          await this.basket();if(!this.maskedId)throw new Error('Frontend seed did not establish browser basket');
          outcomes.push({sku:seed.product.sku,status:'APPLIED'});
        }
        const existing=remaining.filter(s=>before.items.some(i=>i.sku===s.product.sku&&i.quantity!==s.quantity));
        if(existing.length){
          const d=await this.graphql('mutation($id:String!,$items:[CartItemUpdateInput!]!){updateCartItems(input:{cart_id:$id,cart_items:$items}){cart{total_quantity}}}',{id:this.maskedId,items:existing.map(s=>({cart_item_uid:before.items.find(i=>i.sku===s.product.sku).line,quantity:s.quantity}))},'write',existing.length);
          outcomes.push({status:'APPLIED',updatedItems:existing.length});
        }
        const additions=remaining.filter(s=>!before.items.some(i=>i.sku===s.product.sku));
        if(additions.length){
          const d=await this.graphql(`mutation($id:String!,$items:[CartItemInput!]!){addProductsToCart(cartId:$id,cartItems:$items){cart{${cartFields}} user_errors{code message}}}`,{id:this.maskedId,items:additions.map(s=>({sku:s.product.sku,quantity:s.quantity}))},'write',additions.length);
          outcomes.push({status:d.addProductsToCart.user_errors.length?'PARTIAL':'APPLIED',errors:d.addProductsToCart.user_errors});
        }
      }
    }catch(error){outcomes.push({status:'ERROR',message:error.message})}
    const basket=await this.basket();
    const ok=selected.every(s=>basket.items.some(i=>i.sku===s.product.sku&&i.quantity===s.quantity&&i.unitPrice===s.product.price));
    const receipt={status:ok?'SUCCESS':'PARTIAL',partialApplied:!ok&&basket.revision!==before.revision,outcomes,basket};
    this.operations.set(operationId,{plan,receipt});
    if(ok)this.a.expectedBasket=selected.map(s=>({sku:s.product.sku,quantity:s.quantity,unitPrice:s.product.price}));
    return receipt;
  }
  async verify(){
    const basket=await this.basket();const expected=this.a.expectedBasket;
    return {ok:!!expected&&expected.every(e=>basket.items.some(i=>i.sku===e.sku&&i.quantity===e.quantity&&i.unitPrice===e.unitPrice)),basket};
  }
  async prepareHandoff(){
    await this.goto(this.target.name==='magento'?'/checkout/cart/':this.target.name==='prestashop'?'/cart?action=show':'/cart/');
    await this.a.page.locator('input[type="number"]').first().waitFor({state:'visible',timeout:15000});
    return this.verify();
  }
}
