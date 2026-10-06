# Page shopping benchmark accounting

The shipped tool is [one page script](../../shopping-agent/shop-agent.js). This directory only measures experiment logs offline. It does not supply commerce tools, product IDs, catalog answers, or a broker to agents.

## Primary token metric

Use **`task_work_tokens_estimate`**:

```
shopping request text, counted once
+ each observed tool response's text, counted once
+ provider-generated output tokens, including reasoning
```

This excludes inherited system/developer messages, tool definitions, browser-session/isolation instructions, transport envelopes, and replayed conversation history. It is independent of input caching. Repeated browser reads count again because they are repeated work. A generated browser command already belongs to output tokens; it is not added again. Reasoning is a subset of output, not an additional charge. Tool response truncation counts what the agent received, not the original unseen content.

**This is a task-work estimate, not a billed-token total.** Text uses the pinned `o200k_base` tokenizer; exact GPT-6 model/protocol tokenization is not claimed. Actual model requests repeatedly consume prior context; this metric deliberately counts each newly supplied observation once. Provider input/cached/output totals remain in `provider_usage_including_environment` for audit, not as the score. Do not use “subtract the first 30k” or uncached-provider totals as task efficiency.

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

## Next experiment setup

Use [task.txt](task.txt) unchanged for both agents, plus the user's exact [isolation.txt](isolation.txt) and the assigned browser handle. Supply the normal browser tool interface. Do not add an opening `snapshot` instruction, CLI walkthrough, batching hint, adapter documentation, recommendation wording, permission to substitute, or a detailed report assignment. The treatment learns about `window.mcp` from the page; the control sees the ordinary page.

The coordinator creates two separate browser contexts, opens the same store, and injects the single script in the treatment only. Record the script SHA, exact prompt, model/effort, browser configuration, context identity, and initial basket. Use a finite idle timeout; keep successful handoff contexts until the user is done. Cleanup targets only coordinator-created test sessions, never global close/kill commands. No platform source modifications are needed.

Record elapsed time and browser interactions alongside task-work tokens. One executed Playwright script is one interaction even if it contains several page actions; adapter HTTP requests are a separate count. Tool-call count is also separate: an execution tool can run multiple browser commands. Do not infer executed commands merely from shell text when `&&` can skip a later command.

Evaluate the three requested needs separately. An unrelated accessory does not satisfy a mug request. Absence/uncertainty should be reported honestly; unspecified fit must not be invented. Preserve the native cart for handoff and stop before purchase. A shorter run with incorrect items is not a success. These fixtures have no mug and have weak colour/fit metadata, and only four originals are discounted; report those limitations. This update does not claim to make the fixture representative of all real stores.

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
