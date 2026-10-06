"""Coordinate 30 fresh shopping sessions; measure provider totals including cache offline."""
import argparse,hashlib,json,subprocess,sys,time,re,urllib.parse,fcntl
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'output/playwright/woo-luna-real-catalog-20261006'
CLI=ROOT/'.runtime/benchmark-tools/node_modules/.bin/playwright-cli'
URL='https://krzysztofs-mac-studio.tail657ea.ts.net:18091/'
sys.path.insert(0,str(ROOT/'benchmarks/shopping'))
from measure import measure
from grade_real import assess,choices
TASKS={'a':('task-a-six-items.txt',6),'b':('task-b-twelve-items.txt',12),'c':('task-c-sixteen-items.txt',16)}
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2)+'\n')
def read(p):return json.loads(p.read_text())
def shell(args,stdin=None,cwd=ROOT):
 r=subprocess.run(args,input=stdin,text=True,capture_output=True,cwd=cwd)
 if r.returncode:raise RuntimeError((r.stderr or r.stdout)[-2000:])
 return r.stdout
def sql(s):return shell(['docker','compose','exec','-T','db','sh','-c','MYSQL_PWD="$MARIADB_ROOT_PASSWORD" mariadb -uroot -NB woo'],s)
def native_catalog():
 rows=sql("SELECT p.ID,p.menu_order,m.meta_value,p.post_title FROM wp_posts p JOIN wp_postmeta m ON m.post_id=p.ID AND m.meta_key='_sku' WHERE p.post_type='product' AND p.post_status='publish' ORDER BY p.ID;")
 return {'products':[dict(zip(['id','menu_order','sku','name'],x.split('\t'))) for x in rows.strip().splitlines()],
 'sort':sql("SELECT option_name,option_value FROM wp_options WHERE option_name='woocommerce_default_catalog_orderby';").strip(),
 'orders':sql("SELECT post_status,COUNT(*) FROM wp_posts WHERE post_type='shop_order' GROUP BY post_status;").strip()}
def state():return read(BASE/'coordinator/state.json')
def save(s):write(BASE/'coordinator/state.json',s)
def invariant():
 s=state();assert hashlib.sha256((ROOT/'catalog/products.json').read_bytes()).hexdigest()==s['catalog_sha256'];assert native_catalog()==read(BASE/'coordinator/native-before.json'),'Catalog/order state changed'
 for key,(name,count) in TASKS.items():assert hashlib.sha256((ROOT/'benchmarks/shopping'/name).read_bytes()).hexdigest()==s['tasks'][key]['sha256']
def init():
 assert not (BASE/'coordinator/state.json').exists(),'Campaign already initialized'
 catalog=read(ROOT/'catalog/products.json');assert len(catalog['products'])==530;assert all(p['image'] and 'noise' not in json.dumps(p).lower() for p in catalog['products'])
 before=native_catalog();assert len(before['products'])==530;assert {x['sku'] for x in before['products']}=={x['sku'] for x in catalog['products']}
 inventory=shell([str(CLI),'list']);assert '(no browsers)' in inventory,'Close old benchmark sessions before starting'
 write(BASE/'coordinator/native-before.json',before);write(BASE/'coordinator/catalog.json',catalog)
 s={'phase':'running','rounds_total':10,'sessions_total':30,'model':'gpt-6-luna','effort':'medium','round1_condition':'bare','primary_metric':'provider_total_tokens_including_cache',
 'catalog_sha256':hashlib.sha256((ROOT/'catalog/products.json').read_bytes()).hexdigest(),'tasks':{},'runs':[],'rounds':[],'started_at':datetime.now(timezone.utc).isoformat()}
 for key,(name,count) in TASKS.items():
  task=(ROOT/'benchmarks/shopping'/name).read_text();c=choices(catalog['products'],count)
  s['tasks'][key]={'file':name,'needs':count,'sha256':hashlib.sha256(task.encode()).hexdigest(),'available_needs':sum(bool(x) for x in c),'candidate_counts':[len(x) for x in c]}
 save(s);print(json.dumps({'initialized':True,'tasks':s['tasks'],'browsers':inventory},indent=2))
