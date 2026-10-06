"""Offline feature grading for the fixed A/B/C prompts; never available as a worker tool."""
import re

def choices(products,count):
 def text(p):return (p['name']+' '+p['short_description']+' '+p['description']).lower()
 def has(p,*terms):return all(term in text(p) for term in terms)
 predicates=[
  lambda p:p['category']=='Tees' and p['color'].lower() in ('coral','red') and 'tee' in p['name'].lower(),
  lambda p:'mug' in p['name'].lower(),
  lambda p:p['sale_price'] is not None and p['sale_price']<p['price'] and (p['category']=='Hoodies' or 'beanie' in p['name'].lower()) and any(w in text(p) for w in ['warm','winter','fleece','cold weather']),
  lambda p:p['name']=='Harbor Everyday Tee',
  lambda p:has(p,'cotton','pique','polo','soft collar'),
  lambda p:has(p,'smooth','leather','belt','simple metal buckle'),
  lambda p:has(p,'zip-through','hoodie','two hand pockets'),
  lambda p:has(p,'adjustable','cap','curved brim'),
  lambda p:has(p,'lightweight','sunglasses','dark') and 'lenses' in text(p),
  lambda p:p['category']=='Tees' and 'green' in p['color'].lower() and has(p,'cotton','v-neck'),
  lambda p:has(p,'long-sleeve','cotton','ribbed collar'),
  lambda p:p['name']=='Cedar Pocket Pullover',
  lambda p:has(p,'knit','beanie','small woven mark'),
  lambda p:has(p,'substantial','leather','belt','daily wear'),
  lambda p:has(p,'easy-care','polo','structured','placket'),
  lambda p:has(p,'fleece-lined','pullover','hoodie','roomy hood') and p['color'].lower()=='coral',
 ]
 return [{p['sku'] for p in products if p['stock']>0 and predicate(p)} for predicate in predicates[:count]]

def assess(products,count,items):
 allowed=choices(products,count);present=[i for i,c in enumerate(allowed) if c];unavailable=[i+1 for i,c in enumerate(allowed) if not c]
 selected=[p['sku'] for p in items];owner={}
 def assign(need,seen):
  for line,sku in enumerate(selected):
   if line in seen or sku not in allowed[need]:continue
   seen.add(line)
   if line not in owner or assign(owner[line],seen):owner[line]=need;return True
  return False
 matched=sum(assign(need,set()) for need in present)
 assignments={need+1:selected[line] for line,need in owner.items()}
 return {'requested':count,'available_needs':len(present),'unavailable_needs':unavailable,'matched_needs':matched,'assignments':assignments,
  'available_items_correct':matched==len(present) and len(items)==len(present) and len(set(selected))==len(items) and all(i['quantity']==1 for i in items),
  'all_selected_real_merchandise':all(sku in {p['sku'] for p in products} for sku in selected)}
