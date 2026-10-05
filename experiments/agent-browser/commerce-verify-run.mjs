// Independent readback after a completed cohort, including workers whose report was PARTIAL.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { CommerceAdapter } from './commerce-adapter.mjs';
import { verifyCommerceCart } from './commerce-verifier.mjs';
const dir=resolve(process.argv[2]);
const report=JSON.parse(await readFile(join(dir,'report.json')));
const task=JSON.parse(await readFile(join(dir,'task.json')));
const browser=await chromium.launch();
try{
  const results=await Promise.all(report.results.map(async worker=>{
    const target=task.targets.find(t=>t.name===worker.target);
    const state=JSON.parse(await readFile(join(dir,worker.id+'.storage.json')));
    const hash=createHash('sha256').update(JSON.stringify(state.cookies.map(c=>[c.name,c.value,c.domain,c.path]).sort())).digest('hex');
    const context=await browser.newContext({storageState:state}),page=await context.newPage();await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:60000});
    const assignment={page,context,target,expectedBasket:worker.verification.items.map(i=>({sku:i.sku,quantity:i.quantity,unitPrice:i.unitPrice}))};
    const adapter=new CommerceAdapter(assignment,target);await adapter.initialize();
    const api=await adapter.prepareHandoff();assert.equal(api.ok,true);assert.equal(api.basket.items.length,3);
    const ui=await verifyCommerceCart(page,target);assert.equal(ui.ok,true);
    const namesMatch=worker.detailedReport?worker.detailedReport.selections.length===ui.items.length&&worker.detailedReport.selections.every(s=>ui.items.some(i=>i.name===s.productName&&i.quantity===s.quantity&&i.unitPrice===s.unitPrice)):null;
    if(worker.detailedReport)assert.equal(namesMatch,true);
    return {id:worker.id,target:worker.target,ok:true,agentRecommendationStatus:worker.detailedReport?.status??'controller-only',reportedSelectionsMatchBasket:namesMatch,cookieJarFingerprint:hash,api,ui,apiRequests:assignment.apiAudit.length,apiAudit:assignment.apiAudit};
  }));
  const distinctSessions=task.targets.map(t=>({target:t.name,distinctCookieJars:new Set(results.filter(r=>r.target===t.name).map(r=>r.cookieJarFingerprint)).size===2}));
  assert.ok(distinctSessions.every(r=>r.distinctCookieJars));
  await writeFile(join(dir,'restoration-verification.json'),JSON.stringify({ok:true,measurementNote:'Post-run readback is separate from the measured agent turn and its API counts. The original handed-off contexts remain live; only these restored verification contexts are closed.',results,distinctSessions},null,2));
  console.log(JSON.stringify({ok:true,results:results.map(r=>({id:r.id,ok:r.ok,reportedSelectionsMatchBasket:r.reportedSelectionsMatchBasket})),distinctSessions},null,2));
}finally{await browser.close()}
