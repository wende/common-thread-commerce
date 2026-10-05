"""Analyze benchmark timing and event metadata; never read internal reasoning text."""
import collections
import json
import statistics
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
NEW=ROOT/'output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f'
OLD=ROOT/'output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab'
new=json.loads((NEW/'report.json').read_text())
old=json.loads((OLD/'report.json').read_text())
workers=sorted(new['results'],key=lambda r:r['id'])
ids={r['threadId']:r['id'] for r in workers}
events=collections.defaultdict(list)
for line in (NEW/'events.jsonl').open():
    try:e=json.loads(line)
    except ValueError:continue
    tid=e.get('params',{}).get('threadId')
    if tid in ids:events[tid].append(e)

phase_order=['orientation','discovery','comparison','cart','verification','reporting']
total_agent_seconds=sum(r['timing']['wallSeconds'] for r in workers)
phase_stats={}
for phase in phase_order:
    wall=sum(r['timing']['phases'][phase]['wallSeconds'] for r in workers)
    tools=sum(r['timing']['phases'][phase]['browserToolSeconds'] for r in workers)
    phase_stats[phase]={'summedAgentSeconds':wall,'meanSeconds':wall/6,'sharePercent':100*wall/total_agent_seconds,'summedToolSeconds':tools}

metadata=[]
product_records=collections.Counter()
response_bytes=collections.Counter()
for tid,es in events.items():
    previous=None;pending=[];cycles=[]
    for e in es:
        q=e.get('params',{});method=e.get('method');ts=e.get('emittedAtMs')
        if method=='turn/started':previous=ts
        if method=='item/started' and q.get('item',{}).get('type') in ['reasoning','dynamicToolCall','agentMessage']:
            # Retain only event kind/time and tool arguments; no reasoning content.
            item=q['item'];pending.append({'time':ts,'kind':item['type'],'action':item.get('arguments',{}).get('action'),'phase':item.get('arguments',{}).get('phase')})
        if method=='item/completed' and q.get('item',{}).get('type')=='dynamicToolCall':
            item=q['item'];action=item.get('arguments',{}).get('action')
            for content in item.get('contentItems',[]):
                if content.get('type')!='inputText':continue
                response_bytes[action]+=len(content.get('text','').encode())
                try:body=json.loads(content['text'])
                except (ValueError,KeyError):continue
                if isinstance(body,dict):
                    product_records[action]+=len(body.get('products',[]))+sum(len(group.get('products',[])) for group in body.get('results',[]))
        if method=='thread/tokenUsage/updated':
            first=min((item['time'] for item in pending),default=ts)
            calls=[{'action':item['action'],'phase':item['phase']} for item in pending if item['kind']=='dynamicToolCall']
            usage=q['tokenUsage']['last']
            cycles.append({'firstActivityGapSeconds':(first-previous)/1000,'responseIntervalSeconds':(ts-previous)/1000,'tools':calls,'uncachedInput':usage['inputTokens']-usage['cachedInputTokens'],'output':usage['outputTokens'],'reasoningOutput':usage['reasoningOutputTokens']})
            previous=ts;pending=[]
    metadata.append({'id':ids[tid],'usageBearingResponses':len(cycles),'phaseOnlyResponses':sum(bool(c['tools']) and all(t['action']=='phase' for t in c['tools']) for c in cycles),'firstActivityGapSeconds':sum(c['firstActivityGapSeconds'] for c in cycles),'longGaps':[c for c in cycles if c['firstActivityGapSeconds']>=10],'finalReportResponse':cycles[-1],'cycles':cycles})

