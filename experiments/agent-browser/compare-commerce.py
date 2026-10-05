"""Compile measured commerce-tool results against the retained browser-only cohort."""
import collections
import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NEW = Path(sys.argv[1]).resolve()
OLD = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else ROOT / 'output/playwright/agent-browser/2026-10-05T13-21-59.909Z-4ffa6cab'
new = json.loads((NEW / 'report.json').read_text())
old = json.loads((OLD / 'report.json').read_text())
restored = json.loads((NEW / 'restoration-verification.json').read_text())
assert new['sharedTaskPrompt'] == old['sharedTaskPrompt']
assert new['model'] == old['model'] == 'gpt-6-luna'
assert new['effort'] == old['effort'] == 'xhigh'
assert new['identicalPromptsExceptHandles'] and len(new['results']) == 6
assert restored['ok'] and all(r['ok'] for r in restored['results'])
rows = sorted(new['results'], key=lambda r: r['id'])
old_by_id = {r['id']: r for r in old['results']}
restored_by_id = {r['id']: r for r in restored['results']}

def interaction_count(report):
    return sum(r['action'] in ['snapshot', 'click', 'fill', 'press'] for r in report['audit'])

def verified_handoff(r):
    return bool(r.get('handedOver') and r.get('turnStatus') == 'completed' and r.get('verification', {}).get('ok'))

def fmt(n):
    return f'{n:,}' if isinstance(n, int) else f'{n:,.3f}'

def link(label, path):
    return f'[{label}]({path})'

def cell(value):
    return str(value).replace('|', '\\|').replace('\n', ' ')

def elapsed(r):
    return r['timing']['wallSeconds']

def delta(a, b):
    return f'{100 * (1 - b/a):.2f}% less' if a else 'n/a'

summary = {
    'baselineRun': old['runId'], 'newRun': new['runId'],
    'sameShoppingPrompt': True, 'model': new['model'], 'effort': new['effort'],
    'baseline': {'verifiedHandoffs': sum(verified_handoff(r) for r in old['results']), 'strictPasses': sum(r['status'] == 'PASS' for r in old['results']), 'wallSeconds': old['wallSeconds'], 'tokens': old['tokenSummary'], 'agentToolCalls': len(old['audit']), 'manualPageInteractionCalls': interaction_count(old)},
    'new': {'verifiedHandoffs': sum(verified_handoff(r) for r in rows), 'strictPasses': sum(r['status'] == 'PASS' for r in rows), 'agentReports': dict(collections.Counter(r['detailedReport']['status'] for r in rows)), 'restoredSessionsPassed': sum(r['ok'] for r in restored['results']), 'wallSeconds': new['wallSeconds'], 'tokens': new['tokenSummary'], **new['commerceSummary']},
    'strictGradeNote': 'The original raw report is unchanged: WooCommerce agent 2 is FAIL under the SUCCESS-only criterion because its report status is PARTIAL. Its three selected products, quantities, prices, handoff and restored basket all verify. The reportMatchesCart field also includes the SUCCESS status test, so its false value is not a product mismatch.',
    'measurementNote': 'One observed cohort per condition, two workers per platform. Baseline wall time includes two 600-second timeouts. No pure model-reasoning time or dollar cost is inferred.'
}
(NEW / 'comparison.json').write_text(json.dumps(summary, indent=2))

