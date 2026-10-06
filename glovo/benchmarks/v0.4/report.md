Four new gpt-6-luna xhigh agents ran sequentially: two UI only, then two with adapter 0.4.0. Each opened the McDonald’s Kraków page, added the same four products, photographed and verified the native basket, and cleaned it. All began with an empty basket. Coordinator preparation and restoration are excluded from agent telemetry.

| Run | Condition | Score | Runtime | Total tokens including cache | Uncached input + output | Tool calls |
|---|---|---:|---:|---:|---:|---:|
| 1 | UI only | 6/6 | 10m31s | 4,940,595 | 167,219 | 69 |
| 2 | UI only | 6/6 | 11m47s | 4,496,429 | 140,589 | 60 |
| 3 | Adapter v0.4 | 6/6 | 1m38s | 770,275 | 74,211 | 15 |
| 4 | Adapter v0.4 | 6/6 | 4m40s | 822,456 | 38,840 | 18 |

| Condition averages | Original | Rerun | Reduction |
|---|---:|---:|---:|
| UI only: runtime | 14m25s | 11m09s | 22.7% |
| UI only: total tokens | 6,691,140 | 4,718,512 | 29.5% |
| UI only: uncached input + output | 190,020 | 153,904 | 19.0% |
| UI only: tool calls | 83.5 | 64.5 | 22.8% |
| Adapter 0.3 → 0.4: runtime | 4m28s | 3m09s | 29.5% |
| Adapter 0.3 → 0.4: total tokens | 2,192,205 | 796,366 | 63.7% |
| Adapter 0.3 → 0.4: uncached input + output | 80,589 | 56,526 | 29.9% |
| Adapter 0.3 → 0.4: tool calls | 38.5 | 16.5 | 57.1% |

Within the rerun, the adapter used 71.7% less time and 63.3% fewer uncached input plus output tokens than UI only.

The original four runs all completed the same six rubric components (6/6); quality scores have been applied retrospectively to their documented results. Current scores are recorded in grading.json after coordinator inspection of native screenshots and final basket checks.

Runtime is the logged task_started to task_complete, including setup, model processing, tools, screenshot inspection, and report writing. Token counts come from final cumulative token_count.total_token_usage. Total tokens count repeated cached input; reasoning tokens are included in output. No coordinator tokens or time are added.

Limitations:

- Two runs per condition, sequential fixed order, same signed-in browser; descriptive, not a statistical benchmark.
- Original UI run 1 included an initial safeguard stop and basket preparation. New runs start empty; coordinator preparation is excluded.
- Version 0.4 includes updated documentation and CLI evidence/report workflow. This is a comparison of the whole agent experience.
- Current run 4 encountered slow tool execution, including a 23-second local guide read, and an empty initial accessibility snapshot. All logged waiting remains included.
- Total tokens include repeatedly cached context. Uncached input plus output is reported separately; reasoning is already included in output.

Run reports, screenshots, exported tool transcripts, measurements.json, results.csv, comparison.json, and config.json are saved beside this report. Previous results remain untouched under ../benchmark/.

After the runs, the coordinator restored the original Big Mac ×1 with no customizations. restoration-evidence.json and restored-original-basket.png verify it. Chrome retains adapter 0.4.0 with its panel collapsed at the left.