def cli(run,*args):return shell([str(CLI),'-s=ctreal-'+run,*args],cwd=BASE/run/'agent')
def evaluate(run,code):return json.loads(cli(run,'--raw','run-code','async page=>'+code))
def prepare(run):
 s=state();assert re.fullmatch(r'r(0[1-9]|10)[abc]',run);assert run not in [x['run'] for x in s['runs']];invariant()
 round=int(run[1:3]);arm=run[-1];treatment=round>1
 if round>1:
  previous=[x for x in s['runs'] if x['round']==round-1];assert len(previous)==3 and all(x['status']=='complete' and x.get('browser_closed') for x in previous),'Collect and close previous trio first'
 d=BASE/run/'agent';d.mkdir(parents=True);c=BASE/run/'coordinator';c.mkdir();session='ctreal-'+run
 task=(ROOT/'benchmarks/shopping'/TASKS[arm][0]).read_text();(c/'task.txt').write_text(task)
 (d/'marker.js').write_text("document.addEventListener('DOMContentLoaded',()=>document.documentElement.dataset.benchmarkContext="+json.dumps(session)+");")
 (d/'init-page.cjs').write_text("const fs=require('fs');exports.default=async({page})=>page.on('request',r=>fs.appendFileSync("+json.dumps(str(d/'network.jsonl'))+",JSON.stringify({time:Date.now(),method:r.method(),url:r.url(),resourceType:r.resourceType(),navigation:r.isNavigationRequest(),mainFrame:r.frame()===page.mainFrame()})+'\\n'));\n")
 init=[str(d/'marker.js')];sha=None
 if treatment:
  source=(ROOT/'shopping-agent/shop-agent.js').read_bytes();(c/'shop-agent.js').write_bytes(source);init.append(str(c/'shop-agent.js'));sha=hashlib.sha256(source).hexdigest()
  assert 'excludeText' not in source.decode(),'Exclusion feature must remain removed'
  same=[x for x in s['runs'] if x['round']==round];assert all(x['script_sha256']==sha for x in same),'One revision per trio'
 config={'browser':{'browserName':'chromium','isolated':True,'launchOptions':{'channel':'chrome','headless':False},'contextOptions':{'viewport':{'width':1280,'height':900}},'initPage':[str(d/'init-page.cjs')],'initScript':init},'outputDir':str(d),'outputMode':'file','timeouts':{'action':5000,'navigation':60000}}
 write(d/'config.json',config)
 wrapper=(ROOT/'output/playwright/woo-luna-medium-six-items-20261006/agent/browser').read_text().replace('woo-lm26-six1',session);(d/'browser').write_text(wrapper);(d/'browser').chmod(0o755)
 prompt=task+'\n'+(ROOT/'benchmarks/shopping/isolation.txt').read_text().strip()+'\n\nYour assigned browser is already open at '+URL+'. Browser interface: ordinary Playwright CLI through the executable handle `'+str(d/'browser')+'`. Working directory: `'+str(d)+'`.\n'
 (c/'prompt.txt').write_text(prompt);cli(run,'open',URL,'--headed','--browser=chrome','--idle-timeout=1200000','--config='+str(d/'config.json'))
 initial=evaluate(run,"{return await page.evaluate(async()=>{const cart=await(await fetch('/wp-json/wc/store/v1/cart')).json();return {items:cart.items.map(p=>({id:p.id,quantity:p.quantity})),marker:document.documentElement.dataset.benchmarkContext,brand:window.mcp?.brand||null,url:location.href}})}")
 assert initial['items']==[] and initial['marker']==session and bool(initial['brand'])==treatment;write(c/'initial.json',initial)
 s['runs'].append({'run':run,'round':round,'arm':arm,'condition':'adapter' if treatment else 'bare','session':session,'script_sha256':sha,'status':'prepared','task_sha256':s['tasks'][arm]['sha256']});save(s);print(prompt)