lines = [
    '# Luna xhigh rerun with commerce API tools — October 5, 2026', '',
    'All six Luna workers completed a verified three-product basket and handed over the browser. The original strict grader records five PASS and one FAIL: WooCommerce agent 2 used PARTIAL to describe the missing mug and unverified color, despite placing three alternatives. Its basket and reported selections matched in independent post-run verification. The raw benchmark report has been preserved.', '',
    'Two concurrent workers ran on each of WooCommerce, PrestaShop and Magento, with fresh isolated guest contexts. The model was gpt-6-luna with xhigh reasoning, no model substitution or rerouting, and a 600-second timeout. The vague shopping prompt and isolation pre-prompt were unchanged. Tool instructions and the tool surface changed to expose programmatic commerce operations.', '',
    'Platform source, configuration, plugins and catalog data were unchanged. All code changes are in the experiment harness. No order was placed. The six original browser contexts remain live for human handoff; worker access to both tools was revoked.', '',
    '## Comparison with the previous vague-prompt cohort', '',
    '| Measurement | Browser-only baseline | Commerce-tool rerun | Change |',
    '| --- | ---: | ---: | --- |'
]
metrics = [
    ('Verified completed handoffs', 4, 6, 'Both cohorts requested six baskets'),
    ('Strict SUCCESS-only grade', 4, 5, 'One new worker reported PARTIAL; see grading note'),
    ('Whole-run wall time (seconds)', old['wallSeconds'], new['wallSeconds'], delta(old['wallSeconds'], new['wallSeconds'])),
    ('Tokens excluding cached input', old['tokenSummary']['totalExcludingCached'], new['tokenSummary']['totalExcludingCached'], delta(old['tokenSummary']['totalExcludingCached'], new['tokenSummary']['totalExcludingCached'])),
    ('Uncached input tokens', old['tokenSummary']['uncachedInput'], new['tokenSummary']['uncachedInput'], delta(old['tokenSummary']['uncachedInput'], new['tokenSummary']['uncachedInput'])),
    ('Output tokens, including reasoning', old['tokenSummary']['outputIncludingReasoning'], new['tokenSummary']['outputIncludingReasoning'], delta(old['tokenSummary']['outputIncludingReasoning'], new['tokenSummary']['outputIncludingReasoning'])),
    ('Reasoning output tokens (subset of output)', old['tokenSummary']['reasoningOutput'], new['tokenSummary']['reasoningOutput'], delta(old['tokenSummary']['reasoningOutput'], new['tokenSummary']['reasoningOutput'])),
    ('Cached input tokens', old['tokenSummary']['cachedInput'], new['tokenSummary']['cachedInput'], delta(old['tokenSummary']['cachedInput'], new['tokenSummary']['cachedInput'])),
    ('Total tokens including cached input', old['tokenSummary']['totalIncludingCached'], new['tokenSummary']['totalIncludingCached'], delta(old['tokenSummary']['totalIncludingCached'], new['tokenSummary']['totalIncludingCached'])),
    ('Assigned tool calls, including phase annotations', len(old['audit']), len(new['audit']), delta(len(old['audit']), len(new['audit']))),
    ('Manual page interaction calls', interaction_count(old), interaction_count(new), delta(interaction_count(old), interaction_count(new))),
    ('Failed assigned-tool calls', sum(not r['success'] for r in old['audit']), sum(not r['success'] for r in new['audit']), 'New failures: three search limits and two ambiguous browser clicks')
]
for name, a, b, note in metrics:
    lines.append(f'| {name} | {fmt(a)} | {fmt(b)} | {note} |')
