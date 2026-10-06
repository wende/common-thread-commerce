"""Render the complete campaign ledger, including unsuccessful sessions, offline."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'output/playwright/woo-luna-real-catalog-20261006'
read=lambda p:json.loads(p.read_text())
s=read(BASE/'coordinator/state.json')
notes=read(BASE/'coordinator/revision-notes.json')
versions={x['round']:x['version'] for x in notes}
runs=[x for x in s['runs'] if x['status']=='complete']
ref={x['arm']:x for x in runs if x['round']==1}
lines=['## Results', '',f"Status: {s['phase']}; {len(runs)}/30 sessions collected. Every completed session is included below.", '',
'Only one bare reference session was run for each prompt. Later rounds use adaptive revisions, so ratios describe these observations; they are not confidence intervals or repeated trials of one fixed implementation. Cached tokens are included once in every primary total. The former named-filler result is excluded.', '',
'| Round | Version | A tokens | B tokens | C tokens | Mean seconds | Reference / trio tokens | Reference / trio time | Quality passes |',
'| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
for n in range(1,11):
 trio={x['arm']:x for x in runs if x['round']==n}
 if len(trio)!=3:continue
 total=sum(x['tokens'] for x in trio.values());ratio=sum(x['tokens'] for x in ref.values())/total
 seconds=sum(x['seconds'] for x in trio.values());time_ratio=sum(x['seconds'] for x in ref.values())/seconds
 lines.append(f"| {n} | {versions.get(n,'?')} | {trio['a']['tokens']:,} | {trio['b']['tokens']:,} | {trio['c']['tokens']:,} | {seconds/3:.2f} | {ratio:.2f}× | {time_ratio:.2f}× | {sum(bool(x['quality'].get('qualifies')) for x in trio.values())}/3 |")
adapter=[x for x in runs if x['condition']=='adapter']
if adapter:
 mean_tokens=sum(x['tokens'] for x in adapter)/len(adapter);mean_time=sum(x['seconds'] for x in adapter)/len(adapter)
 reference_tokens=sum(x['tokens'] for x in ref.values())/len(ref);reference_time=sum(x['seconds'] for x in ref.values())/len(ref)
 lines+=['',f"Across all {len(adapter)} adapter sessions, including quality failures: mean {mean_tokens:,.0f} tokens and {mean_time:.2f} seconds, versus {reference_tokens:,.0f} tokens and {reference_time:.2f} seconds for the three references ({reference_tokens/mean_tokens:.2f}× token and {reference_time/mean_time:.2f}× time ratios). {sum(bool(x['quality'].get('qualifies')) for x in adapter)}/{len(adapter)} adapter sessions passed; all three reference sessions passed."]
final={x['arm']:x for x in runs if x['round']==10}
if len(final)==3:
 lines+=['','## Final revision compared with reference','','Each row compares one fresh final-revision session with the single bare reference for that same prompt. These are descriptive observations, not estimates of a stable model-wide speedup.','','| Prompt | Bare tokens | Final tokens | Token ratio | Bare seconds | Final seconds | Time ratio | Final quality |','| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |']
 for arm in ['a','b','c']:
  b,f=ref[arm],final[arm]
  lines.append(f"| {arm.upper()} ({s['tasks'][arm]['needs']} needs) | {b['tokens']:,} | {f['tokens']:,} | {b['tokens']/f['tokens']:.2f}× | {b['seconds']:.2f} | {f['seconds']:.2f} | {b['seconds']/f['seconds']:.2f}× | {'Pass' if f['quality'].get('qualifies') else 'Fail'} |")
lines+=['','## Session accounting','','Input includes cached input. Uncached input is input minus cached input; output includes reasoning as reported. These are token counts, not dollar costs. Elapsed time is the worker turn duration. Browser interactions count actual executed CLI actions, including failures; model tool calls count tool invocations. Images are observed image records, not estimated image tokens.','','| Run | Uncached input | Cached input | Output | Total | Seconds | Browser actions | Model tool calls | Images | Quality |','| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |']
for x in runs:
 d=read(BASE/x['run']/'coordinator/report-data.json');m=d['metrics'];u=m['provider_usage_including_environment'];q=d['quality']
 lines.append(f"| {x['run']} | {u['input_tokens']-u['cached_input_tokens']:,} | {u['cached_input_tokens']:,} | {u['output_tokens']:,} | {x['tokens']:,} | {x['seconds']:.2f} | {d['browser_interactions']} | {m['tool_calls']} | {m['image_observations']} | {'Pass' if q.get('qualifies') else 'Fail'} ({q['matched_needs']}/{q['available_needs']} available) |")
lines+=['','## Revisions and observations','']
for x in notes:lines.append(f"- Round {x['round']} ({x['version']}): {x['change']} {x.get('evidence','')}".rstrip())
failed=[x for x in runs if not x['quality'].get('qualifies')]
if failed:
 lines+=['','## Failed quality checks','']
 for x in failed:
  flags=[k for k,v in x['quality'].items() if v is False]
  detail=' The selected Summit Mark Beanie does not establish the requested knit construction in its listing; the sample illustration does not resolve that evidence gap.' if x['run'] in ['r03c','r04c','r06c'] else ''
  lines.append(f"- {x['run']}: {', '.join(flags)}.{detail} Retained in token/time totals and session count.")
lines+=['','Native cart snapshots, final replies, executed browser commands, request URLs, screenshots, exact script/prompt hashes and individual metrics are preserved under `output/playwright/woo-luna-real-catalog-20261006/<run>/`. The offline evaluator accepts any correct distinct combination from the full catalog. Normal agent comparisons of returned records are allowed; the adapter never removes records or supplies a preset basket. Automated request checks reject category/price/stock/sale filtering, and public actions are reviewed for context/host shortcuts.']
if s['phase']=='complete':
 audit=read(BASE/'coordinator/final-invariants.json')
 lines+=['',f"Final audit: {audit['sessions']} sessions completed and closed; catalog and ordering unchanged; no orders created; Playwright browser inventory empty. Native product and tailnet asset verification also passed for all three stores."]
 lines+=['','## Final implementation verification','','The benchmark ended with immutable version 0.5.8 snapshots. A subsequent integration check found that Magento requires a GraphQL search or criteria argument even to enumerate all products. Shipped version 0.5.9 sends an empty native criteria object containing no category, price, stock, SKU or other product condition. It does not remove records. No benchmark agent was rerun or result rewritten after this correction.','','Version 0.5.9 passed 45 adapter contract tests and nine accounting tests. Independent integration contexts scanned 530 distinct records on every store, checked paging/cache and rejection of structured filters before networking, added three discovered products, replayed without duplication, and restored the original basket. WooCommerce and Magento listing reads retained all 24 unavailable products; PrestaShop listing stock stays unknown until fresh details. Two sample photos loaded on each platform. PrestaShop and Magento verified native cart markup from the starting page; WooCommerce reported unsupported markup there, while the 30 benchmark carts were separately checked after opening their rendered carts. All integration contexts closed.','','The 500 replacements are plausible invented demo listings with 18 reused sample illustrations. This does not measure a large, diverse real retailer catalog. Only one bare reference per prompt and one observation per adaptive revision were run; neither token ratios nor time ratios establish causality or a stable speedup. The best observed passing trio was round 8; the final trio used more tokens, so that variation must remain visible.']
p=ROOT/'shopping/reports/WOO_LUNA_REAL_CATALOG_2026-10-06.md';old=p.read_text();header=old.split('<!-- RESULTS -->')[0]
if 'Reference A finished' in header:header=header.split('Reference A finished')[0]
header=header.rstrip()+'\n\n<!-- RESULTS -->\n'
p.write_text(header+'\n'.join(lines)+'\n\nPrivate stores: [WooCommerce](https://krzysztofs-mac-studio.tail657ea.ts.net:18091/), [PrestaShop](https://krzysztofs-mac-studio.tail657ea.ts.net:18092/), [Magento](https://krzysztofs-mac-studio.tail657ea.ts.net:18093/).\n')
print(f'Report updated: {len(runs)}/30 sessions.')
