const seconds=ms=>Math.round(ms)/1000;
export function tokenSummary(usage){
  if(!usage)return null;
  return {totalIncludingCached:usage.totalTokens,cachedInput:usage.cachedInputTokens,uncachedInput:usage.inputTokens-usage.cachedInputTokens,outputIncludingReasoning:usage.outputTokens,reasoningOutput:usage.reasoningOutputTokens,totalExcludingCached:usage.totalTokens-usage.cachedInputTokens};
}
export function timingSummary(assignment,audit,endedAt){
  const start=assignment.turnStart;
  if(start===undefined)return null;
  const events=[{phase:'orientation',startedAt:start,note:'Turn submitted'},...(assignment.phaseEvents||[])];
  if(assignment.handoffAt)events.push({phase:assignment.stopAtHandoff?'turn_finalization':'reporting',startedAt:assignment.handoffAt,note:assignment.stopAtHandoff?'Verified handoff; controller ends turn without an agent report':'Verified handoff; worker browser access revoked'});
  const calls=audit.filter(x=>x.threadId===assignment.threadId&&x.startedAt>=start&&x.startedAt<=endedAt);
  const phases={};
  for(let i=0;i<events.length;i++){
    const begin=events[i].startedAt,end=Math.min(events[i+1]?.startedAt??endedAt,endedAt);
    if(end<begin)continue;
    const p=phases[events[i].phase]??={wallMs:0,toolMs:0,calls:0,failures:0};
    p.wallMs+=end-begin;
    for(const call of calls){
      p.toolMs+=Math.max(0,Math.min(call.endedAt,end)-Math.max(call.startedAt,begin));
      if(call.startedAt>=begin&&call.startedAt<end){p.calls++;if(!call.success)p.failures++;}
    }
  }
  const toolMs=calls.reduce((sum,x)=>sum+x.durationMs,0);
  const apiCalls=(assignment.apiAudit||[]).filter(x=>x.startedAt>=start&&x.startedAt<=endedAt);
  const native=assignment.apiAudit?{commerceToolCalls:calls.filter(x=>x.tool==='assigned_shop').length,browserFallbackCalls:calls.filter(x=>x.tool==='assigned_browser'&&x.action!=='phase').length,manualPageInteractions:calls.filter(x=>(x.tool||'assigned_browser')==='assigned_browser'&&['snapshot','click','fill','press'].includes(x.action)).length,apiRequests:apiCalls.length,apiWriteRequests:apiCalls.filter(x=>x.operation==='write').length,nativeMutationOperations:apiCalls.reduce((s,x)=>s+(x.nativeOperations||0),0),apiSeconds:seconds(apiCalls.reduce((s,x)=>s+(x.endedAt-x.startedAt),0)),internalBrowser:{...assignment.internalBrowser}}:{};
  return {wallSeconds:seconds(endedAt-start),browserToolSeconds:seconds(toolMs),outsideBrowserToolsSeconds:seconds(Math.max(0,endedAt-start-toolMs)),toolCalls:calls.length,failedToolCalls:calls.filter(x=>!x.success).length,...native,phases:Object.fromEntries(Object.entries(phases).map(([name,p])=>[name,{wallSeconds:seconds(p.wallMs),browserToolSeconds:seconds(p.toolMs),outsideBrowserToolsSeconds:seconds(Math.max(0,p.wallMs-p.toolMs)),calls:p.calls,failures:p.failures}])),slowestCalls:[...calls].sort((a,b)=>b.durationMs-a.durationMs).slice(0,10).map(x=>({tool:x.tool||'assigned_browser',action:x.action,name:x.name,urlBefore:x.urlBefore,urlAfter:x.urlAfter,durationSeconds:seconds(x.durationMs),success:x.success,error:x.error})),notes:(assignment.phaseEvents||[]).map(x=>({phase:x.phase,note:x.note,elapsedSeconds:seconds(x.startedAt-start)})),measurementNote:'Phase boundaries are marked by the worker; elapsed durations and tool execution durations are measured by the controller. browserToolSeconds is the legacy name for time in all assigned tools, including commerce API helpers. Time outside tools includes model generation, transport, scheduling and orchestration; it is not a pure reasoning-time measurement.'};
}