def started(run,agent):
 s=state();x=next(x for x in s['runs'] if x['run']==run);assert x['status']=='prepared';x.update(status='running',agent_path='/root/'+agent);save(s)
def source_log(agent):
 matches=[]
 for p in (Path.home()/'.codex/sessions/2026/10').glob('*/*.jsonl'):
  with p.open() as f:
   try:first=json.loads(next(f))
   except (ValueError,StopIteration):continue
   if first.get('payload',{}).get('agent_path')=='/root/'+agent:matches.append(p)
 assert len(matches)==1,(agent,len(matches));return matches[0]
def collect(run,agent):
 s=state();entry=next(x for x in s['runs'] if x['run']==run);c=BASE/run/'coordinator';log=source_log(agent);records=[json.loads(x) for x in log.read_text().splitlines()]
 m=measure(records,(c/'task.txt').read_text());assert m['status']=='complete';m['source_log']=str(log);write(c/'metrics.json',m)
 starts=[r for r in records if r['type']=='event_msg' and r.get('payload',{}).get('type')=='task_started'];ends=[r for r in records if r['type']=='event_msg' and r.get('payload',{}).get('type')=='task_complete']
 epoch=lambda x:datetime.fromisoformat(x.replace('Z','+00:00')).timestamp();lo,hi=epoch(starts[0]['timestamp']),epoch(ends[-1]['timestamp'])
 commands=[json.loads(x) for x in (BASE/run/'agent/commands.jsonl').read_text().splitlines()];commands=[x for x in commands if lo<=x['started_at']<=hi];interactions=[x for x in commands if x['args'] and '--help' not in x['args'] and '--version' not in x['args']]
 requests=[json.loads(x) for x in (BASE/run/'agent/network.jsonl').read_text().splitlines()];requests=[x for x in requests if lo<=x['time']/1000<=hi]
 finals=[r['payload']['content'] for r in records if r['type']=='response_item' and r.get('payload',{}).get('type')=='message' and r['payload'].get('role')=='assistant' and r['payload'].get('phase')=='final_answer'];final_reply=finals[-1] if finals else None
 final=evaluate(run,"{return await page.evaluate(async()=>{const c=await(await fetch('/wp-json/wc/store/v1/cart',{credentials:'same-origin'})).json();return {url:location.href,marker:document.documentElement.dataset.benchmarkContext,items:c.items.map(i=>({id:i.id,name:i.name,quantity:i.quantity,prices:i.prices})),totals:c.totals,rendered:[...document.querySelectorAll('.wc-block-cart-items__row,.woocommerce-cart-form__cart-item')].map(r=>({name:r.querySelector('.wc-block-components-product-name,.product-name')?.textContent.trim(),quantity:Number(r.querySelector('input[type=number]')?.value)}))}})}")
 before=read(BASE/'coordinator/native-before.json');pmap={int(x['id']):x['sku'] for x in before['products']}
 for x in final['items']:x['sku']=pmap[x['id']]
 quality=assess(read(BASE/'coordinator/catalog.json')['products'],TASKS[entry['arm']][1],final['items'])
 prohibited=[]
 for request in requests:
  u=urllib.parse.urlparse(request['url']);params=urllib.parse.parse_qs(u.query)
  keys={'category','stock_status','on_sale','min_price','max_price','filter_color','filter_size','filter_cat'}
  if '/product-category/' in u.path or any(key in params for key in keys):prohibited.append(request['url'])
 write(c/'prohibited-requests.json',prohibited)
 quality.update(native_rendered_match=sorted((x['name'],x['quantity']) for x in final['items'])==sorted((x['name'],x['quantity']) for x in final['rendered']),cart_open='/cart' in final['url'],marker_correct=final['marker']==entry['session'],missing_items_disclosed=None,fit_not_invented=None,no_order_created=native_catalog()['orders']==before['orders'],no_pruning_violation=not prohibited)
 write(c/'final.json',final);cli(run,'run-code','async page=>await page.screenshot({path:'+json.dumps(str(BASE/run/'agent/final-cart.png'))+',fullPage:true})')
 data={'metrics':m,'browser_interactions':len(interactions),'failed_browser_interactions':sum(x['exit_code']!=0 for x in interactions),'document_navigations':sum(x['navigation'] and x['mainFrame'] for x in requests),'fetch_xhr_requests':sum(x['resourceType'] in ('fetch','xhr') for x in requests),'all_request_events':len(requests),'final_reply_content':final_reply,'quality':quality};write(c/'report-data.json',data)
 entry.update(status='complete',source_log=str(log),tokens=m['provider_total_tokens_including_cache'],cached_input_tokens=m['provider_usage_including_environment']['cached_input_tokens'],seconds=m['elapsed_seconds'],quality=quality,browser_interactions=len(interactions));save(s)
 print(json.dumps({'run':run,'tokens':entry['tokens'],'cached_input_tokens':entry['cached_input_tokens'],'seconds':entry['seconds'],'quality':quality,'final_reply':final_reply},indent=2))
