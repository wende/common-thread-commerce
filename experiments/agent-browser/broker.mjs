export const BLOCKED='BLOCKED: outside assigned browser context';
import { timingSummary } from './metrics.mjs';
const fields={handle:{type:'string'},action:{type:'string',enum:['snapshot','click','fill','press','phase','handoff']},role:{type:'string'},name:{type:'string'},value:{type:'string'},index:{type:'integer',minimum:0},phase:{type:'string',enum:['discovery','comparison','cart','verification']},note:{type:'string'}};
export const browserTool={type:'function',name:'assigned_browser',description:'Operate only your assigned page. snapshot returns its accessible DOM and URL. click uses exact accessible role/name. fill uses role/name if supplied, otherwise exact input label (or placeholder), with text in value. press uses the same locator and key in value (e.g. Enter). Optional zero-based index selects among duplicated matching elements; inspect the snapshot first. Page actions return a new snapshot. Call snapshot again if AJAX is loading. phase records a workflow phase and note for measured timing (discovery, comparison, cart, verification), without changing the page. handoff verifies the task, returns measured timing, and revokes your page access; leave the browser open.',inputSchema:{type:'object',properties:fields,required:['handle','action'],additionalProperties:false}};
export class Broker {
  constructor(){this.assignments=new Map();this.audit=[];this.queues=new Map();}
  register(threadId,assignment){this.assignments.set(threadId,assignment);}
  async call(threadId,args,tool='assigned_browser'){
    const queuedAt=performance.now();
    const previous=this.queues.get(threadId)||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
      const startedAt=performance.now();const assignment=this.assignments.get(threadId);
      const record={threadId,tool,handle:args?.handle,action:args?.action,role:args?.role,name:args?.name,value:args?.value,index:args?.index,phase:args?.phase,note:args?.note,...(tool==='assigned_shop'?{arguments:structuredClone(args)}:{}),at:Date.now(),startedAt,queueMs:startedAt-queuedAt,urlBefore:assignment?.page?.url()};
      let result;
      try{result=await this.perform(threadId,args,tool);record.success=true;return result;}
      catch(error){record.success=false;record.error=error.message;record.denied=error.message===BLOCKED;throw error;}
      finally{
        record.endedAt=performance.now();record.durationMs=record.endedAt-startedAt;record.urlAfter=assignment?.page?.url();this.audit.push(record);
        if(result&&args.action==='handoff')result.timing=timingSummary(assignment,this.audit,record.endedAt);
      }
    });
    this.queues.set(threadId,next);
    try{return await next;}finally{if(this.queues.get(threadId)===next)this.queues.delete(threadId);}
  }
  async perform(threadId,args){
    const a=this.assignments.get(threadId);
    if(!a||!args||args.handle!==a.handle||a.released)throw new Error(BLOCKED);
    if(Object.keys(args).some(k=>!Object.hasOwn(fields,k)))throw new Error(BLOCKED);
    if(args.index!==undefined&&(!Number.isInteger(args.index)||args.index<0))throw new Error('index must be a nonnegative integer');
    const {page}=a;let result;
    async function locator(){
      let found=args.role?page.getByRole(args.role,{name:args.name,exact:true}):page.getByLabel(args.name,{exact:true});
      if(!args.role&&await found.count()===0)found=page.getByPlaceholder(args.name,{exact:true});
      return args.index===undefined?found:found.nth(args.index);
    }
    async function observe(){await page.waitForLoadState('domcontentloaded');return {url:page.url(),snapshot:await page.locator('body').ariaSnapshot()};}
    switch(args.action){
      case 'phase':{
        if(!fields.phase.enum.includes(args.phase))throw new Error('Invalid workflow phase');
        (a.phaseEvents??=[]).push({phase:args.phase,note:args.note||'',startedAt:performance.now()});
        result={phase:args.phase,elapsedSeconds:a.turnStart===undefined?null:Math.round(performance.now()-a.turnStart)/1000};break;
      }
      case 'snapshot':result=await observe();break;
      case 'click':await (await locator()).click({timeout:10000});result=await observe();break;
      case 'fill':await (await locator()).fill(args.value,{timeout:10000});result=await observe();break;
      case 'press':await (await locator()).press(args.value,{timeout:10000});result=await observe();break;
      case 'handoff':{
        const verification=await a.verify();
        if(!verification.ok)throw new Error('Task verification failed: '+JSON.stringify(verification));
        await page.screenshot({path:a.screenshot,fullPage:true});
        a.released=true;a.handoffAt=performance.now();a.verification=verification;
        result={status:'SUCCESS',handedOver:true,handle:a.handle,url:page.url(),verification};break;
      }
      default:throw new Error(BLOCKED);
    }
    return result;
  }
}
