import test from 'node:test';
import assert from 'node:assert/strict';
import { Broker,BLOCKED } from './broker.mjs';
const fakePage=()=>({waitForLoadState:async()=>{},locator:()=>({ariaSnapshot:async()=>'- heading "Assigned page"'}),url:()=> 'http://assigned.test',screenshot:async()=>{}});
test('foreign handle never reaches another page, including across sessions',async()=>{
  const broker=new Broker();let touched=false;
  broker.register('session-a',{handle:'a',page:fakePage()});
  broker.register('session-b',{handle:'b',page:{locator(){touched=true;throw Error('touched');}}});
  await assert.rejects(broker.call('session-a',{handle:'b',action:'snapshot'}),{message:BLOCKED});
  await assert.rejects(broker.call('unknown',{handle:'a',action:'snapshot'}),{message:BLOCKED});
  assert.equal(touched,false);
  assert.match((await broker.call('session-a',{handle:'a',action:'snapshot'})).snapshot,/Assigned/);
});
test('handoff revokes every subsequent operation while leaving the page live',async()=>{
  const broker=new Broker();const a={handle:'a',page:fakePage(),verify:async()=>({ok:true})};broker.register('t',a);
  assert.equal((await broker.call('t',{handle:'a',action:'handoff'})).handedOver,true);
  for(const action of ['snapshot','click','fill','press','handoff'])await assert.rejects(broker.call('t',{handle:'a',action}),{message:BLOCKED});
  assert.equal(a.page.url(),'http://assigned.test');
});
test('unverified success is rejected and does not release the handle',async()=>{
  const broker=new Broker();const a={handle:'a',page:fakePage(),verify:async()=>({ok:false})};broker.register('t',a);
  await assert.rejects(broker.call('t',{handle:'a',action:'handoff'}),/verification failed/);
  assert.equal(a.released,undefined);
});
test('global controls and hidden target parameters are rejected',async()=>{
  const broker=new Broker();broker.register('t',{handle:'a',page:fakePage()});
  for(const action of ['list_tabs','evaluate','navigate','close','new_context'])await assert.rejects(broker.call('t',{handle:'a',action}),{message:BLOCKED});
  await assert.rejects(broker.call('t',{handle:'a',action:'snapshot',target:'b'}),{message:BLOCKED});
});
test('a queued action cannot race past handoff revocation',async()=>{
  const broker=new Broker();broker.register('t',{handle:'a',page:fakePage(),verify:async()=>({ok:true})});
  const handoff=broker.call('t',{handle:'a',action:'handoff'});
  const late=broker.call('t',{handle:'a',action:'snapshot'});
  await handoff;await assert.rejects(late,{message:BLOCKED});
});
test('failed browser calls are timed and retained in the audit',async()=>{
  const broker=new Broker();const page=fakePage();page.getByRole=()=>({click:async()=>{throw new Error('Modal blocks click');}});
  broker.register('t',{handle:'a',page});
  await assert.rejects(broker.call('t',{handle:'a',action:'click',role:'button',name:'Add'}),/Modal blocks/);
  assert.equal(broker.audit.length,1);assert.equal(broker.audit[0].success,false);assert.ok(broker.audit[0].durationMs>=0);assert.match(broker.audit[0].error,/Modal blocks/);
});
test('workflow checkpoints cannot be recorded after handoff',async()=>{
  const broker=new Broker();const a={handle:'a',page:fakePage(),verify:async()=>({ok:true}),threadId:'t',turnStart:performance.now()};broker.register('t',a);
  await broker.call('t',{handle:'a',action:'phase',phase:'discovery',note:'Look for mug'});
  const receipt=await broker.call('t',{handle:'a',action:'handoff'});
  assert.equal(receipt.timing.toolCalls,2);
  await assert.rejects(broker.call('t',{handle:'a',action:'phase',phase:'cart'}),{message:BLOCKED});
});