old_by_id={r['id']:r for r in old['results']}
matched=[(old_by_id[r['id']],r) for r in workers if old_by_id[r['id']]['status']=='PASS']
paired_phases={phase:{'baselineMean':statistics.mean(a['timing']['phases'][phase]['wallSeconds'] for a,b in matched),'newMean':statistics.mean(b['timing']['phases'][phase]['wallSeconds'] for a,b in matched)} for phase in phase_order}
critical=max(workers,key=lambda r:r['totalSeconds'])
critical_meta=next(m for m in metadata if m['id']==critical['id'])
long_gap_total=sum(c['firstActivityGapSeconds'] for c in critical_meta['longGaps'])
report_output=sum(m['finalReportResponse']['output'] for m in metadata)
report_reasoning=sum(m['finalReportResponse']['reasoningOutput'] for m in metadata)
report_uncached=sum(m['finalReportResponse']['uncachedInput']+m['finalReportResponse']['output'] for m in metadata)
new_input=new['tokenSummary']['uncachedInput']+new['tokenSummary']['cachedInput']
old_input=old['tokenSummary']['uncachedInput']+old['tokenSummary']['cachedInput']
handoff_only=max(r['totalSeconds']-(r['seconds']-r['handoffSeconds']) for r in workers)
target=old['wallSeconds']/5
data={'newRun':new['runId'],'baselineRun':old['runId'],'phaseMeans':phase_stats,'pairedCompletedWorkerPhaseMeans':paired_phases,'summedAgentSeconds':total_agent_seconds,'assignedToolSeconds':sum(r['timing']['browserToolSeconds'] for r in workers),'criticalWorker':critical['id'],'criticalWorkerLongGapsSeconds':long_gap_total,'fiveTimesWallTargetSeconds':target,'reportingOnlyRemovalLowerBoundSeconds':handoff_only,'capturedResponseCycles':sum(m['usageBearingResponses'] for m in metadata),'phaseOnlyResponseCycles':sum(m['phaseOnlyResponses'] for m in metadata),'finalReportTokens':{'outputIncludingReasoning':report_output,'reasoningSubset':report_reasoning,'nonReasoningOutput':report_output-report_reasoning,'uncachedInputPlusOutput':report_uncached},'cacheInputShare':{'baseline':old['tokenSummary']['cachedInput']/old_input,'new':new['tokenSummary']['cachedInput']/new_input},'productRecordsReturned':dict(product_records),'responseBytesByAction':dict(response_bytes),'workers':metadata,'methodology':'Phase durations are worker-annotated intervals measured by the controller. First-activity gaps use server-emitted event timestamps: previous usage update to next reasoning/tool/agent-message start. They are not proven server queue time or pure model reasoning time. No internal reasoning text was inspected, no new inference calls were made, and the measured harness was not changed.'}
(NEW/'bottleneck-analysis.json').write_text(json.dumps(data,indent=2))

labels={'orientation':'Orientation / initial catalog','discovery':'Discovery / searches','comparison':'Comparison / selecting products','cart':'Basket stage','verification':'Verification / handoff','reporting':'Detailed report after handoff'}
lines=[
    '# Why the commerce-tool run did not reach 5× elapsed-time improvement', '',
    'The remaining cost is primarily repeated model responses and detailed reporting. Actual assigned-tool execution took only 17.402 seconds summed across six workers: 1.40% of their combined 1,246.831 seconds. API and browser operations were already fast; reducing those few seconds cannot produce a further several-fold improvement.', '',
    'This is an analysis of the retained traces. No new model runs were launched and no platform or benchmark behavior was changed during the investigation.', '',
    '## Where time went', '',
    'These are means per worker. The six workers ran concurrently, so the rows partition average worker time rather than the 286.127-second cohort wall time. Tool time is contained within the phase durations, not an extra component.', '',
    '| Phase | Mean seconds per worker | Share of worker time |', '| --- | ---: | ---: |'
]
for phase,stats in phase_stats.items():lines.append(f"| {labels[phase]} | {stats['meanSeconds']:.3f} | {stats['sharePercent']:.2f}% |")
lines += [
    '', 'Discovery and comparison together averaged 93.621 seconds per worker (45.05%). Reporting averaged 82.889 seconds (39.89%). The actual tools averaged 2.900 seconds, with 204.905 seconds outside tool execution. Outside-tool time includes model generation, prefill/startup, transport and orchestration; it is not a measured pure reasoning time.', '',
    '## What improved, using the four workers that completed the baseline', '',
    '| Phase | Baseline mean (s) | New mean (s) | Observed ratio |', '| --- | ---: | ---: | ---: |'
]
for phase,stats in paired_phases.items():lines.append(f"| {labels[phase]} | {stats['baselineMean']:.3f} | {stats['newMean']:.3f} | {stats['baselineMean']/stats['newMean']:.2f}× |")
lines += [
    '', 'The basket stage improved 4.75× on these matched workers. Three individual matched workers improved roughly 4.9×, 11.5× and 13.1× in that phase; the fourth contained a long response gap. Discovery barely improved in the matched mean, comparison improved 1.72×, and reporting became slightly slower. Those largely unchanged stages explain the end-to-end result.', '',
    'The baseline whole-run time includes two 600-second timeouts. Its 603.218 / 286.127 = 2.11× ratio is therefore not a uniform per-task speedup. For the four matched completed workers, mean full-turn time improved only 1.46×, from 333.416 to 228.731 seconds.', '',
    '## The slowest worker had large gaps unrelated to tool execution', '',
    f"{critical['id']} determined cohort completion. Its turn lasted {critical['seconds']:.3f} seconds, handoff occurred at {critical['handoffSeconds']:.3f}, and all its tools together took {critical['timing']['browserToolSeconds']:.3f} seconds. It made 12 tool calls, fewer than the other PrestaShop worker’s 19, yet finished 51.921 seconds later.", '',
    'Six response cycles had long gaps before the next observable generated item began:', '',
    '| Next action | Gap before first observable generated item (s) | Reasoning output tokens in that response | Total output tokens |', '| --- | ---: | ---: | ---: |'
]
for c in critical_meta['longGaps']:
    actions=', '.join(t['action']+((' '+t['phase']) if t.get('phase') else '') for t in c['tools'])
    lines.append(f"| {actions} | {c['firstActivityGapSeconds']:.3f} | {c['reasoningOutput']} | {c['output']} |")