matched = [(old_by_id[r['id']], r) for r in rows if old_by_id[r['id']]['status'] == 'PASS']
before_mean = statistics.mean(elapsed(a) for a, b in matched)
after_mean = statistics.mean(elapsed(b) for a, b in matched)
lines += [
    '', f'The observed whole-run ratio is {old["wallSeconds"]/new["wallSeconds"]:.2f}×. The baseline includes two timeouts and incomplete baskets, so this ratio is not a uniform per-task speedup. Across the four worker IDs that passed the baseline, mean turn duration fell from {before_mean:.3f} to {after_mean:.3f} seconds ({delta(before_mean, after_mean)}). This remains one observation per worker, rather than a statistical performance estimate.', '',
    '“Tokens excluding cached input” means uncached input plus all output, including reasoning. Cached input is a subset of input, and reasoning is a subset of output; neither is added again. These are cumulative per-thread usage updates reported by Codex. No dollar cost is estimated.', '',
    '## What the workers received', '',
    'The same shopper request was sent to all six workers:', '', '```text', new['sharedTaskPrompt'], '```', '',
    'The isolation instruction was retained verbatim:', '', '```text', (ROOT / 'experiments/agent-browser/isolation.txt').read_text().strip(), '```', '',
    'Each worker received an opaque assigned context handle, assigned_shop, the existing assigned_browser fallback, and the same detailed response schema. Shell, global browser controls, external connectors, web search and delegation were disabled in the worker harness.', '',
    'assigned_shop offered inspect, search_many, products, basket_sync, verify, phase and handoff. inspect returned all 30 products from the assigned storefront API, a complete-coverage indicator, and a basket revision. Product records contained handles, SKU, names, URLs, prices and regular prices, discounts, availability/purchasability, categories, plain descriptions, image references and attributes. Color was explicitly unknown and size options were absent. Native IDs, form keys, nonces and cart IDs stayed inside the adapter.', '',
    'No recommendations or product choices were prefilled. The adapter did not read the seed catalog. The controller independently used that catalog to verify actual native cart names, stock, prices and quantities. API HTML descriptions and PrestaShop HTML fragments were normalized or discarded inside the helper, rather than returned as raw page HTML.', '',
    'search_many used local substring matching over the structured API catalog, requiring all query words. It did not call each platform’s native search. This matters for interpreting the results: “red” can match “tapered,” and sale status is a field rather than necessarily a word in the description. Workers identified several such false matches.', '',
    'basket_sync accepted all three selected products together, synchronized their desired quantities, preserved unrelated lines, checked the prior revision, and used an operation ID to avoid repeating writes. WooCommerce made one native batch write, PrestaShop made three serialized AJAX writes, and Magento seeded the browser basket then made a GraphQL batch write against that basket’s masked ID.', '',
    'The original prompts, exact tool arguments/results and final worker reports are retained in the run artifacts. The event log contains the structured objects supplied to workers; this note does not reproduce internal reasoning traces.', '',
    '## Per-worker measurements', '',
    '| Worker | Raw grade / agent report | Verified handoff | Turn seconds | Handoff seconds | Report generation after handoff (s) | Tokens excluding cache | Cached input | Total including cache |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |'
]
for r in rows:
    lines.append(f"| {r['id']} | {r['status']} / {r['detailedReport']['status']} | Yes | {r['seconds']:.3f} | {r['handoffSeconds']:.3f} | {r['seconds']-r['handoffSeconds']:.3f} | {r['tokens']['totalExcludingCached']:,} | {r['tokens']['cachedInput']:,} | {r['tokens']['totalIncludingCached']:,} |")
