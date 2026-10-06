# Prompt and measurement audit — October 6, 2026

This is a retrospective correction, not another experiment. No adapter changes or agent reruns were made for this audit.

## The task was changed

The coordinator expanded the user's vague request for a red-ish tee, coffee mug, and winter deal into “pick three things you'd recommend,” authorized alternatives, and told agents to make a recommendation rather than clarify. These additions changed the decision problem. Beanies and sunglasses do not meet the coffee-drinking need. Earlier statements that both agents fully completed the intended shopping task are withdrawn. Cart operations succeeded; task satisfaction was not established.

The full prompt also prescribed the opening browser command, listed ordinary browsing and JavaScript commands, encouraged batching, forbade script files, explained coordinator setup, and steered the final response. Only the assigned browser handle and the user's explicit isolation instruction were needed as experiment-specific operational context. Standard tool documentation should live in the browser tool interface. Because both arms received the same additions, these runs do not isolate their causal effect on the adapter/control difference.

## What the adapter actually improved

For Sol 6.1 Medium: 94.888 vs 174.376 seconds, 16 vs 42 executed browser commands, and 1 vs 14 document navigations. These observations remain valid for the altered task. They are not proof of a correctly completed shopping mission or a repeatable mean speedup.

The adapter agent still made 13 top-level tool calls. Observed tool-call waiting totaled 20.985 seconds; 73.903 seconds lay outside those intervals. That remainder includes generation and scheduling/other overhead, not solely reasoning. Its first cart-add call came 78.574 seconds after task start.

The interface mostly exposes native retrieval and cart operations. It does not supply semantic matching for user needs or a reliable absence result for a product class. In the trace, “cup” returned caps. Sale plus category plus cup queries produced a 22,163-character JSON result, including 20 filler products. Later the agent paginated all 106 Accessories products in its own JavaScript loop. Result formatting and evidence gathering remained agent work.

It also hit two avoidable schema errors: top-level onSale instead of filters.onSale, and seven image-comparison IDs against a maximum of six. The run(callback) method invokes a callback against the existing API; the browser already allowed arbitrary page JavaScript. This addition improves discoverability but is not a new execution capability.

The fixture still offers an easy native shortcut: Prices drop returns only four original products. Burying the original products in category order did not make every discovery path a realistic 530-product relevance problem.

## Unequal cache conditions

| First recorded usage | Adapter | Bare page |
|---|---:|---:|
| Input tokens | 33,752 | 33,752 |
| Cached input tokens | 0 | 31,872 |
| Output tokens | 109 | 105 |
| Input minus cached input plus output | 33,861 | 1,985 |

Full-run tokens excluding cached input were 67,809 and 64,147. The arithmetic is correct, but “6% more” is not a fair measure of adapter efficiency: the initial cache difference alone is 31,872 tokens. Those initial inputs include the full agent environment, not merely the shopping prompt.

After subtracting each arm's first recorded usage, remaining tokens excluding cached input are 33,948 and 62,162. This is a diagnostic decomposition, not a replacement benchmark: subsequent cache conditions also differ. Full-run input/output usage including cached input was 677,217 versus 1,548,179; both cached and uncached components should remain visible in future reports.

## What a valid next comparison needs

Use the user's actual shopping request without invented recommendation/substitution instructions. Supply normal browser tools, the assigned handle and the explicitly required isolation instruction. The treatment discovers all adapter information on the page; no extra browser strategy coaching in either prompt.

Score each requested need separately, including correct handling of unavailable products. Unrelated cart additions do not count as fulfilling the missing need. Record speed alongside quality, not as a substitute for it. Use repeated pairs with balanced launch order/cache conditions, and a plausible catalog with useful product metadata; preserve the unsatisfiable-request case as a separately scored outcome.

Adapter improvements should remove inference round trips and return compact, relevant evidence by default: composable native filters, clear search coverage, reusable product references, useful attributes/options, discoverable images when needed, and concise cart outcomes. The adapter must not decide to replace a mug with another product class or fabricate missing attributes.

Evidence: output/playwright/sol-medium-20261006/coordinator/cache-audit.json, trace-a.json, trace-b.json, measurements.json, and the original source telemetry paths recorded there. The official evaluation guidance similarly calls for task-specific success criteria and calibrated outcome scoring: https://developers.openai.com/api/docs/guides/evaluation-best-practices