lines += [
    '', f'Those six gaps total {long_gap_total:.3f} seconds, or {100*long_gap_total/critical["seconds"]:.2f}% of its full turn. Across all response cycles, its first-activity gaps total {critical_meta["firstActivityGapSeconds"]:.3f} seconds. The next responses often contained only 18–52 reasoning output tokens, so these are not explained by lengthy visible reports or slow browser execution.', '',
    'The timestamps do not identify the underlying cause. Startup/prefill, queueing, transport, hidden work before an event is emitted, or orchestration may contribute. The trace provides no explicit retry or rate-limit diagnosis. Calling all of this “thinking time” or “server queue time” would overstate the evidence.', '',
    'Removing only these gaps from this one worker would make the other PrestaShop worker the longest run. Other workers still spend substantial time comparing and reporting, so this anomaly alone does not explain the whole cohort’s limit.', '',
    '## The protocol still encouraged repeated work', '',
    'The model tool surface improved, but the interaction trajectory was not reduced to the intended inspect → choose → commit flow.', '',
    '- The agents received a complete 30-product catalog, then made 18 search calls, including repeated synonyms for absent drinkware and missing color attributes. Those searches were local catalog lookups; they added no new inventory. Their responses returned 138 product records, many already present in the initial catalog.',
    '- Three search calls exceeded the ten-query cap and were retried in smaller batches. This cheap local operation can split internally or accept a larger batch; asking the model to handle that limit creates more responses.',
    '- Substring matching made red match words such as tapered, collared and structured. Agents spent time rejecting these false color matches. Warm also matched warm days, which does not establish winter insulation. Explicit attribute and sale fields plus word-aware text matching would make the evidence clearer.',
    '- Seven detail calls returned 35 product records in addition to the initial catalog. The full descriptions sometimes add useful information, but returning the entire already-known record each time increases context. Only changed/requested fields are needed.',
    '- There were 24 phase annotations. Eight consumed a response cycle containing only phase commands; the others were combined with substantive actions. Controller-inferred phases would preserve timing without asking the model to generate these commands.',
    '- Every worker called verify after basket_sync had already returned checked API state, then handoff checked API and rendered state again. The final basket operation can perform write, readback, native-page verification and handoff in one helper execution.',
    '- One PrestaShop worker made seven browser calls to inspect incomplete color/product data. Two failed on duplicate accessible link names. Five workers completed without that fallback; the common issue was unknown metadata, not failure of the native basket adapters.', '',
    f"The trace contains {data['capturedResponseCycles']} distinct usage-bearing model response cycles. Eight were phase-only. This count differs from the 80 tool calls because one response can emit several tools, and the final report emits none. The longest worker used 13 response cycles; repeated startup delays therefore accumulated despite fast tools.", '',
    '## Reporting is a large independent workload', '',
    f"The six final report responses generated {report_output:,} output tokens: {report_reasoning:,} reasoning tokens and {report_output-report_reasoning:,} other output tokens. That is {100*report_output/new['tokenSummary']['outputIncludingReasoning']:.2f}% of all output, and {100*report_reasoning/new['tokenSummary']['reasoningOutput']:.2f}% of all reasoning output in the run.", '',
    'After the cart was already verified and the browser released, each worker spent 72.621–92.753 seconds finishing its JSON report. The schema asked it to repeat product evidence, substitutions, unknowns, timing measurements, search history, difficulties and cart totals. The model also used xhigh reasoning for this reporting response.', '',
    'A useful next design is to keep model-authored selection rationale, uncertainty and brief difficulty assessments, while the controller builds the detailed timing, token, interaction and basket report from captured evidence. This preserves a detailed research artifact without requiring the model to narrate every measured number or duplicate product facts.', '',
    '## Why token improvements also differ', '',
    f"Total tokens including cache improved {old['tokens']/new['tokens']:.2f}×, already beyond 5×. Excluding cache, the ratio is {old['tokenSummary']['totalExcludingCached']/new['tokenSummary']['totalExcludingCached']:.2f}×. Total input volume fell {old_input/new_input:.2f}×, but cached input represented {100*data['cacheInputShare']['baseline']:.2f}% of baseline input and {100*data['cacheInputShare']['new']:.2f}% of new input. The recorded fractions differ; this is not evidence of a caching malfunction.", '',
    'Output decreased by only 12.26% and reasoning output by only 9.83%, even though browser interactions fell 96.32%. The new run completed six detailed reports, while the baseline completed four, which also affects the output comparison.', '',
    f"Final-report responses used {report_uncached:,} tokens excluding cached input, {100*report_uncached/new['tokenSummary']['totalExcludingCached']:.2f}% of the run. Removing report generation alone would still leave {new['tokenSummary']['totalExcludingCached']-report_uncached:,} such tokens—only {old['tokenSummary']['totalExcludingCached']/(new['tokenSummary']['totalExcludingCached']-report_uncached):.2f}× better than baseline. Repeated response/context costs also need to shrink.", '',
    '## What a 5× target requires', '',
    f"Against the whole-run baseline, a 5× elapsed-time target is {target:.3f} seconds. The current longest handoff alone occurred at 209.803 seconds. Even with all post-handoff reports removed, that worker’s context/setup plus handoff time is {handoff_only:.3f} seconds; the cohort cannot finish earlier while retaining the observed trajectory. Removing reports alone therefore cannot reach 5×.", '',
    'The next experiment should keep Luna xhigh for product selection and change the trajectory:', '',
    '1. inspect returns a compact catalog, complete coverage, category/attribute summaries and existing basket. Stop searching for a type absent from complete coverage or an attribute explicitly unavailable, and report that limitation.',
    '2. The agent selects three product handles and supplies short rationale/uncertainty in one submission. The helper synchronizes the basket, verifies API and native UI state, and hands over the context in the same operation.',
    '3. The controller infers phases and produces the full measurements/report from the event ledger. A concise worker result carries the recommendation reasoning; it need not regenerate all telemetry.',
    '4. Diagnose response-start delays separately, with explicit request-dispatch, first-response-event and completion timestamps. A later controlled concurrency check can test whether the long gaps persist; current traces do not prove their cause.', '',
    'This directly targets repeated model round trips and report generation while retaining the model, session isolation, three-product task, independent cart checks and handoff. Reaching 5× remains a testable target, not a prediction established by this analysis.', '',
    '## Evidence', '',
    f'- [Machine-readable timing and response-cycle analysis]({NEW/"bottleneck-analysis.json"})',
    f'- [New raw benchmark report]({NEW/"report.json"})',
    f'- [New event timestamps, tool arguments and token usage]({NEW/"events.jsonl"})',
    f'- [Baseline raw benchmark report]({OLD/"report.json"})',
    f'- [Full prior comparison]({ROOT/"experiments/agent-browser/LUNA_COMMERCE_TOOL_REPORT_2026-10-05.md"})', '',
    'Phase boundaries are worker annotations; elapsed durations are controller measurements. The event analysis uses timestamps, tool inputs/results and token counters, without inspecting or reproducing internal reasoning text. No new model runs or behavior changes were made.', ''
]
text='\n'.join(lines)
report=ROOT/'experiments/agent-browser/LUNA_BOTTLENECK_ANALYSIS_2026-10-05.md'
report.write_text(text);(NEW/'bottleneck-analysis.md').write_text(text)
print(json.dumps({'report':str(report),'meanPhases':phase_stats,'criticalWorkerLongGapsSeconds':long_gap_total,'responseCycles':data['capturedResponseCycles'],'phaseOnlyResponses':data['phaseOnlyResponseCycles'],'reportOutputTokens':report_output,'reportReasoningTokens':report_reasoning,'reportUncachedPlusOutput':report_uncached,'productRecordsReturned':dict(product_records)},indent=2))
