import { Broker, BLOCKED } from './broker.mjs';
import { CommerceAdapter } from './commerce-adapter.mjs';

const properties={
  handle:{type:'string'},action:{type:'string',enum:['inspect','search_many','products','basket_sync','verify','phase','handoff']},
  queries:{type:'array',maxItems:10,items:{type:'string'}},products:{type:'array',maxItems:30,items:{type:'string'}},
  items:{type:'array',minItems:1,maxItems:10,items:{type:'object',additionalProperties:false,required:['product','quantity'],properties:{product:{type:'string'},quantity:{type:'integer',minimum:1,maximum:10}}}},
  ifRevision:{type:'string'},operationId:{type:'string'},phase:{type:'string',enum:['discovery','comparison','cart','verification']},note:{type:'string'}
};
export const commerceTool={type:'function',name:'assigned_shop',description:'Operate only your assigned shop session. inspect returns a compact API catalog, availability, prices, descriptions, attributes, coverage and basket revision; use it first. search_many matches queries against that catalog in one call. products returns details for product handles. basket_sync sets desired quantities for specified simple products, preserves other lines, batches writes, and returns verified API basket state; provide items, ifRevision from inspect, and a unique operationId. Never infer color/size from names or unviewed images. phase records discovery/comparison/cart/verification timing. verify reads basket. handoff renders and independently verifies the native cart, takes a screenshot, revokes ALL tools, and returns measured timing; call it when ready. No checkout/purchase operation.',inputSchema:{type:'object',additionalProperties:false,required:['handle','action'],properties}};
export function commerceToolFor({catalogOnce=false,stopAtHandoff=false}={}){
  const tool=structuredClone(commerceTool);
  if(catalogOnce){
    tool.inputSchema.properties.action.enum=tool.inputSchema.properties.action.enum.filter(action=>!['search_many','products'].includes(action));
    delete tool.inputSchema.properties.queries;delete tool.inputSchema.properties.products;
    tool.description=tool.description.replace('inspect returns a compact API catalog, availability, prices, descriptions, attributes, coverage and basket revision; use it first. search_many matches queries against that catalog in one call. products returns details for product handles.','inspect returns the catalog, full available descriptions, category counts, attributes, coverage and basket revision; use it once. When coverage is complete, choose directly from that catalog. Search and detail actions are unnecessary and are not exposed. Requested types absent from complete coverage require an alternative; unavailable color/size remains unknown.');
  }
  if(stopAtHandoff)tool.description=tool.description.replace('and returns measured timing; call it when ready.','and ends your turn automatically; call it when ready. Include a brief choice/substitution explanation in basket_sync note. Do not generate a final report.');
  return tool;
}

export class CommerceBroker extends Broker {
  constructor({catalogOnce=false}={}){super();this.catalogOnce=catalogOnce;}
  register(threadId,assignment){super.register(threadId,assignment);assignment.commerce=new CommerceAdapter(assignment,assignment.target,{catalogOnce:this.catalogOnce});}
  async perform(threadId,args,tool){
    const a=this.assignments.get(threadId);
    if(!a||!args||args.handle!==a.handle||a.released)throw new Error(BLOCKED);
    if(new URL(a.page.url()).origin!==new URL(a.target.url).origin)throw new Error(BLOCKED);
    if(tool==='assigned_browser')return super.perform(threadId,args);
    if(tool!=='assigned_shop'||Object.keys(args).some(k=>!Object.hasOwn(properties,k)))throw new Error(BLOCKED);
    const adapter=a.commerce;
    if(this.catalogOnce&&['search_many','products'].includes(args.action))throw new Error('Use the catalog and full descriptions already returned by inspect; repeated discovery actions are not exposed in this run.');
    if(args.action==='phase')return super.perform(threadId,args);
    switch(args.action){
      case 'inspect':return adapter.inspect();
      case 'search_many':if(!Array.isArray(args.queries)||args.queries.length>10||args.queries.some(q=>typeof q!=='string'))throw new Error('queries must be up to 10 strings');return adapter.searchMany(args.queries);
      case 'products':if(!Array.isArray(args.products)||args.products.length>30||args.products.some(x=>typeof x!=='string'))throw new Error('products must be handles');return adapter.details(args.products);
      case 'basket_sync':{
        if(!Array.isArray(args.items)||!args.items.length||args.items.length>10||args.items.some(i=>typeof i.product!=='string'||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>10||Object.keys(i).some(k=>!['product','quantity'].includes(k)))||typeof args.operationId!=='string'||!args.operationId||typeof args.ifRevision!=='string')throw new Error('basket_sync requires product/quantity items, ifRevision, and operationId');
        return adapter.sync(args);
      }
      case 'verify':return adapter.verify();
      case 'handoff':{
        const apiVerification=await adapter.prepareHandoff();
        if(a.expectedBasket&&!apiVerification.ok)throw new Error('API basket verification failed');
        const result=await super.perform(threadId,{handle:args.handle,action:'handoff'});
        return {...result,apiVerification};
      }
      default:throw new Error(BLOCKED);
    }
  }
}
