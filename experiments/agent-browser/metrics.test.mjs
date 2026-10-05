import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenSummary,timingSummary } from './metrics.mjs';
test('cached input and reasoning output subsets are not counted twice',()=>{
  assert.deepEqual(tokenSummary({totalTokens:1200,inputTokens:1000,cachedInputTokens:700,outputTokens:200,reasoningOutputTokens:100}),{totalIncludingCached:1200,cachedInput:700,uncachedInput:300,outputIncludingReasoning:200,reasoningOutput:100,totalExcludingCached:500});
  assert.equal(tokenSummary(null),null);
});
test('phase timings partition wall time and include failed tool durations',()=>{
  const assignment={threadId:'mine',turnStart:1000,phaseEvents:[{phase:'discovery',startedAt:1100,note:'Browse'},{phase:'cart',startedAt:1600,note:'Add items'}],handoffAt:2000};
  const audit=[{threadId:'mine',startedAt:1200,endedAt:1300,durationMs:100,success:false,action:'click',error:'Blocked by modal'},{threadId:'mine',startedAt:1800,endedAt:1950,durationMs:150,success:true,action:'handoff'},{threadId:'other',startedAt:1000,endedAt:1800,durationMs:800,success:true}];
  const result=timingSummary(assignment,audit,2200);
  assert.equal(result.wallSeconds,1.2);assert.equal(result.browserToolSeconds,.25);assert.equal(result.outsideBrowserToolsSeconds,.95);assert.equal(result.toolCalls,2);assert.equal(result.failedToolCalls,1);
  assert.equal(result.phases.discovery.wallSeconds,.5);assert.equal(result.phases.discovery.failures,1);assert.equal(result.phases.cart.wallSeconds,.4);assert.equal(result.phases.reporting.wallSeconds,.2);
  assert.equal(result.slowestCalls[0].action,'handoff');
});
test('controller cutoff has finalization time without a reporting phase',()=>{
  const result=timingSummary({threadId:'mine',turnStart:1000,handoffAt:2000,stopAtHandoff:true},[],2005);
  assert.equal(result.phases.turn_finalization.wallSeconds,.005);
  assert.equal(result.phases.reporting,undefined);
});
