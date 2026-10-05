"""Controller-only comparison of the catalog-once/no-report experiment.

Reads tool metadata, basket evidence, timestamps and token counters. Does not
inspect model reasoning text. Run with the new output directory as argument.
"""
import collections
import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
current_dir = Path(sys.argv[1]).resolve()
previous_dir = ROOT / 'output/playwright/agent-browser/2026-10-05T14-54-34.884Z-9624220f'
original_dir = ROOT / 'output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab'
load = lambda path: json.loads(path.read_text())
current, previous, original = [load(p / 'report.json') for p in [current_dir, previous_dir, original_dir]]
workers = sorted(current['results'], key=lambda w: w['id'])
events = collections.defaultdict(list)
for line in (current_dir / 'events.jsonl').open():
    item = json.loads(line)
    if item.get('params', {}).get('threadId'):
        events[item['params']['threadId']].append(item)

metadata = []
for worker in workers:
    updates = [e['params']['tokenUsage'] for e in events[worker['threadId']] if e.get('method') == 'thread/tokenUsage/updated']
    assert updates and updates[-1]['total'] == worker['usage'], worker['id']
    totals = {key: sum(update['last'][key] for update in updates) for key in worker['usage']}
    assert totals == worker['usage'], (worker['id'], totals, worker['usage'])
    final_messages = sum(e.get('method') == 'item/completed' and e['params'].get('item', {}).get('type') == 'agentMessage' and e['params']['item'].get('phase') == 'final_answer' for e in events[worker['threadId']])
    assert not final_messages and worker['detailedReport'] is None, worker['id']
    initial_catalog = None
    for e in events[worker['threadId']]:
        item = e.get('params', {}).get('item', {})
        if e.get('method') == 'item/completed' and item.get('type') == 'dynamicToolCall' and item.get('arguments', {}).get('action') == 'inspect':
            for content in item.get('contentItems', []):
                if content.get('type') == 'inputText':
                    body = json.loads(content['text'])
                    if 'products' in body:
                        initial_catalog = body
    assert initial_catalog and initial_catalog['coverage']['complete'] and len(initial_catalog['products']) == 30, worker['id']
    assert initial_catalog['catalogSummary']['fullDescriptionsIncluded'] and all('detailDescription' in p for p in initial_catalog['products']), worker['id']
    actions = collections.Counter(a['action'] for a in current['audit'] if a['threadId'] == worker['threadId'])
    notes = [a['arguments'].get('note') for a in current['audit'] if a['threadId'] == worker['threadId'] and a['action'] == 'basket_sync' and a.get('success') and a['arguments'].get('note')]
    metadata.append({'id': worker['id'], 'responseCycles': len(updates), 'actions': dict(actions), 'choiceNotes': notes, 'initialCatalogRecords': len(initial_catalog['products']), 'fullDescriptionCoverageVerified': True, 'tokenCounterUpdatesMatchCumulativeUsage': True, 'finalAgentMessages': final_messages})

assert all(w['status'] == 'PASS' and w['verification']['ok'] and w['endOfRunVerification']['ok'] for w in workers)
assert current['identicalPromptsExceptHandles']
assert current['sharedTaskPrompt'] == previous['sharedTaskPrompt'] == original['sharedTaskPrompt']
assert all(m['actions'].get('inspect') == 1 and not m['actions'].get('search_many') and not m['actions'].get('products') for m in metadata)
assert all(w['termination']['stopRequested'] and not w['termination']['finalAgentMessageProduced'] for w in workers)

