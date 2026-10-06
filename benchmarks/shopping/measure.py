#!/usr/bin/env python3
"""Offline accounting only. Never launches agents, connects to browsers, or reads a catalog."""
import argparse
import hashlib
import json
import re
from pathlib import Path

import tiktoken

ENCODING = 'o200k_base'


def observations(value):
    """Extract observed text/image counts, stripping known execution transport envelopes."""
    if isinstance(value, list):
        text, images = [], 0
        for item in value:
            t, n = observations(item)
            text.extend(t)
            images += n
        return text, images
    if isinstance(value, dict):
        kind = value.get('type', '')
        if kind in ('image', 'input_image', 'image_url'):
            return [], 1
        if kind in ('text', 'input_text', 'output_text'):
            return observations(value.get('text', ''))
        if 'output' in value and any(k in value for k in ('chunk_id', 'exit_code', 'session_id', 'wall_time_seconds')):
            return observations(value['output'])
        if 'content' in value and isinstance(value['content'], list):
            return observations(value['content'])
        return [json.dumps(value, ensure_ascii=False, separators=(',', ':'))], 0
    if not isinstance(value, str):
        return [], 0
    # functions.exec's separate wrapper block is not website/task content.
    if re.fullmatch(r'Script completed\nWall time [^\n]+\nOutput:\n?', value):
        return [], 0
    try:
        decoded = json.loads(value)
    except (ValueError, TypeError):
        decoded = None
    if isinstance(decoded, (dict, list)):
        # Only unwrap known transport structures. Preserve ordinary JSON byte-for-byte.
        if isinstance(decoded, dict) and ('output' in decoded and any(k in decoded for k in ('chunk_id', 'exit_code', 'session_id', 'wall_time_seconds'))):
            return observations(decoded)
        if isinstance(decoded, list) and decoded and all(isinstance(x, dict) and x.get('type') in ('text', 'input_text', 'output_text', 'image', 'input_image', 'image_url') for x in decoded):
            return observations(decoded)
    return ([value] if value else []), 0


