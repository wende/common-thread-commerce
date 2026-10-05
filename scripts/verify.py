import json, os, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone
from runtime import compose_command, project_root
root=project_root()
compose=compose_command(root)
expected=json.loads((root/'catalog/products.json').read_text())['products']
commands={
 'woocommerce':compose+['run','--rm','-T','wpcli','wp','eval-file','/demo-scripts/snapshot-woocommerce.php'],
 'prestashop':compose+['exec','-T','prestashop','php','/demo-scripts/snapshot-prestashop.php'],
 'magento':compose+['exec','-T','--user','www-data','magento','php','/demo-scripts/snapshot-magento.php']
}
report={'checked_at':datetime.now(timezone.utc).isoformat(),'expected_count':len(expected),'platforms':{}}
failed=False
for platform,command in commands.items():
 run=subprocess.run(command,cwd=root,capture_output=True,text=True)
 errors=[]
 if run.returncode:
  errors.append(run.stderr.strip() or run.stdout.strip());actual={'products':[]}
 else:
  try: actual=json.loads(run.stdout.strip().splitlines()[-1])
  except Exception as e:errors.append(f'Invalid platform snapshot: {e}: {run.stdout[-1000:]}');actual={'products':[]}
 rows={p['sku']:p for p in actual['products']}
 if len(actual['products'])!=len(expected):errors.append(f"Expected 30 products, found {len(actual['products'])}")
 for p in expected:
  a=rows.get(p['sku'])
  if not a:errors.append(f"Missing {p['sku']}");continue
  for key in ('name','category','stock'):
   if a[key]!=p[key]:errors.append(f"{p['sku']} {key}: {a[key]!r} != {p[key]!r}")
  for key,value in [('price',p['price']),('effective_price',p['sale_price'] if p['sale_price'] is not None else p['price'])]:
   if abs(a[key]-value)>.01:errors.append(f"{p['sku']} {key}: {a[key]} != {value}")
  if not a['has_image']:errors.append(f"{p['sku']} missing image")
 report['platforms'][platform]={'version':actual.get('version'),'product_count':len(actual['products']),'passed':not errors,'errors':errors}
 print(f"{platform}: {'PASS' if not errors else 'FAIL'} — {len(actual['products'])} products")
 for error in errors:print('  '+error)
 failed|=bool(errors)
(root/'screenshots').mkdir(exist_ok=True)
(root/'screenshots/verification.json').write_text(json.dumps(report,indent=2)+'\n')
if os.environ.get('COMMON_THREAD_BOOTSTRAP')=='1':
 owner=root.stat()
 for path in [root/'screenshots',root/'screenshots/verification.json']:
  os.chown(path,owner.st_uid,owner.st_gid)
sys.exit(1 if failed else 0)
