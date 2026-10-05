// Deterministic adapter checks before spending model tokens; fresh isolated guest contexts.
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CommerceBroker } from './commerce-broker.mjs';
import { verifyCommerceCart } from './commerce-verifier.mjs';
const task=JSON.parse(await readFile(new URL('./vague-commerce-task.json',import.meta.url)));
const output=new URL('../../output/playwright/commerce-tool-smoke/'+new Date().toISOString().replaceAll(':','-')+'/',import.meta.url);
await mkdir(output,{recursive:true});
const catalogOnce=process.argv.includes('--catalog-once');
const browser=await chromium.launch();const broker=new CommerceBroker({catalogOnce});
try{
  const results=await Promise.all(task.targets.flatMap(target=>[1,2].map(async replica=>{
    const context=await browser.newContext(),page=await context.newPage();await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:60000});
    const id=target.name+'-'+replica,handle=randomUUID();
    const a={handle,page,context,target,threadId:id,turnStart:performance.now(),screenshot:new URL(id+'.png',output).pathname,verify:()=>verifyCommerceCart(page,target)};
    broker.register(id,a);
    const call=args=>broker.call(id,{handle,...args},'assigned_shop');
    const inspect=await call({action:'inspect'});assert.equal(inspect.products.length,30);assert.equal(inspect.basket.items.length,0);assert.equal(inspect.coverage.complete,true);
    if(catalogOnce){assert.equal(inspect.catalogSummary.fullDescriptionsIncluded,true);assert.ok(inspect.products.every(p=>typeof p.detailDescription==='string'));}
    const items=['CT-003','CT-011','CT-019'].map(sku=>({product:inspect.products.find(p=>p.sku===sku).product,quantity:1}));
    const plan={action:'basket_sync',items,ifRevision:inspect.basket.revision,operationId:'smoke'};
    const sync=await call(plan);assert.equal(sync.status,'SUCCESS');assert.equal(sync.basket.items.length,3);assert.equal(sync.basket.merchandiseSubtotal,96);
    const writes=a.apiAudit.filter(x=>x.operation==='write').length;
    assert.equal((await call(plan)).idempotentReplay,true);assert.equal(a.apiAudit.filter(x=>x.operation==='write').length,writes);
    const handoff=await call({action:'handoff'});assert.equal(handoff.handedOver,true);assert.equal(handoff.apiVerification.ok,true);
    await assert.rejects(call({action:'inspect'}),/BLOCKED/);
    await page.reload({waitUntil:'domcontentloaded',timeout:60000});await page.locator('input[type="number"]').first().waitFor({state:'visible'});
    assert.equal((await a.verify()).ok,true);
    const after=await a.commerce.basket();assert.equal(after.items.length,3);assert.ok(after.items.every(i=>i.quantity===1));
    return {id,ok:true,apiRequests:a.apiAudit.length,writeRequests:writes,internalBrowser:a.internalBrowser,screenshot:a.screenshot};
  })));
  await writeFile(new URL('report.json',output),JSON.stringify({ok:true,results,audit:broker.audit},null,2));console.log(JSON.stringify({output:output.pathname,results},null,2));
}finally{await browser.close()}
