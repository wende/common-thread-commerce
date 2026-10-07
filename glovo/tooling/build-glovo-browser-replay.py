#!/usr/bin/env python3
"""Index actual Glovo browser captures with an explicitly illustrative clock."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/glovo-race'
native = json.loads((OUT / 'native-capture.json').read_text())
baseline = [{k: s[k] for k in ['index', 'at', 'label', 'cart', 'options', 'image']}
            for s in native['baseline']]
adapter_stages = [
    (0, 'Start with an empty basket', []),
    (14, 'Search all four products through the adapter', []),
    (26, 'Read the actual product matches and options', []),
    (38, 'Prepare the batch with small shake and SUP cup', []),
    (47, 'Add all four items in one native batch', [0, 1, 2, 3]),
    (58, 'Verify all four native basket items', [0, 1, 2, 3]),
]
adapter = [dict(index=i, at=at, label=label, cart=cart, options=[],
                image=f'real-steps/adapter-{i:02d}.jpg')
           for i, (at, label, cart) in enumerate(adapter_stages)]
lanes = [dict(key='bare', title='Without adapter', elapsed=254, steps=baseline),
         dict(key='adapter', title='With adapter', elapsed=58, steps=adapter)]
for lane in lanes:
    for step in lane['steps']:
        path = OUT / step['image']
        step.update(captureType='actual browser screenshot',
                    capturedAt=datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
                    sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    assert lane['steps'][-1]['cart'] == [0, 1, 2, 3]
    assert lane['steps'][-1]['at'] == lane['elapsed']

verification = {}
for key in ['baseline', 'adapter']:
    evidence = json.loads((OUT / f'{key}-evidence.json').read_text())['verification']
    assert evidence['nativeMatchesStructured']
    assert evidence['basket']['itemCount'] == 4
    assert all(p['quantity'] == 1 for p in evidence['basket']['products'])
    verification[key] = dict(nativeMatchesStructured=True,
                             total=evidence['basket']['total'],
                             products=[dict(name=p['name'], quantity=p['quantity'],
                                            customizations=p['customizations'])
                                       for p in evidence['basket']['products']])
data = dict(title='Luna task · Glovo browser replay', kind='browser-capture',
            captureDate='2026-10-06', captureOperator='Codex', playbackSpeed=10,
            benchmarkModel='gpt-6-luna', benchmarkDate='2026-10-05',
            adapter='0.4.2', lanes=lanes, basketVerification=verification,
            benchmarkMeans=dict(bare=292.7, adapter=81.6),
            measuredReductionPercent=72.1,
            source='glovo/reports/EXPERIMENT_REPORT_2026-10-05.md',
            disclosure='REAL BROWSER CAPTURES. Codex replayed the Luna benchmark task on the actual glovoapp.com Chrome page on 6 October 2026: native menu navigation and clicks without the adapter, then real adapter search and native basket writes via Kimi WebBridge. These are newly captured browser screenshots, not the original Luna session recording. All replay timings, including the 254s and 58s endpoints, are illustrative. The 72.1% reduction refers to the original full-task benchmark means of 292.7s and 81.6s, which include cleanup and reporting. This shortened replay ends with both four-item baskets full and omits cleanup. The final captures use Chrome’s normal 90% zoom to show all four basket rows. The real basket remains full; no checkout was submitted.')
(OUT / 'data.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
native.update(kind=data['kind'], baseline=baseline, adapter=adapter,
              adapterStatus='Complete; native basket verified', basketVerification=verification,
              timing=data['disclosure'])
(OUT / 'native-capture.json').write_text(json.dumps(native, ensure_ascii=False, indent=2) + '\n')
print('Indexed 18 actual browser captures; both native baskets verified.')