actions = dict(collections.Counter(a['action'] for a in current['audit']))
phases = sorted(set(p for w in workers for p in w['timing']['phases']))
phase_means = {phase: statistics.mean(w['timing']['phases'].get(phase, {}).get('wallSeconds', 0) for w in workers) for phase in phases}
summed_tool_seconds = sum(w['timing']['browserToolSeconds'] for w in workers)
summed_worker_seconds = sum(w['seconds'] for w in workers)
internal_browser = {key: sum(w['timing']['internalBrowser'][key] for w in workers) for key in ['evaluations','navigations','clicksOrFills']}
restoration = load(current_dir / 'restoration-verification.json')
data = {'runId': current['runId'], 'wallSeconds': current['wallSeconds'], 'previousWallSpeedup': previous['wallSeconds'] / current['wallSeconds'], 'originalWallSpeedup': original['wallSeconds'] / current['wallSeconds'], 'tokens': current['tokenSummary'], 'actions': actions, 'meanHandoffSeconds': statistics.mean(w['handoffSeconds'] for w in workers), 'meanPhaseSeconds': phase_means, 'responseCycles': sum(m['responseCycles'] for m in metadata), 'workers': metadata, 'restorationPassed': restoration['ok'], 'methodology': 'One joint ablation changes discovery and removes final report generation. Phase annotations, basket sync, explicit verify and handoff remain separate. Expected interruption happens only after independent successful handoff. Token updates are checked against the final cumulative usage. Model reasoning text is not inspected. Restoration verification is outside measured agent work.'}
current_by_id = {w['id']: w for w in workers}
matched_original = [(w,current_by_id[w['id']]) for w in original['results'] if w['status'] == 'PASS']
matched_previous = [(w,current_by_id[w['id']]) for w in previous['results'] if w['status'] == 'PASS']
data['matchedSuccessfulWorkers'] = {
    label: {'count': len(pairs), 'baselineMeanSeconds': statistics.mean(a['seconds'] for a,b in pairs), 'newMeanSeconds': statistics.mean(b['seconds'] for a,b in pairs)}
    for label,pairs in [('original',matched_original),('previous',matched_previous)]
}
(current_dir / 'comparison.json').write_text(json.dumps(data, indent=2))

def action_count(report, names):
    return sum(a['action'] in names for a in report['audit'])

