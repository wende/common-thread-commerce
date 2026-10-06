"""Extract observable tool activity, without reasoning or image payloads."""
import json
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
MEASUREMENTS = json.loads((HERE / "measurements.json").read_text())
SESSIONS = Path.home() / ".codex/sessions/2026/10/05"


def seconds(start, end):
    return (datetime.fromisoformat(end.replace("Z", "+00:00")) -
            datetime.fromisoformat(start.replace("Z", "+00:00"))).total_seconds()


def output_text(output):
    if isinstance(output, str):
        return output
    if isinstance(output, list):
        return "\n".join(item.get("text", "") for item in output
                         if isinstance(item, dict) and "text" in item)
    return ""


summaries = []
for run in MEASUREMENTS["runs"]:
    source = next(SESSIONS.glob(f"*{run['threadId']}.jsonl"))
    records = [(line, json.loads(raw)) for line, raw in enumerate(source.open(), 1)]
    outputs = {record["payload"]["call_id"]: (line, record)
               for line, record in records
               if record["type"] == "response_item"
               and record["payload"].get("type") in
               ["custom_tool_call_output", "function_call_output"]}
    calls = []
    previous_end = run["startedAt"]
    for line, record in records:
        payload = record.get("payload", {})
        if record["type"] != "response_item" or payload.get("type") not in ["custom_tool_call", "function_call"]:
            continue
        result = outputs.get(payload["call_id"])
        end = result[1]["timestamp"] if result else None
        # Coordination message contents are not necessary for operation timing.
        command = payload.get("input")
        if command is None:
            command = "[coordination call arguments omitted]" if payload.get("namespace") == "collaboration" or payload["name"] == "send_message" else payload.get("arguments", "")
        text = output_text(result[1]["payload"].get("output")) if result else ""
        calls.append({
            "index": len(calls) + 1,
            "sourceLine": line,
            "outputSourceLine": result[0] if result else None,
            "callId": payload["call_id"],
            "tool": ".".join(filter(None, [payload.get("namespace"), payload["name"]])),
            "startedAt": record["timestamp"],
            "completedAt": end,
            "durationSeconds": seconds(record["timestamp"], end) if end else None,
            "precedingGapSeconds": seconds(previous_end, record["timestamp"]),
            "input": command,
            "output": text,
            "outputCharacters": len(text),
        })
        if end:
            previous_end = end
    # token_usage_record is one model response, unlike duplicate event token_count.
    responses = [{"timestamp": record["timestamp"], "usage": record["payload"]["usage"]}
                 for _, record in records if record["type"] == "token_usage_record"]
    tool_seconds = sum(call["durationSeconds"] or 0 for call in calls)
    summary = {
        "run": run["run"], "source": str(source), "threadId": run["threadId"],
        "startedAt": run["startedAt"], "completedAt": run["completedAt"],
        "elapsedSeconds": run["elapsedSeconds"],
        "toolCalls": len(calls), "modelResponses": len(responses),
        "observedToolWaitSeconds": round(tool_seconds, 3),
        "outsideToolWaitSeconds": round(run["elapsedSeconds"] - tool_seconds, 3),
        "textOutputCharacters": sum(call["outputCharacters"] for call in calls),
        "usage": run["usage"],
    }
    summaries.append(summary)
    data = {"summary": summary, "calls": calls, "modelResponses": responses}
    (HERE / f"trace-run-{run['run']}.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    markdown = [f"Observable tool transcript, run {run['run']}", "",
                f"Source: [{source.name}]({source})", "",
                "Timestamps and tool inputs/output text are taken directly from the session. Internal reasoning and image payloads are omitted. Tool duration is the logged call-to-result interval; inter-call gaps include model processing, composition, scheduling and other overhead.", ""]
    for call in calls:
        markdown += [f"### Call {call['index']}: {call['tool']}", "",
                     f"UTC {call['startedAt']} → {call['completedAt']}; tool interval {call['durationSeconds']:.3f}s; preceding gap {call['precedingGapSeconds']:.3f}s. Source lines {call['sourceLine']} / {call['outputSourceLine']}.", "",
                     "Input:", "````javascript", call["input"], "````", "", "Output text:", "````text", call["output"], "````", ""]
    (HERE / f"transcript-run-{run['run']}.md").write_text("\n".join(markdown))
(HERE / "trace-summary.json").write_text(json.dumps(summaries, indent=2) + "\n")
print(json.dumps(summaries, indent=2))

details = []
for n, endpoints, add_indices, remove_indices, search_indices in [
    (3, [7, 14, 25, 33], [10, 11, 12, 13], [26, 27, 28, 29], [8]),
    (4, [7, 17, 26, 33], [13, 14, 15, 16], [27, 28, 29, 30], [8, 9, 10, 11]),
]:
    trace = json.loads((HERE / f"trace-run-{n}.json").read_text())
    calls = trace["calls"]
    by_index = {c["index"]: c for c in calls}
    times = [trace["summary"]["startedAt"]] + [by_index[i]["completedAt"] for i in endpoints] + [trace["summary"]["completedAt"]]
    names = ["Setup through fresh empty basket", "Search, add and fresh basket read", "Native basket screenshot preparation and inspection", "Remove and empty basket screenshot inspection", "Final checks, timing and report"]
    phases = []
    for name, start, end in zip(names, times, times[1:]):
        responses = [r for r in trace["modelResponses"] if start < r["timestamp"] <= end]
        contained_calls = [c for c in calls if start < c["completedAt"] <= end]
        usage = {key: sum(r["usage"][key] for r in responses) for key in trace["summary"]["usage"]}
        phases.append({"phase": name, "startUtc": start, "endUtc": end,
                       "elapsedSeconds": round(seconds(start, end), 3),
                       "toolWaitSeconds": round(sum(c["durationSeconds"] for c in contained_calls), 3),
                       "toolCallIndices": [c["index"] for c in contained_calls],
                       "modelResponses": len(responses), "usage": usage})
    operations = {}
    for name, indices in [("Search", search_indices), ("Add", add_indices), ("Remove", remove_indices)]:
        selected = [by_index[i] for i in indices]
        elapsed = seconds(selected[0]["startedAt"], selected[-1]["completedAt"])
        wait = sum(c["durationSeconds"] for c in selected)
        operations[name] = {"callIndices": indices,
                            "startUtc": selected[0]["startedAt"], "endUtc": selected[-1]["completedAt"],
                            "toolCalls": len(selected), "elapsedSpanSeconds": round(elapsed, 3),
                            "toolWaitSeconds": round(wait, 3), "interCallGapSeconds": round(elapsed - wait, 3),
                            "outputCharacters": sum(c["outputCharacters"] for c in selected)}
    details.append({"run": n, "phases": phases, "operations": operations})
(HERE / "audit-details.json").write_text(json.dumps(details, indent=2) + "\n")