def measure(records, task_prompt, turn_id=None):
    starts = [r for r in records if r.get('type') == 'event_msg' and r.get('payload', {}).get('type') == 'task_started']
    if turn_id is None:
        if len(starts) != 1:
            raise ValueError('Select --turn-id when the log does not contain exactly one task_started event.')
        turn_id = starts[0]['payload']['turn_id']
    matches = [r for r in starts if r['payload']['turn_id'] == turn_id]
    if len(matches) != 1:
        raise ValueError('Selected turn must have exactly one task_started event.')
    start_index = records.index(matches[0])
    end_index = next((i for i in range(start_index+1, len(records)) if records[i].get('type') == 'event_msg' and records[i].get('payload', {}).get('type') == 'task_started'), len(records))
    selected = records[start_index:end_index]
    encoding = tiktoken.get_encoding(ENCODING)
    count = lambda s: len(encoding.encode(s, disallowed_special=()))
    observation_tokens = image_count = tool_results = 0
    calls, seen, usage, complete, model, effort = {}, set(), None, None, None, None
    for record_index, r in enumerate(selected):
        p = r.get('payload', {})
        if r.get('type') == 'turn_context':
            model, effort = p.get('model'), p.get('effort')
        elif r.get('type') == 'token_usage_record' and p.get('turn_id') == turn_id:
            # Provider turn total, not thread total; output includes reasoning already.
            usage = p.get('turn_token_usage')
        elif r.get('type') == 'event_msg' and p.get('type') == 'task_complete' and p.get('turn_id') == turn_id:
            complete = p
        elif r.get('type') == 'response_item':
            kind = p.get('type')
            if kind in ('function_call', 'custom_tool_call'):
                calls[p.get('call_id')] = p.get('name')
            elif kind in ('function_call_output', 'custom_tool_call_output'):
                # Identical repeated log records aren't repeated observations. Distinct chunks count.
                identity = (p.get('id') if p.get('id') is not None else record_index, p.get('call_id'), json.dumps(p.get('output'), sort_keys=True))
                if identity in seen:
                    continue
                seen.add(identity)
                if p.get('call_id') not in calls:
                    raise ValueError('Tool output has no call in the selected turn; cannot safely scope observations.')
                texts, images = observations(p.get('output'))
                observation_tokens += sum(count(t) for t in texts)
                image_count += images
                tool_results += 1
    # Old logs without turn usage can use a cumulative delta only with an explicit pre-turn baseline.
    if usage is None:
        before = [r['payload']['info']['total_token_usage'] for r in records[:start_index]
                  if r.get('type') == 'event_msg' and r.get('payload', {}).get('type') == 'token_count' and r['payload'].get('info')]
        totals = [r['payload']['info']['total_token_usage'] for r in selected
                  if r.get('type') == 'event_msg' and r.get('payload', {}).get('type') == 'token_count' and r['payload'].get('info')]
        if totals and (before or start_index == records.index(starts[0])):
            baseline = before[-1] if before else {}
            usage = {k:v-baseline.get(k, 0) for k,v in totals[-1].items() if isinstance(v, int)}
    if usage is not None and any(v < 0 for v in usage.values() if isinstance(v, int)):
        raise ValueError('Usage counters moved backwards; refusing invalid totals.')
    generated = usage.get('output_tokens') if usage else None
    provider_total = usage.get('total_tokens') if usage else None
    if provider_total is None and usage and isinstance(usage.get('input_tokens'), int) and isinstance(generated, int):
        provider_total = usage['input_tokens'] + generated
    prompt_tokens = count(task_prompt)
    work_tokens = prompt_tokens + observation_tokens + generated if generated is not None else None
    return {
        'schema': 'shopping-task-metrics/v2', 'turn_id': turn_id, 'model': model, 'effort': effort,
        'status': 'complete' if complete else 'incomplete',
        'task_prompt_sha256': hashlib.sha256(task_prompt.encode()).hexdigest(),
        'task_work_tokens_estimate': work_tokens,
        'primary_metric': 'provider_total_tokens_including_cache',
        'provider_total_tokens_including_cache': provider_total,
        'provider_token_accounting': 'Provider total input plus output tokens. Input already includes cached input: do not subtract it or add it again. Includes inherited context, tools, replayed history and multimodal input as reported by the provider. Unweighted token count, not a monetary cost.',
        'components': {'task_prompt_text_tokens_estimate': prompt_tokens,
                       'observed_tool_text_tokens_estimate': observation_tokens,
                       'generated_output_tokens': generated,
                       'reasoning_output_tokens_included': usage.get('reasoning_output_tokens') if usage else None},
        'image_observations': image_count, 'image_input_tokens': None if image_count else 0,
        'coverage': 'text inputs plus generated output; image inputs unavailable' if image_count else 'text inputs plus generated output',
        'tokenizer': ENCODING, 'is_billed_token_total': False,
        'tool_calls': len(calls), 'tool_result_records': tool_results,
        'elapsed_seconds': complete.get('duration_ms', 0)/1000 if complete and complete.get('duration_ms') is not None else None,
        'provider_usage_including_environment': usage,
        'accounting': 'Secondary task-work diagnostic only: shopping prompt once + each observed tool text once + provider generated output (including reasoning). Excludes inherited messages, tool schemas, isolation/session instructions and replayed context. Cache-independent work estimate, not exact model billing.'
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--log', required=True, type=Path)
    parser.add_argument('--task-prompt', required=True, type=Path, help='Exact shopping request used for this run, without environment scaffolding.')
    parser.add_argument('--turn-id')
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    records = [json.loads(line) for line in args.log.read_text().splitlines() if line.strip()]
    result = measure(records, args.task_prompt.read_text(), args.turn_id)
    result['source_log'] = str(args.log)
    text = json.dumps(result, indent=2, ensure_ascii=False) + '\n'
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text)
    else:
        print(text, end='')


if __name__ == '__main__':
    main()