lines = ['# Luna xhigh: catalog reuse and no agent report', '',
    f"Six concurrent fresh contexts, two per shop; one session; `{current['model']}` with `{current['effort']}`. Run `{current['runId']}`. All six native baskets, handoffs, end-of-run checks and restored-session checks passed. The six prompts are identical except assigned handles, and the original isolation pre-prompt is unchanged.", '',
    '## Result', '',
    '| Metric | Browser-only baseline | Previous API tools | Catalog once, no report |',
    '| --- | ---: | ---: | ---: |',
    f"| Cohort wall time (s) | {original['wallSeconds']:.3f} | {previous['wallSeconds']:.3f} | {current['wallSeconds']:.3f} |",
    f"| Total tokens including cached input | {original['tokens']:,} | {previous['tokens']:,} | {current['tokens']:,} |",
    f"| Cached input | {original['tokenSummary']['cachedInput']:,} | {previous['tokenSummary']['cachedInput']:,} | {current['tokenSummary']['cachedInput']:,} |",
    f"| Uncached input + output | {original['tokenSummary']['totalExcludingCached']:,} | {previous['tokenSummary']['totalExcludingCached']:,} | {current['tokenSummary']['totalExcludingCached']:,} |",
    f"| Output including reasoning | {original['tokenSummary']['outputIncludingReasoning']:,} | {previous['tokenSummary']['outputIncludingReasoning']:,} | {current['tokenSummary']['outputIncludingReasoning']:,} |",
    f"| Reasoning output (subset) | {original['tokenSummary']['reasoningOutput']:,} | {previous['tokenSummary']['reasoningOutput']:,} | {current['tokenSummary']['reasoningOutput']:,} |",
    f"| Agent tool calls | {len(original['audit'])} | {len(previous['audit'])} | {len(current['audit'])} |",
    f"| Manual page interactions | {action_count(original, ['snapshot','click','fill','press'])} | {previous['commerceSummary']['manualPageInteractionCalls']} | {current['commerceSummary']['manualPageInteractionCalls']} |",
    f"| Search calls / detail calls | — | {action_count(previous, ['search_many'])} / {action_count(previous, ['products'])} | {actions.get('search_many', 0)} / {actions.get('products', 0)} |", '',
    f"Wall improvement is {data['previousWallSpeedup']:.2f}× over the previous API run and {data['originalWallSpeedup']:.2f}× over the browser-only baseline. Tokens excluding cache improved {previous['tokenSummary']['totalExcludingCached']/current['tokenSummary']['totalExcludingCached']:.2f}× and {original['tokenSummary']['totalExcludingCached']/current['tokenSummary']['totalExcludingCached']:.2f}× respectively. Including cache, improvements are {previous['tokens']/current['tokens']:.2f}× and {original['tokens']/current['tokens']:.2f}×.", '',
    'The browser-only baseline includes two 600-second timeouts. The previous API cohort produced six verified carts but one strict PARTIAL final report; its published strict grade was 5 PASS / 1 FAIL. This run grades verified task completion at handoff and deliberately has no final report grade. These are whole-run observations, not a controlled attribution of the independent effect of each change.', '',
    f"For the four workers that completed the original baseline, mean turn time fell from {data['matchedSuccessfulWorkers']['original']['baselineMeanSeconds']:.3f}s to {data['matchedSuccessfulWorkers']['original']['newMeanSeconds']:.3f}s: {data['matchedSuccessfulWorkers']['original']['baselineMeanSeconds']/data['matchedSuccessfulWorkers']['original']['newMeanSeconds']:.2f}×. This comparison excludes the baseline timeouts. For the five strict PASS workers from the previous API run, the matched mean improved {data['matchedSuccessfulWorkers']['previous']['baselineMeanSeconds']/data['matchedSuccessfulWorkers']['previous']['newMeanSeconds']:.2f}× ({data['matchedSuccessfulWorkers']['previous']['baselineMeanSeconds']:.3f}s to {data['matchedSuccessfulWorkers']['previous']['newMeanSeconds']:.3f}s).", '',
    '## Changes and controls', '',
    '- Initial inspection includes full available descriptions, category counts, attribute coverage, complete-inventory coverage and the basket revision. Agents choose their own products; the controller supplies no predetermined candidates.',
    '- Local search and redundant detail-fetch actions are omitted from the agent schema and rejected by the broker. Complete coverage makes absent product types a substitution decision; missing color or size remains unknown. Incomplete coverage can still require the assigned browser.',
    '- The controller interrupts a turn after successful verified handoff. This avoids any agent-generated final report. Expected interrupted turns are graded against independent basket evidence and handoff, with token accounting and model/isolation checks still required.',
    '- The same vague shopping request, Luna xhigh, six simultaneous contexts, isolation pre-prompt, phase annotations, separate basket synchronization, explicit verification and separate handoff are retained. Product rationale is captured only as a brief basket-tool note, as requested by the shopping prompt.',
    '- No platform source, configuration, products or prices are changed. No purchases or checkout writes are made. The original browsers and the new handed-off browsers remain live.', '',
    'Three preflights initially failed: two network-idle navigation timeouts (Magento, then WooCommerce), followed by a 20-second Magento catalog API timeout. All three homepages returned HTTP 200 in separate document-readiness checks, and server logs showed the delayed catalog requests eventually returned HTTP 200. The harness therefore uses domcontentloaded plus explicit cart-input readiness, rather than networkidle; navigation and explicit API requests are bounded at 60 seconds. These are additional reliability changes, and changed loading conditions limit timing attribution. The failed preflights did not launch model workers and are excluded from the measured cohort.', '',
    '## Per-agent measurements', '',
    '| Agent | Turn status | Turn seconds | Handoff seconds | Tokens excl. cache | Cached input | Output incl. reasoning | Tool seconds | Tools / failures | Model responses |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
for w, m in zip(workers, metadata):
    lines.append(f"| {w['id']} | {w['turnStatus']} | {w['seconds']:.3f} | {w['handoffSeconds']:.3f} | {w['tokens']['totalExcludingCached']:,} | {w['tokens']['cachedInput']:,} | {w['tokens']['outputIncludingReasoning']:,} | {w['timing']['browserToolSeconds']:.3f} | {w['timing']['toolCalls']} / {w['timing']['failedToolCalls']} | {m['responseCycles']} |")
lines += ['', 'Each worker received exactly one initial catalog inspection; no search or detail actions were called. There are zero final agent messages and no detailed-report response schemas or artifacts. Token counter updates sum to the final cumulative counters for every thread. Interrupted turn status is the intentional controller cutoff, after the independently verified cart and revoked browser access.', '',
    '## Where measured time went', '', '| Phase | Mean seconds per agent |', '| --- | ---: |']
for p, seconds in phase_means.items():
    lines.append(f'| {p} | {seconds:.3f} |')
lines += ['', f"Mean handoff time: {data['meanHandoffSeconds']:.3f}s. Assigned-tool execution: {sum(w['timing']['browserToolSeconds'] for w in workers):.3f}s summed, or {statistics.mean(w['timing']['browserToolSeconds'] for w in workers):.3f}s per worker. Phases partition agent time, not concurrent cohort wall time. turn_finalization is controller interruption/protocol completion, not a reporting step. Outside-tool time includes model work, transport, scheduling and orchestration; it is not measured pure reasoning time.", '',
    f"Mean time before the basket stage (orientation + discovery + comparison) fell from {statistics.mean(sum(w['timing']['phases'].get(p,{}).get('wallSeconds',0) for p in ['orientation','discovery','comparison']) for w in previous['results']):.3f}s to {sum(phase_means.get(p,0) for p in ['orientation','discovery','comparison']):.3f}s. The aggregate avoids overstating the individual discovery phase, because workers mark phase boundaries and some catalog reading now appears in orientation. The previous 82.889-second average reporting phase is entirely removed; the new average protocol finalization is {phase_means.get('turn_finalization',0):.3f}s.", '',
    '## Products and brief choice explanations', '']
for w, m in zip(workers, metadata):
    lines += [f"### {w['id']}", '', '| Product | SKU | Quantity | Unit price |', '| --- | --- | ---: | ---: |']
    for p in w['verification']['items']:
        lines.append(f"| {p['name']} | {p['sku']} | {p['quantity']} | {p['unitPrice']:.2f} |")
    lines += ['', ' '.join(m['choiceNotes']) or 'No choice note was supplied.', '', f"Verified native cart: {w['url']}. Screenshot: [{w['id']}]({w['screenshot']}).", '']
lines += ['## Operation accounting and restored sessions', '',
    f"Actions: `{json.dumps(actions, sort_keys=True)}`. Explicit agent API requests: {current['commerceSummary']['apiRequests']}; HTTP write requests: {current['commerceSummary']['apiWriteRequests']}; native product mutations: {current['commerceSummary']['nativeMutationOperations']}. Automatic browser asset/network requests are excluded. Manual page interaction calls use the same snapshot/click/fill/press unit as prior runs. Internal helper browser work: `{json.dumps(internal_browser)}`; this is separate from manual agent page interactions.", '',
    f"Assigned tools occupied {100*summed_tool_seconds/summed_worker_seconds:.2f}% of summed agent turn time. In the previous API run, all assigned tools together took {sum(w['timing']['browserToolSeconds'] for w in previous['results']):.3f}s. New explicit API requests alone took {sum(w['timing']['apiSeconds'] for w in workers):.3f}s summed across workers. These measurements allow environmental/API delays to be distinguished from model and protocol overhead; concurrency means summed durations are not cohort wall time.", '',
    f"All six saved sessions were restored independently and verified against their native API and rendered cart. Distinct cookie jars per shop: `{json.dumps(restoration['distinctSessions'])}`. These post-run reads are excluded from measured agent time and API counts. Only the temporary restoration browser was closed; original handoff contexts remain live.", '',
    '## Reproduction and evidence', '',
    '```sh', 'cd experiments/agent-browser', 'npm test', 'node commerce-smoke.mjs --catalog-once', 'node run.mjs --agents 2 --sessions 1 --task vague-commerce-task.json --commerce-tools --catalog-once --stop-at-handoff --timeout 600 --keep-open',
    f'node commerce-verify-run.mjs {current_dir}', f'python3 compare-catalog-once.py {current_dir}', '```', '',
    f'- [Controller report]({current_dir / "report.json"})',
    f'- [Comparison data]({current_dir / "comparison.json"})',
    f'- [Restoration verification]({current_dir / "restoration-verification.json"})',
    f'- [Archived harness]({current_dir / "harness-source/run.mjs"})',
    f'- [Previous API run]({previous_dir / "report.json"})',
    f'- [Original browser-only run]({original_dir / "report.json"})', '']
text = '\n'.join(lines)
report_path = ROOT / 'experiments/agent-browser/LUNA_CATALOG_ONCE_REPORT_2026-10-05.md'
report_path.write_text(text)
(current_dir / 'comparison.md').write_text(text)
print(json.dumps({'report': str(report_path), **{key: data[key] for key in ['wallSeconds','previousWallSpeedup','originalWallSpeedup','tokens','actions','meanHandoffSeconds','meanPhaseSeconds','responseCycles']}}, indent=2))
