# Page shopping benchmark accounting

The shipped tool is [one page script](../../shopping-agent/shop-agent.js). This directory only measures experiment logs offline. It does not supply commerce tools, product IDs, catalog answers, or a broker to agents.

## Primary token metric — includes cached input

Per the user's October 6 correction, use **`provider_total_tokens_including_cache`** for campaign comparisons:

```
provider input_tokens (including cached_input_tokens)
+ provider output_tokens (including reasoning)
= provider total_tokens
```

Cached input is a subset of input tokens. Do not subtract it, and do not add it a second time. Count each token at the same weight, including inherited instructions, tool schemas, replayed conversation, and multimodal inputs as reported by the provider. This is a provider-reported token count, not a dollar cost or a price-weighted cache calculation. Missing provider usage is unavailable, never zero. `provider_usage_including_environment` retains the input/cache/output breakdown. Each run must be scoped to its task turn.

The historical [optimization campaign](../../shopping-agent/WOO_LUNA_OPTIMIZATION_2026-10-06.md) rescored its existing baselines and treatment rounds under this definition; it did not rerun or discard them. Earlier reports used the following estimate as their primary metric and should be read as historical results under that earlier definition.

## Secondary task-work diagnostic

Retain **`task_work_tokens_estimate`** to diagnose observation and output verbosity:

```
shopping request text, counted once
+ each observed tool response's text, counted once
+ provider-generated output tokens, including reasoning
```

This excludes inherited system/developer messages, tool definitions, browser-session/isolation instructions, transport envelopes, and replayed conversation history. It is independent of input caching. Repeated browser reads count again because they are repeated work. A generated browser command already belongs to output tokens; it is not added again. Reasoning is a subset of output, not an additional charge. Tool response truncation counts what the agent received, not the original unseen content.

**This is a secondary task-work estimate, not the primary score or a billed-token total.** Text uses the pinned `o200k_base` tokenizer; exact GPT-6 model/protocol tokenization is not claimed. Actual model requests repeatedly consume prior context; this diagnostic deliberately counts each newly supplied observation once. Provider input/cached/output totals supply the primary score above and remain in `provider_usage_including_environment` for audit. Do not subtract inherited context or cached tokens from that score.

Image observations are counted, but their input-token cost is unavailable from these logs. When images occur, `image_input_tokens` is null and coverage says so. Never describe the text-plus-output estimate as a complete multimodal token count. Missing output telemetry yields an unavailable total, not zero. Incomplete turns are labelled incomplete. The collector cannot semantically determine whether a tool response was useful: every tool response in the selected task turn counts, including mistakes and retries.

```sh
python3 -m venv .runtime/shopping-metrics
.runtime/shopping-metrics/bin/pip install -r benchmarks/shopping/requirements.txt
.runtime/shopping-metrics/bin/python benchmarks/shopping/measure.py \
  --log /absolute/path/to/agent-rollout.jsonl \
  --task-prompt benchmarks/shopping/task.txt \
  --out output/shopping-metrics/agent.json

.runtime/shopping-metrics/bin/python -m unittest discover -s benchmarks/shopping -p 'test_*.py'
```

`--task-prompt` must contain the **exact shopping request actually used**. Do not apply the corrected prompt retrospectively to an old run. Multiple task turns require `--turn-id`; usage and tool observations are scoped to that turn. Prefer a fresh agent with no conversation-history fork for each arm.

## Current A/B/C experiment

The [real-catalog campaign](../../shopping-agent/WOO_LUNA_REAL_CATALOG_2026-10-06.md) runs 30 sessions: one bare A/B/C reference trio followed by nine adapter trios. Prompts request 6, 12 and 16 distinct items. All 530 records are plausible invented merchandise listings with reused sample illustrations and ordinary SKUs; no catalog exclusion or category/price/stock/local-match pruning is permitted. Native keyword search retains every native result. The catalog/order configuration and each prompt hash remain fixed through all rounds; valid alternatives are graded by features. Completed contexts close after evidence collection. The earlier named-filler experiment is historical and supplies no baseline for this one.

The coordinator [campaign_real.py](campaign_real.py) prepares isolated sessions, stores immutable task/script snapshots, collects provider telemetry and native cart evidence, grades disclosure separately, and closes only completed contexts. [report_real.py](report_real.py) renders every collected run from that ledger; [grade_real.py](grade_real.py) evaluates distinct product features offline. These files are coordinator tools, never agent shopping tools. Final integration checks are separate from the 30 measured sessions. The measured final revision is 0.5.8; the later 0.5.9 correction changes Magento full enumeration and was integration tested on all three stores.

## Historical six-item experiment setup

Use the historical [task-six-items.txt](task-six-items.txt) unchanged for both agents, plus the user's exact [isolation.txt](isolation.txt) and the assigned browser handle. Supply the normal browser tool interface. Do not add an opening `snapshot` instruction, CLI walkthrough, batching hint, adapter documentation, recommendation wording, permission to substitute, or a detailed report assignment. The treatment learns about `window.mcp` from the page; the control sees the ordinary page.

The coordinator creates two separate browser contexts, opens the same store, and injects the single script in the treatment only. Record the script SHA, exact prompt, model/effort, browser configuration, context identity, and initial basket. Use a finite idle timeout; keep successful handoff contexts until the user is done. Cleanup targets only coordinator-created test sessions, never global close/kill commands. No platform source modifications are needed.

Record elapsed time and browser interactions alongside provider total tokens including cache; retain task-work tokens only as a diagnostic. One executed Playwright script is one interaction even if it contains several page actions; adapter HTTP requests are a separate count. Tool-call count is also separate: an execution tool can run multiple browser commands. Do not infer executed commands merely from shell text when `&&` can skip a later command.

Evaluate each requested item separately. The current task preserves the red-ish T-shirt, coffee mug, and winter deal from the [three-need task](task-three-needs.txt), then adds Harbor Everyday Tee, a soft-collar cotton pique polo, and a smooth leather belt with a simple metal buckle. Verify feature matches and quantity one, preserve the native cart for handoff, and stop before purchase. A shorter run with incorrect items is not a success. This fixture has no mug or personal sizing information; report those limitations honestly rather than adding unrelated substitutes or claiming confirmed fit. Results for the six-item prompt are not a direct performance comparison with the earlier three-need prompt. That historical fixture had 500 explicitly named filler products and only four discounted originals, so it is not representative of every real store.

## Retrospective accounting check (Sol 6.1 Medium, October 6)

Same old logs and original prompt, new accounting; **no agents rerun**:

| Component | Adapter v0.2 | Bare page |
| --- | ---: | ---: |
| Shopping request text (estimated) | 108 | 108 |
| Observed tool text (estimated) | 21,262 | 41,994 |
| Generated output, including reasoning | 2,295 | 4,232 |
| **Task-work tokens (estimated)** | **23,665** | **46,334** |
| Observed image inputs (tokens unavailable) | 1 | 2 |
| Provider total including environment/replay/cache | 677,217 | 1,548,179 |

Evidence: `output/playwright/sol-medium-20261006/coordinator/task-measurements.json`, with source-log paths and original prompt hash. These runs used the earlier contaminated prompt and made invalid mug substitutions; this accounting correction does not rehabilitate their task-quality result. New v0.3 performance still needs a fresh paired run.