def grade(run,passes):
 s=state();entry=next(x for x in s['runs'] if x['run']==run);c=BASE/run/'coordinator';data=read(c/'report-data.json');q=data['quality'];q.update(missing_items_disclosed=passes,fit_not_invented=passes,no_pruning_violation=q['no_pruning_violation'] and passes)
 keys=['available_items_correct','all_selected_real_merchandise','native_rendered_match','cart_open','marker_correct','missing_items_disclosed','fit_not_invented','no_order_created','no_pruning_violation'];q['qualifies']=all(q[k] is True for k in keys);write(c/'report-data.json',data);entry['quality']=q;save(s);print(json.dumps(q))
def close(run):
 s=state();entry=next(x for x in s['runs'] if x['run']==run);assert entry['status']=='complete';cli(run,'close');entry['browser_closed']=True;save(s);print(json.dumps({'run':run,'closed':True}))
def summary():
 s=state();s['rounds']=[]
 for n in range(1,11):
  trio=[x for x in s['runs'] if x['round']==n and x['status']=='complete']
  if len(trio)==3:s['rounds'].append({'round':n,'script_sha256':trio[0]['script_sha256'],'mean_tokens':sum(x['tokens'] for x in trio)/3,'mean_seconds':sum(x['seconds'] for x in trio)/3,'quality_passes':sum(x['quality'].get('qualifies',False) for x in trio),'runs':[x['run'] for x in trio]})
 s['agents_spawned']=sum(x['status'] in ['running','complete','failed'] for x in s['runs']);save(s);print(json.dumps({'agents':s['agents_spawned'],'rounds':s['rounds']},indent=2))
def finish():
 invariant();s=state();assert len(s['runs'])==30 and all(x['status']=='complete' and x.get('browser_closed') for x in s['runs']);inventory=shell([str(CLI),'list']);assert '(no browsers)' in inventory
 s.update(phase='complete',finished_at=datetime.now(timezone.utc).isoformat(),browsers_after=inventory);save(s);write(BASE/'coordinator/final-invariants.json',{'catalog_unchanged':True,'orders_unchanged':True,'browsers':inventory,'sessions':30});print('Campaign completed; catalog/orders unchanged; no browsers remain.')
def main():
 p=argparse.ArgumentParser();p.add_argument('action',choices=['init','prepare','started','collect','grade','grade-fail','close','summary','finish']);p.add_argument('run',nargs='?');p.add_argument('agent',nargs='?');a=p.parse_args()
 if a.action=='init':init()
 elif a.action=='prepare':prepare(a.run)
 elif a.action=='started':started(a.run,a.agent)
 elif a.action=='collect':collect(a.run,a.agent)
 elif a.action in ['grade','grade-fail']:grade(a.run,a.action=='grade')
 elif a.action=='close':close(a.run)
 elif a.action=='summary':summary()
 elif a.action=='finish':finish()
if __name__=='__main__':
 (BASE/'coordinator').mkdir(parents=True,exist_ok=True)
 with (BASE/'coordinator/state.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  main()
