import copy
import unittest
from measure import measure, observations


def event(kind, **fields):
    return {'type':'event_msg', 'payload':{'type':kind, **fields}}


def fixture():
    return [
        {'type':'session_meta', 'payload':{'base_instructions':'large inherited environment'}},
        event('task_started', turn_id='one'),
        {'type':'turn_context', 'payload':{'model':'test-model', 'effort':'medium'}},
        {'type':'response_item', 'payload':{'type':'message', 'role':'developer', 'content':'environment'}},
        {'type':'response_item', 'payload':{'type':'custom_tool_call', 'call_id':'c1', 'name':'browser', 'input':'snapshot'}},
        {'type':'response_item', 'payload':{'type':'custom_tool_call_output', 'id':'o1', 'call_id':'c1', 'output':[{'type':'input_text','text':'Products: red shirt, mug.'}]}},
        {'type':'token_usage_record', 'payload':{'turn_id':'one', 'turn_token_usage':{'input_tokens':33000, 'cached_input_tokens':32000,'output_tokens':100,'reasoning_output_tokens':30,'total_tokens':33100}}},
        event('task_complete', turn_id='one', duration_ms=12000),
    ]


class Accounting(unittest.TestCase):
    def test_primary_provider_total_includes_cached_input_once(self):
        a=measure(fixture(),'Find a mug.')
        self.assertEqual(a['primary_metric'],'provider_total_tokens_including_cache')
        self.assertEqual(a['provider_total_tokens_including_cache'],33100)
        self.assertEqual(a['provider_usage_including_environment']['cached_input_tokens'],32000)
        r=fixture();r[6]['payload']['turn_token_usage']['cached_input_tokens']=0
        self.assertEqual(measure(r,'Find a mug.')['provider_total_tokens_including_cache'],33100)
        del r[6]['payload']['turn_token_usage']['total_tokens']
        self.assertEqual(measure(r,'Find a mug.')['provider_total_tokens_including_cache'],33100)
        self.assertIsNone(measure(fixture()[:-2],'Find a mug.')['provider_total_tokens_including_cache'])

    def test_invariant_to_environment_and_cache(self):
        a=measure(fixture(), 'Find a mug.')
        r=fixture();r[0]['payload']['base_instructions']='unrelated '*40000
        r[3]['payload']['content']='extra tools and instructions '*40000
        r[6]['payload']['turn_token_usage'].update(input_tokens=900000,cached_input_tokens=0,total_tokens=900100)
        b=measure(r, 'Find a mug.')
        self.assertEqual(a['task_work_tokens_estimate'], b['task_work_tokens_estimate'])
        self.assertNotEqual(a['provider_usage_including_environment'], b['provider_usage_including_environment'])

    def test_no_double_count_reasoning_or_transcript_duplicates(self):
        r=fixture();a=measure(r,'Find a mug.')
        r.insert(6,copy.deepcopy(r[5]))
        r.insert(6,{'type':'response_item','payload':{'type':'reasoning','summary':'reasoning is already in output usage'}})
        b=measure(r,'Find a mug.')
        self.assertEqual(a['task_work_tokens_estimate'],b['task_work_tokens_estimate'])
        c=a['components']
        self.assertEqual(a['task_work_tokens_estimate'],c['task_prompt_text_tokens_estimate']+c['observed_tool_text_tokens_estimate']+100)
        self.assertGreater(c['task_prompt_text_tokens_estimate'],0)

    def test_images_report_missing_accounting(self):
        r=fixture();r[5]['payload']['output'].append({'type':'input_image','image_url':'data:image/png;base64,not-tokenized'})
        result=measure(r,'Find a mug.')
        self.assertEqual(result['image_observations'],1)
        self.assertIsNone(result['image_input_tokens'])
        self.assertIn('unavailable',result['coverage'])

    def test_transport_unwrapped_but_actual_json_preserved(self):
        self.assertEqual(observations({'output':'native response', 'chunk_id':'x','exit_code':0}),(['native response'],0))
        self.assertEqual(observations('Script completed\nWall time 0.3 seconds\nOutput:\n'),([],0))
        self.assertEqual(observations('{"products": []}'),(['{"products": []}'],0))

    def test_turn_scoped_and_ambiguous_logs_rejected(self):
        first=fixture();second=copy.deepcopy(first)
        for r in second:
            if r.get('payload',{}).get('turn_id')=='one':r['payload']['turn_id']='two'
        with self.assertRaises(ValueError):measure(first+second,'Find a mug.')
        self.assertEqual(measure(first,'Find a mug.')['task_work_tokens_estimate'],measure(first+second,'Find a mug.','two')['task_work_tokens_estimate'])

    def test_incomplete_missing_usage_is_not_zero(self):
        result=measure(fixture()[:-2],'Find a mug.')
        self.assertEqual(result['status'],'incomplete')
        self.assertIsNone(result['task_work_tokens_estimate'])

    def test_repeated_observations_and_partial_output_chunks_count(self):
        r=fixture();a=measure(r,'Find a mug.')
        extra=copy.deepcopy(r[5]);extra['payload']['id']='o2';r.insert(6,extra)
        b=measure(r,'Find a mug.')
        self.assertEqual(b['components']['observed_tool_text_tokens_estimate'],2*a['components']['observed_tool_text_tokens_estimate'])

    def test_unscoped_output_rejected(self):
        r=fixture();r[5]['payload']['call_id']='another-turn'
        with self.assertRaises(ValueError):measure(r,'Find a mug.')


if __name__=='__main__':unittest.main()
