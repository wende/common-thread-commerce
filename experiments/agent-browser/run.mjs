#!/usr/bin/env node
import { chromium } from 'playwright';
import { readFile,writeFile,mkdir,mkdtemp,symlink,rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir,homedir } from 'node:os';
import { resolve,dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { AppServer } from './app-server.mjs';
import { Broker,browserTool } from './broker.mjs';
import { CommerceBroker,commerceToolFor } from './commerce-broker.mjs';
import { verifyCommerceCart } from './commerce-verifier.mjs';
import { tokenSummary,timingSummary } from './metrics.mjs';
import { detailedReportSchema,detailedReportInstructions,reportMarkdown } from './detailed-report.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const argv=process.argv.slice(2);
if(argv.includes('--help')){
  console.log('Usage: node run.mjs [--agents 1..10] [--sessions 1..10] [--timeout seconds] [--task file.json] [--output directory] [--model gpt-6-luna] [--commerce-tools] [--catalog-once] [--stop-at-handoff] [--headed] [--keep-open]');
  process.exit(0);
}
const valued=new Set(['--agents','--sessions','--timeout','--task','--output','--model']);
for(let i=0;i<argv.length;i++){
  if(valued.has(argv[i])){if(!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Missing value for '+argv[i]);i++;}
  else if(!['--headed','--keep-open','--commerce-tools','--catalog-once','--stop-at-handoff'].includes(argv[i]))throw new Error('Unknown option '+argv[i]);
}
function option(name,fallback){const i=argv.indexOf('--'+name);return i<0?fallback:argv[i+1];}
const agents=Number(option('agents',10)),sessions=Number(option('sessions',1));
const timeout=Number(option('timeout',240))*1000;
if(!Number.isInteger(agents)||agents<1||agents>10||!Number.isInteger(sessions)||sessions<1||sessions>10||!Number.isFinite(timeout)||timeout<1000)throw new Error('Use --agents 1..10, --sessions 1..10, --timeout seconds.');
const model=option('model','gpt-6-luna');const effort='xhigh';
const keepOpen=argv.includes('--keep-open');
const commerceTools=argv.includes('--commerce-tools');
const catalogOnce=argv.includes('--catalog-once');
const stopAtHandoff=argv.includes('--stop-at-handoff');
if(catalogOnce&&!commerceTools)throw new Error('--catalog-once requires --commerce-tools');
const taskPath=option('task',null);
const custom=taskPath?JSON.parse(await readFile(resolve(taskPath),'utf8')):null;
const detailedReporting=!!custom?.detailedReport&&!stopAtHandoff;
const targets=custom?.targets||[custom||{name:'fixture'}];
if(custom&&(!custom.prompt||!targets.length||targets.some(t=>!t.url||(!t.cart&&(!Array.isArray(t.expect)||!t.expect.length)))))throw new Error('Task requires a prompt and URL/expect or URL/cart for each target.');
if(agents*targets.length>10)throw new Error('At most 10 concurrent workers are supported across all targets.');
if(new Set(targets.map(t=>t.name||'custom')).size!==targets.length)throw new Error('Target names must be unique.');
if(targets.some(t=>t.name&&!/^[a-z0-9-]+$/i.test(t.name)))throw new Error('Target names must contain only letters, numbers and hyphens.');
if(commerceTools&&targets.some(t=>!['woocommerce','prestashop','magento'].includes(t.name)||!t.cart))throw new Error('--commerce-tools requires supported commerce targets with cart assertions.');
const runId=new Date().toISOString().replaceAll(':','-')+'-'+randomUUID().slice(0,8);
const output=resolve(option('output',join(here,'../../output/playwright/agent-browser')),runId);
await mkdir(output,{recursive:true});
await mkdir(join(output,'harness-source'));
for(const file of ['run.mjs','app-server.mjs','broker.mjs','commerce-broker.mjs','commerce-adapter.mjs','commerce-verifier.mjs','metrics.mjs','detailed-report.mjs','isolation.txt'])await writeFile(join(output,'harness-source',file),await readFile(join(here,file)));
if(custom)await writeFile(join(output,'task.json'),JSON.stringify(custom,null,2));
const home=await mkdtemp(join(tmpdir(),'codex-browser-'));
const work=join(home,'work');await mkdir(work);
await symlink(join(process.env.CODEX_HOME||join(homedir(),'.codex'),'auth.json'),join(home,'auth.json'));
// Only auth is shared. No user config, MCP servers, hooks or plugins are inherited.
const disabled=['shell_tool','shell_snapshot','unified_exec','apps','plugins','hooks','browser_use','browser_use_external','computer_use','multi_agent','image_generation','skill_search','code_mode','view_image','sleep_tool'];
await writeFile(join(home,'config.toml'),'web_search = "disabled"\nproject_doc_max_bytes = 0\n[features]\n'+disabled.map(x=>`${x} = false`).join('\n')+'\nskip_host_skill_discovery = true\n');
const preprompt=(await readFile(join(here,'isolation.txt'),'utf8')).trim();
const events=createWriteStream(join(output,'events.jsonl'));
let app,browser,fixture;
const broker=commerceTools?new CommerceBroker({catalogOnce}):new Broker();const live=new Map();const results=[];const started=performance.now();
let shuttingDown=false;
async function shutdown(){if(shuttingDown)return;shuttingDown=true;app?.stop();await browser?.close();await new Promise(r=>fixture?fixture.close(r):r());events.end();await rm(home,{recursive:true,force:true});}
process.once('SIGINT',()=>shutdown().then(()=>process.exit(130)));
process.once('SIGTERM',()=>shutdown().then(()=>process.exit(143)));
try{
  const html=await readFile(join(here,'fixture.html'));
  fixture=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html);});
  await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${fixture.address().port}`;
  browser=await chromium.launch({headless:!(keepOpen||argv.includes('--headed'))});
  app=new AppServer({home,cwd:work,log:entry=>events.write(JSON.stringify(entry)+'\n')});
  app.on('closed',error=>{for(const job of live.values())job.reject(error);});
  app.on('message',async message=>{
    const p=message.params||{};const job=live.get(p.threadId);
    if(message.method==='item/tool/call'){
      try{
        if(p.tool!=='assigned_browser'&&!(commerceTools&&p.tool==='assigned_shop'))throw new Error('BLOCKED: outside assigned browser context');
        const result=await broker.call(p.threadId,p.arguments,p.tool);
        app.send({id:message.id,result:{success:true,contentItems:[{type:'inputText',text:JSON.stringify(result)}]}});
        if(stopAtHandoff&&p.arguments.action==='handoff'&&result.handedOver&&job){
          job.handoffStopRequested=true;job.handoffStopAt=performance.now();
          events.write(JSON.stringify({controller:'stop-after-verified-handoff',threadId:p.threadId,turnId:job.turnId,emittedAtMs:Date.now()})+'\n');
          job.handoffStopPromise=app.request('turn/interrupt',{threadId:p.threadId,turnId:job.turnId}).catch(error=>{job.handoffStopError=error.message;});
          await job.handoffStopPromise;
        }
      }catch(error){app.send({id:message.id,result:{success:false,contentItems:[{type:'inputText',text:error.message}]}});}
    }else if(message.id!==undefined){
      app.send({id:message.id,error:{code:-32601,message:'This benchmark accepts only assigned session tool requests.'}});
      if(job)job.unexpectedRequests.push(message.method);
    }else if(job){
      if(message.method==='thread/tokenUsage/updated')job.usage=p.tokenUsage.total;
      if(message.method==='model/rerouted')job.reroutes.push(p);
      if(message.method==='item/completed'){
        if(p.item.type==='agentMessage'){job.messages.push(p.item.text);if(p.item.phase==='final_answer')job.finalMessage=p.item.text;}
        if(['commandExecution','fileChange','mcpToolCall','webSearch','collabAgentToolCall'].includes(p.item.type))job.unexpectedRequests.push(p.item.type);
      }
      if(message.method==='turn/completed')job.resolve(p.turn);
    }
  });
  await app.init();
  const catalog=await app.request('model/list',{includeHidden:true});
  const selected=catalog.data.find(m=>m.id===model||m.model===model);
  if(!selected)throw new Error(`Requested model ${model} unavailable; no substitution allowed. Available: ${catalog.data.map(m=>m.id).join(', ')}`);
  if(!selected.supportedReasoningEfforts?.some(x=>x.reasoningEffort===effort))throw new Error(`${model} does not advertise xhigh.`);
  await writeFile(join(output,'model.json'),JSON.stringify(selected,null,2));
  console.log(`Run ${runId}: ${agents} agents per target × ${targets.length} targets × ${sessions} sessions; ${model}/${effort}`);
  async function runAgent(session,index,target){
    const targetName=target.name||'custom';
    const id=(targets.length>1?targetName+'-':'')+`session-${session}-agent-${index}`;
    const handle=randomUUID();const agentStart=performance.now();
    const context=await browser.newContext();const page=await context.newPage();
    page.setDefaultTimeout(10000);
    // Any popup stays in this context but is immediately closed by the controller.
    context.on('page',popup=>{if(popup!==page)popup.close().catch(()=>{});});
    const item=index%2?{id:'mug',name:'Blue Ceramic Mug',price:12}:{id:'bag',name:'Canvas Tote Bag',price:18};
    const quantity=1+((session+index)%3);
    const url=target.url||`${origin}/?assignment=${encodeURIComponent(runId+'-'+id)}`;
    await page.goto(url,{waitUntil:commerceTools?'domcontentloaded':'load',timeout:60000});
    const assignment={handle,page,context,target,stopAtHandoff,released:false,screenshot:join(output,id+'.png')};
    assignment.verify=async()=>{
      if(target.cart)return verifyCommerceCart(page,target);
      if(custom){const checks=await Promise.all(target.expect.map(async text=>({text,visible:await page.getByText(text,{exact:true}).isVisible()})));return {ok:checks.every(x=>x.visible),checks};}
      const observed=await page.evaluate(()=>({owner:localStorage.getItem('owner'),sessionOwner:sessionStorage.getItem('owner'),cookie:document.cookie,cart:JSON.parse(localStorage.getItem('cart')||'[]'),cartVisible:!document.getElementById('cart').hidden,text:document.getElementById('items').innerText,total:document.getElementById('total').innerText}));
      const expectedOwner=runId+'-'+id;const entry=observed.cart[0];
      const ok=observed.owner===expectedOwner&&observed.sessionOwner===expectedOwner&&observed.cookie.split('; ').includes('owner='+encodeURIComponent(expectedOwner))&&observed.cart.length===1&&entry.id===item.id&&entry.quantity===quantity&&observed.cartVisible&&observed.text.includes(item.name)&&observed.text.includes(`quantity ${quantity}`)&&observed.total===`Total: $${(quantity*item.price).toFixed(2)}`;
      return {ok,observed,expected:{owner:expectedOwner,item:item.id,quantity,total:quantity*item.price}};
    };
    const toolInstructions=commerceTools?'Use assigned_shop for structured discovery, batched search/details, and basket_sync. Call inspect first. Choose products yourself from the returned storefront data; no product candidates are predetermined. Submit the three desired items together with the basket revision and a unique operationId. Use assigned_browser only if the commerce tools cannot complete an operation. Do not use shell, files, external tools, other agents, global controls, or arbitrary JavaScript. Call assigned_shop handoff once complete. After successful handoff, use neither tool; report SUCCESS with the items/quantities/total. The controller measures tokens and wall time; do not estimate them.':'Use only assigned_browser. Do not use shell, files, external tools, other agents, global controls, or arbitrary JavaScript. Read a snapshot first. Call handoff once complete. After successful handoff, perform no further browser actions; report SUCCESS with the item/quantity/total. The controller measures tokens and wall time; do not estimate them.';
    const reportingInstructions=commerceTools?detailedReportInstructions.replaceAll('assigned_browser','assigned_shop').replace('visible storefront','assigned storefront data').replace('evidence from the pages','evidence from the storefront API or pages'):detailedReportInstructions;
    const discoveryInstructions=catalogOnce?'\nInitial inspect includes all available descriptions and category/attribute summaries. Use this catalog directly. Do not repeat searches, detail requests, or browse listings when coverage is complete. Do not chase missing color or size with synonym searches. If a requested type is absent from complete coverage, select a sensible alternative. Use the assigned browser only when incomplete coverage or an operation genuinely requires it.':'';
    const completionInstructions=stopAtHandoff?'\nAfter selecting, put a brief explanation of choices, substitutions and unknown fit/color in basket_sync note (at most two sentences). The controller ends your turn immediately after successful handoff. Do not produce an agent report or final answer; measured results come from the controller.':'';
    const phaseInstructions=stopAtHandoff&&custom?.detailedReport?'\nTo measure your work, call '+(commerceTools?'assigned_shop':'assigned_browser')+' action phase with phase and a short note whenever you move between discovery, comparison, cart, and verification. Use discovery to find the range and check requested items; comparison to inspect product attributes and decide; cart to add/update items; verification to check the final cart. You can return to an earlier phase as needed. The controller measures elapsed durations, including failed tool calls.':'';
    const prompt=preprompt+'\n\nAssigned page/session handle: '+handle+'\n'+(custom?.prompt||`Search for ${item.name} using the search field and Search button. Set its quantity to ${quantity}, add it to the cart, then open the cart and verify the item, quantity and total $${(item.price*quantity).toFixed(2)}.`)+'\n'+(stopAtHandoff?toolInstructions.replace(/After successful handoff,.*?do not estimate them\./,'The controller measures tokens and wall time. Do not estimate them.'):toolInstructions)+discoveryInstructions+phaseInstructions+completionInstructions+(detailedReporting?reportingInstructions:'');
    await writeFile(join(output,id+'.prompt.txt'),prompt);
    let timer,threadId,job;
    try{
      const response=await app.request('thread/start',{model,allowProviderModelFallback:false,cwd:work,approvalPolicy:'never',sandbox:'read-only',ephemeral:true,baseInstructions:commerceTools?'You are a shopping task worker. Use assigned_shop for programmatic work in your assigned browser session, with assigned_browser only when needed. Complete the user task then hand over the page.':'You are a browser task worker. Use only the assigned_browser dynamic tool. Complete the user task then hand over the page.',developerInstructions:preprompt,dynamicTools:commerceTools?[commerceToolFor({catalogOnce,stopAtHandoff}),browserTool]:[browserTool],config:{model_reasoning_effort:effort}});
      if(response.model!==model)throw new Error(`Unexpected model ${response.model}`);
      threadId=response.thread.id;assignment.threadId=threadId;broker.register(threadId,assignment);
      let resolveTurn,rejectTurn;const done=new Promise((resolve,reject)=>{resolveTurn=resolve;rejectTurn=reject;});
      // Attach a handler immediately, including during a slow turn/start RPC.
      done.catch(()=>{});
      job={resolve:resolveTurn,reject:rejectTurn,messages:[],usage:null,reroutes:[],unexpectedRequests:[]};live.set(threadId,job);
      timer=setTimeout(()=>job.reject(new Error('Agent timeout')),timeout);
      const turnStart=performance.now();
      assignment.turnStart=turnStart;
      const turn=await app.request('turn/start',{threadId,model,effort,input:[{type:'text',text:prompt}],...(detailedReporting?{outputSchema:detailedReportSchema}:{})});
      job.turnId=turn.turn.id;
      const completion=await done;
      if(job.handoffStopPromise)await job.handoffStopPromise;
      const completedAt=performance.now();
      const finalVerification=await assignment.verify();
      let detailedReport=null,reportError=null;
      if(detailedReporting){try{detailedReport=JSON.parse(job.finalMessage||job.messages.at(-1));}catch(error){reportError='Detailed report was not valid JSON: '+error.message;}}
      const reportMatchesCart=!detailedReporting||(detailedReport?.status==='SUCCESS'&&detailedReport.selections.length===finalVerification.items?.length&&detailedReport.selections.every(x=>finalVerification.items.some(item=>item.name===x.productName&&item.quantity===x.quantity&&item.unitPrice===x.unitPrice)));
      const turnAccepted=stopAtHandoff?job.handoffStopRequested&&['interrupted','completed'].includes(completion.status)&&!job.handoffStopError&&!job.finalMessage:completion.status==='completed'&&job.messages.some(x=>x.includes('SUCCESS'));
      const success=turnAccepted&&assignment.released&&finalVerification.ok&&job.usage!==null&&!job.reroutes.length&&!job.unexpectedRequests.length&&reportMatchesCart;
      const result={id,target:targetName,threadId,handle,model,effort,status:success?'PASS':'FAIL',turnStatus:completion.status,termination:stopAtHandoff?{policy:'controller-stop-after-verified-handoff',stopRequested:!!job.handoffStopRequested,stopError:job.handoffStopError||null,finalAgentMessageProduced:!!job.finalMessage}:null,seconds:rounded(completedAt-turnStart),totalSeconds:rounded(completedAt-agentStart),handoffSeconds:assignment.handoffAt?rounded(assignment.handoffAt-turnStart):null,usage:job.usage,tokens:tokenSummary(job.usage),timing:timingSummary(assignment,broker.audit,completedAt),...(commerceTools?{apiAudit:assignment.apiAudit}:{}),detailedReport,reportError,reportMatchesCart,handedOver:assignment.released,verification:finalVerification,messages:job.messages,reroutes:job.reroutes,unexpectedRequests:job.unexpectedRequests,screenshot:assignment.screenshot,url:page.url()};
      if(detailedReport){await writeFile(join(output,id+'.agent-report.json'),JSON.stringify(detailedReport,null,2));await writeFile(join(output,id+'.agent-report.md'),reportMarkdown(id,detailedReport,result.timing,result.tokens));}
      if(!assignment.released)await page.screenshot({path:assignment.screenshot,fullPage:true});
      results.push(result);console.log(`${id}: ${result.status}, ${result.seconds}s, ${result.usage?.totalTokens??'unknown'} tokens`);
    }catch(error){
      assignment.released=true;
      if(threadId&&job?.turnId)await app.request('turn/interrupt',{threadId,turnId:job.turnId}).catch(()=>{});
      await page.screenshot({path:assignment.screenshot,fullPage:true}).catch(()=>{});
      results.push({id,target:targetName,threadId,handle,model,effort,status:'FAIL',error:error.message,usage:job?.usage??null,tokens:tokenSummary(job?.usage),timing:timingSummary(assignment,broker.audit,performance.now()),...(commerceTools?{apiAudit:assignment.apiAudit}:{}),messages:job?.messages||[],totalSeconds:rounded(performance.now()-agentStart),screenshot:assignment.screenshot,url:page.url()});
      console.error(`${id}: FAIL ${error.message}`);
    }finally{clearTimeout(timer);if(threadId)live.delete(threadId);}
    // Preserve the live page for the controller/user, and a portable state snapshot.
    await context.storageState({path:join(output,id+'.storage.json')});
  }
  // Repeat concurrent cohorts; earlier contexts stay live to catch cross-session interference.
  for(let session=1;session<=sessions;session++){
    const jobs=targets.flatMap(target=>Array.from({length:agents},(_,i)=>({target,index:i+1})));
    const cohort=await Promise.allSettled(jobs.map(({target,index})=>runAgent(session,index,target)));
    cohort.forEach((r,i)=>{if(r.status==='rejected')results.push({id:`${jobs[i].target.name||'custom'}-session-${session}-agent-${jobs[i].index}`,target:jobs[i].target.name||'custom',status:'FAIL',error:r.reason.message,usage:null});});
  }
  // Re-check earlier handed-off pages after all subsequent sessions have finished.
  for(const result of results){
    const assignment=broker.assignments.get(result.threadId);
    if(assignment&&result.status==='PASS'){
      try{result.endOfRunVerification=await assignment.verify();if(!result.endOfRunVerification.ok)result.status='FAIL';}
      catch(error){result.status='FAIL';result.error=error.message;}
    }
  }
  const passed=results.every(r=>r.status==='PASS')&&results.length===agents*sessions*targets.length;
  const report={runId,model,effort,tooling:commerceTools?'commerce-api-with-browser-fallback':'browser-only',discoveryPolicy:catalogOnce?'one-full-catalog-inspection':'optional-search-and-details',completionPolicy:stopAtHandoff?'controller-stop-after-verified-handoff':'agent-final-answer',detailedReporting,agentsPerTarget:agents,agentsPerSession:agents*targets.length,targets:targets.map(t=>({name:t.name||'custom',url:t.url||origin})),sharedTaskPrompt:custom?.prompt||null,sessions,wallSeconds:rounded(performance.now()-started),status:passed?'PASS':'FAIL',tokens:results.every(r=>r.usage)?results.reduce((s,r)=>s+r.usage.totalTokens,0):null,tokenAccounting:'Codex cumulative thread usage. Each worker has one fresh thread. Cached input is a subset of input; reasoning output is a subset of output.',handoff:keepOpen?'Live pages retained until Ctrl-C':'Controller verified live pages after revocation; screenshots and storage saved; browser closed at test teardown',results,audit:broker.audit};
  report.tokenSummary=results.every(r=>r.usage)?tokenSummary(Object.fromEntries(Object.keys(results[0].usage).map(k=>[k,results.reduce((s,r)=>s+r.usage[k],0)]))):null;
  if(commerceTools)report.commerceSummary={agentToolCalls:broker.audit.length,commerceToolCalls:broker.audit.filter(x=>x.tool==='assigned_shop').length,browserFallbackCalls:broker.audit.filter(x=>x.tool==='assigned_browser'&&x.action!=='phase').length,manualPageInteractionCalls:broker.audit.filter(x=>x.tool==='assigned_browser'&&['snapshot','click','fill','press'].includes(x.action)).length,apiRequests:results.reduce((s,r)=>s+(r.timing?.apiRequests||0),0),apiWriteRequests:results.reduce((s,r)=>s+(r.timing?.apiWriteRequests||0),0),nativeMutationOperations:results.reduce((s,r)=>s+(r.timing?.nativeMutationOperations||0),0),measurementNote:'Tool calls, explicit API requests, native mutation suboperations, and internal browser evaluations/navigation are distinct units. Phase annotations are tool calls. HTTP asset requests and automatic storefront traffic are excluded. Manual page interaction calls match the baseline snapshot/click/fill/press definition.'};
  const normalizedPrompts=await Promise.all(results.map(r=>readFile(join(output,r.id+'.prompt.txt'),'utf8').then(s=>s.replace(/Assigned page\/session handle: [^\n]+/,'Assigned page/session handle: ASSIGNED_HANDLE')).catch(()=>null)));
  report.identicalPromptsExceptHandles=normalizedPrompts.every(x=>x!==null)&&new Set(normalizedPrompts).size===1;
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  await writeFile(join(output,'report.md'),`# Browser agent test: ${report.status}\n\nModel: ${model}; effort: ${effort}. ${agents} agents per target × ${targets.length} targets × ${sessions} sessions. Wall time: ${report.wallSeconds}s. Tokens excluding cached input: ${report.tokenSummary?.totalExcludingCached??'unknown'}; cached input: ${report.tokenSummary?.cachedInput??'unknown'}; total including cache: ${report.tokens}.\n\n${custom?.prompt||''}\n\n| Agent | Result | Seconds | Uncached + output | Cached input | Browser seconds | Failed calls | Handoff |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |\n`+results.map(r=>`| ${r.id} | ${r.status} | ${r.seconds??r.totalSeconds} | ${r.tokens?.totalExcludingCached??'unknown'} | ${r.tokens?.cachedInput??'unknown'} | ${r.timing?.browserToolSeconds??'unknown'} | ${r.timing?.failedToolCalls??'unknown'} | ${r.handedOver??false} |`).join('\n')+'\n\n'+report.handoff+'\n\nIdentical prompts except assigned handles: '+report.identicalPromptsExceptHandles+'\n\n'+results.filter(r=>r.detailedReport).map(r=>`[${r.id}: detailed agent report](${r.id}.agent-report.md)`).join('\n\n')+'\n');
  console.log(`Report: ${join(output,'report.json')}`);process.exitCode=passed?0:1;
  if(keepOpen){console.log('Browser handed over. Live contexts remain open; Ctrl-C to end.');await new Promise(()=>{});}
}catch(error){await writeFile(join(output,'fatal.json'),JSON.stringify({runId,error:error.message,results},null,2));throw error;}finally{await shutdown();}
function rounded(ms){return Math.round(ms)/1000;}