lines += ['', '| Worker | Uncached input | Output incl. reasoning | Reasoning subset | Assigned tool calls | Tool seconds | API requests | HTTP writes | Native mutation operations | Manual page calls | Failed tools |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
for r in rows:
    t=r['timing']; k=r['tokens']
    lines.append(f"| {r['id']} | {k['uncachedInput']:,} | {k['outputIncludingReasoning']:,} | {k['reasoningOutput']:,} | {t['toolCalls']} | {t['browserToolSeconds']:.3f} | {t['apiRequests']} | {t['apiWriteRequests']} | {t['nativeMutationOperations']} | {t['manualPageInteractions']} | {t['failedToolCalls']} |")
lines += ['', '| Worker | Total including context/thread setup (s) | Context/thread setup (s) | Summed explicit API seconds | Internal evaluations | Internal navigations |', '| --- | ---: | ---: | ---: | ---: | ---: |']
for r in rows:
    t=r['timing']
    lines.append(f"| {r['id']} | {r['totalSeconds']:.3f} | {r['totalSeconds']-r['seconds']:.3f} | {t['apiSeconds']:.3f} | {t['internalBrowser']['evaluations']} | {t['internalBrowser']['navigations']} |")
lines += [
    '', 'The six model turns made 80 assigned-tool calls: 73 commerce calls and 7 browser fallback calls. Of the commerce calls, 24 were phase annotations, 6 inspections, 18 batched searches, 7 product-detail requests, 6 basket synchronizations, 6 verifications and 6 handoffs. All browser fallback calls came from PrestaShop agent 1: one snapshot and six click attempts, including two ambiguous-link failures. Five workers needed no manual page interaction.', '',
    'There were 58 explicit API requests, including 12 HTTP write requests and 18 native product mutation suboperations. All recorded HTTP responses were 200 or the expected WooCommerce batch 207. HTTP POST GraphQL queries count as reads. Automatic storefront requests and asset traffic are excluded.', '',
    'One assigned-tool call can issue several HTTP requests. A native batch can contain several mutation suboperations. These are separate units. Manual page calls use the previous snapshot/click/fill/press definition; they do not include phase annotations or handoff helpers. Native helpers still did internal browser work: 10 page evaluations and 6 navigations across the six workers, in addition to DOM verification, waits and screenshots. Zero manual calls does not mean zero browser work.', '',
    'The independent post-run restoration check made '+str(sum(r['apiRequests'] for r in restored['results']))+' additional read requests. These are excluded from the measured agent turns and their 58-request total. All six restored contexts passed API and UI checks; the paired cookie jars were distinct on every shop. The original six contexts remained live throughout.', '',
    '## What was selected', '',
    '| Worker | Products, one of each | Merchandise subtotal (USD) | Latest observed total after restoration (USD) |',
    '| --- | --- | ---: | ---: |'
]
for r in rows:
    cart=restored_by_id[r['id']]['api']['basket']
    lines.append(f"| {r['id']} | {'; '.join(i['name'] for i in r['verification']['items'])} | ${r['verification']['merchandiseSubtotal']:.2f} | ${cart['totalObserved']:.2f} |")
lines += [
    '', 'The worker pairs made different choices on PrestaShop and Magento. The WooCommerce pair made the same selection. Every reported selection matched the restored native basket’s name, quantity and unit price, including the PARTIAL report. Shipping totals are observed estimates and can depend on frontend recalculation, address and method.', '',
    '## Time spent and difficulties', '',
    f"Mean handoff time was {statistics.mean(r['handoffSeconds'] for r in rows):.3f} seconds. Detailed reporting after handoff averaged {statistics.mean(r['seconds']-r['handoffSeconds'] for r in rows):.3f} seconds. Assigned-tool execution totaled {sum(r['timing']['browserToolSeconds'] for r in rows):.3f} seconds across all workers; most measured time was outside those tools. That includes model generation, transport, scheduling and orchestration, and does not isolate pure reasoning time.", '',
    'Reporting was the largest measured phase for four workers; comparison was largest for Magento agent 1 and PrestaShop agent 1. Detailed reports therefore account for a substantial part of completion time even after browser work has been reduced.', ''
]
for r in rows:
    lines += [f"### {r['id']}", '', '| Phase | Wall seconds | Assigned-tool seconds | Calls | Failures |', '| --- | ---: | ---: | ---: | ---: |']
    for phase,t in r['timing']['phases'].items():
        lines.append(f"| {phase} | {t['wallSeconds']:.3f} | {t['browserToolSeconds']:.3f} | {t['calls']} | {t['failures']} |")
    lines += ['', 'Worker-reported difficulties:','']
    for issue in r['detailedReport']['difficulties']:
        lines += [f"- **{cell(issue['issue'])}** Impact: {cell(issue['impact'])} Resolution: {cell(issue['resolution'])}"]
    lines += ['', link('Full detailed agent report', NEW/(r['id']+'.agent-report.md')), '']
lines += [
    '## Interpretation and limits', '',
    'The native adapters completed all basket writes and verification without manual add-to-cart operations. The browser fallback was used only by one worker while investigating incomplete product attributes. The token reduction is concentrated in input and cached history; output fell much less because the same detailed reporting task remained.', '',
    'The experiment does not establish a confirmed red tee or personal fit. No mug appears in the complete 30-product catalog. Workers disclosed these gaps and substituted apparel/accessories. Such alternatives meet the test’s instruction to choose three available recommendations, but a cap or extra warm layer does not function as a coffee vessel. Basket correctness is independently verified; recommendation quality remains a separate assessment.', '',
    'Three workers exceeded the ten-query search limit and recovered by splitting their requests. The ten-query cap adds friction for this cheap local search and should be reconsidered. Matching query terms as substrings also causes false positives; token-aware matching and explicit attribute/sale filters would be better. These are findings from this run, not changes applied during measurement.', '',
    'The raw strict report is FAIL because it requires a SUCCESS report status. WooCommerce agent 2 returned PARTIAL for unresolved user preferences despite a verified alternative basket. Its reportMatchesCart field is false because that predicate combines status and item matching. The separate restoration check establishes that its actual names, quantities and prices matched. Both facts are retained; the worker’s statement is not rewritten and the original grade is not silently changed.', '',
    'These are one-cohort observations, with only two workers per shop. The changed tool surface, more complete discovery and model variability all affect the comparison. There is no statistical claim or separately measured pure model-decision time. The adapters currently support simple products and positive quantities; variants, login/cart merging and checkout are not exercised.', '',
    '## Reproduction and artifacts', '',
    '```sh', 'cd /Users/wende/projects/shopping-assistant/experiments/agent-browser', 'npm test', 'node commerce-smoke.mjs', 'node run.mjs --agents 2 --sessions 1 --task vague-commerce-task.json --commerce-tools --timeout 600 --keep-open', '```', '',
    'The 13 unit checks passed, then six deterministic adapter sessions passed before launching Luna. The original benchmark source used for the model run is archived in its harness-source directory.', '',
    '- '+link('Raw new report JSON', NEW/'report.json'),
    '- '+link('Machine-readable comparison', NEW/'comparison.json'),
    '- '+link('Independent restored-session verification', NEW/'restoration-verification.json'),
    '- '+link('Exact tool inputs and outputs', NEW/'events.jsonl'),
    '- '+link('Model capabilities', NEW/'model.json'),
    '- '+link('Archived runner source', NEW/'harness-source/run.mjs'),
    '- '+link('Archived commerce adapter', NEW/'harness-source/commerce-adapter.mjs'),
    '- '+link('Archived commerce broker', NEW/'harness-source/commerce-broker.mjs'),
    '- '+link('Baseline raw report', OLD/'report.json'),
    '- '+link('Prior full session report', ROOT/'experiments/agent-browser/SESSION_REPORT_2026-10-05.md'),
    '- '+link('API research and design', ROOT/'experiments/agent-browser/PAGE_API_RESEARCH_2026-10-05.md'), '',
    '## Assigned-tool call ledger', '',
    '| # | Worker | Tool | Action | Duration (s) | Outcome | Input / error |', '| ---: | --- | --- | --- | ---: | --- | --- |'
]
ids={r['threadId']:r['id'] for r in rows}
for n,call in enumerate(new['audit'],1):
    args=call.get('arguments', {})
    description=call.get('error') or (json.dumps(args.get('queries')) if args.get('queries') else args.get('phase') or call.get('name') or (f"{len(args['items'])} desired products" if args.get('items') else f"{len(args['products'])} product handles" if args.get('products') else ''))
    lines.append(f"| {n} | {ids.get(call['threadId'],call['threadId'])} | {call.get('tool','assigned_browser')} | {call['action']} | {call['durationMs']/1000:.3f} | {'OK' if call['success'] else 'Error'} | {cell(description)} |")
lines += ['', '## Explicit API request ledger', '', '| # | Worker | Method | Endpoint path | Operation | HTTP status | Response bytes | Seconds | Native mutation suboperations |', '| ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: |']
api_entries=sorted([(r['id'],call) for r in rows for call in r['apiAudit']],key=lambda pair:pair[1]['startedAt'])
for n,(worker,call) in enumerate(api_entries,1):
    lines.append(f"| {n} | {worker} | {call['method']} | {call['path']} | {call['operation']} | {call['status']} | {call['bytes']:,} | {call['seconds']:.3f} | {call['nativeOperations']} |")
lines += ['', '## Handoff screenshots', '']
for worker in ['woocommerce-session-1-agent-2','prestashop-session-1-agent-1','magento-session-1-agent-1']:
    lines += [f'**{worker}**', '', f'![{worker}: verified three-product cart]({NEW/(worker+".png")})', '']
lines += ['Other screenshots: '+', '.join(link(r['id'],NEW/(r['id']+'.png')) for r in rows if r['id'] not in ['woocommerce-session-1-agent-2','prestashop-session-1-agent-1','magento-session-1-agent-1'])+'.', '']
text='\n'.join(lines)
(NEW/'comparison.md').write_text(text)
copy=ROOT/'experiments/agent-browser/LUNA_COMMERCE_TOOL_REPORT_2026-10-05.md'
copy.write_text(text)
print(json.dumps({'report':str(copy),'runReport':str(NEW/'comparison.md'),'summary':summary},indent=2))
