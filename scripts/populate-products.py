"""Replace numbered fillers with a deterministic, basket-independent merchandise catalog."""
import argparse, csv, hashlib, json, random, subprocess, sys
from pathlib import Path
from runtime import compose_command, project_root

# Merchandise families are independent of benchmark shopping lists.
FAMILIES = ['Cedar','Atlas','Aspen','Meadow','Juniper','Oak','Willow','Birch','Elm','Pine',
            'Alder','Maple','Brook','River','Stone','Lake','Prairie','Cliff','Orchard','Sequoia']
# category, product style, existing illustrative photograph, color, base price, material/features
STYLES = [
 ('Tees','Comfort Crew Tee','tshirt-2.jpg','Heather gray',24,'Soft cotton jersey with a relaxed fit and a ribbed crew neck.'),
 ('Tees','Chest Graphic Tee','t-shirt-with-logo-1.jpg','Slate',29,'A cotton crewneck with a small chest graphic and an everyday straight fit.'),
 ('Tees','Light V-Neck Tee','vneck-tee-2.jpg','Coral',27,'Lightweight cotton jersey with a clean V-neck and easy layering fit.'),
 ('Tees','Cotton V-Neck Tee','vnech-tee-green-1.jpg','Forest green',26,'Breathable cotton jersey, a V-neck opening and short sleeves.'),
 ('Tees','Long Sleeve Crew','long-sleeve-tee-2.jpg','Charcoal',35,'A long-sleeve cotton layer with a ribbed collar and smooth jersey fabric.'),
 ('Hoodies','Fleece Pullover','hoodie-2.jpg','Coral',63,'A fleece-lined pullover hoodie with a roomy hood for cold weather.'),
 ('Hoodies','Brushed Hoodie','hoodie-blue-1.jpg','Ocean blue',65,'Soft brushed fleece, a drawstring hood and a comfortable everyday fit.'),
 ('Hoodies','Cotton Blend Hoodie','hoodie-green-1.jpg','Forest green',62,'A cotton-blend pullover hoodie with a relaxed fit and warm fleece interior.'),
 ('Hoodies','Pocket Pullover','hoodie-with-pocket-2.jpg','Gray',72,'A warm fleece hoodie with a generous front pocket and ribbed cuffs.'),
 ('Hoodies','Zip Through Hoodie','hoodie-with-zipper-2.jpg','Gray',79,'A zip-through fleece hoodie with two hand pockets for winter layering.'),
 ('Shirts','Pique Polo','polo-2.jpg','Blue',43,'A cotton pique polo with a soft collar and a button placket.'),
 ('Shirts','Easy Care Polo','polo-2.jpg','Blue',46,'An easy-care collared polo with a structured button placket.'),
 ('Shirts','Weekend Jersey Polo','polo-2.jpg','Blue',44,'A smooth cotton jersey polo with a relaxed fit and short sleeves.'),
 ('Shirts','Daily Cotton Polo','polo-2.jpg','Blue',48,'A durable cotton polo with a neat collar for daily wear.'),
 ('Shirts','Heavy Jersey Shirt','long-sleeve-tee-2.jpg','Charcoal',40,'A heavier cotton jersey shirt with full-length sleeves and a soft drape.'),
 ('Headwear','Fold Cuff Beanie','beanie-2.jpg','Red',23,'A warm rib-knit winter beanie with a folded cuff.'),
 ('Headwear','Woven Mark Beanie','beanie-with-logo-1.jpg','Red',26,'A soft knit winter beanie finished with a small woven mark.'),
 ('Headwear','Light Knit Beanie','beanie-2.jpg','Red',24,'A lightweight knit beanie with a fold-up cuff for crisp mornings.'),
 ('Headwear','Curved Brim Cap','cap-2.jpg','Blue',28,'An adjustable cotton cap with a gently curved brim.'),
 ('Headwear','Six Panel Cap','cap-2.jpg','Blue',30,'A breathable cotton six-panel cap with an adjustable back and curved brim.'),
 ('Accessories','Smooth Leather Belt','belt-2.jpg','Brown',40,'A smooth leather belt with a simple metal buckle.'),
 ('Accessories','Classic Leather Belt','belt-2.jpg','Brown',45,'A versatile leather belt with a classic finish and metal buckle.'),
 ('Accessories','Heavy Leather Belt','belt-2.jpg','Brown',50,'A substantial leather belt with a broad strap for daily wear.'),
 ('Accessories','Everyday Sunglasses','sunglasses-2.jpg','Black',37,'Lightweight black frames with dark lenses for everyday sunglasses.'),
 ('Accessories','City Sunglasses','sunglasses-2.jpg','Black',47,'Comfortable black sunglasses frames with dark lenses for bright days.'),
]

PHOTO_COLORS = {
 'tshirt-2.jpg':'Heather gray','t-shirt-with-logo-1.jpg':'Mint green','vneck-tee-2.jpg':'Coral',
 'vnech-tee-green-1.jpg':'Mint green','vnech-tee-blue-1.jpg':'Sky blue','long-sleeve-tee-2.jpg':'Sage green',
 'hoodie-2.jpg':'Coral','hoodie-blue-1.jpg':'Sky blue','hoodie-green-1.jpg':'Mint green',
 'hoodie-with-logo-2.jpg':'Sky blue','hoodie-with-pocket-2.jpg':'Gray','hoodie-with-zipper-2.jpg':'Mint green',
 'polo-2.jpg':'Sky blue','beanie-2.jpg':'Coral','beanie-with-logo-1.jpg':'Sky blue','cap-2.jpg':'Sand',
 'belt-2.jpg':'Tan','sunglasses-2.jpg':'Charcoal',
}

def generate(root):
 path=root/'catalog/products.json';catalog=json.loads(path.read_text());originals=[p for p in catalog['products'] if p['sku'] in {f'CT-{i:03d}' for i in range(1,31)}]
 assert len(originals)==30,'Original 30-product catalog required'
 for p in originals:p['color']=PHOTO_COLORS[Path(p['image']).name]
 products=list(originals)
 for family_no,family in enumerate(FAMILIES):
  for style_no,(category,style,image,color,base,features) in enumerate(STYLES):
   color=PHOTO_COLORS[image]
   idx=31+family_no*len(STYLES)+style_no
   price=round(base*(0.86+((family_no*13+style_no*7)%29)/100),2)
   sale=round(price*(0.75+((family_no+style_no)%4)*.05),2) if (family_no*3+style_no)%7==0 else None
   name=f'{family} {style}';stock=0 if idx%23==0 else 8+(idx*17)%85
   short=f'{features} {color} finish.'
   products.append(dict(id=idx,sku=f'CT-{idx:03d}',slug=name.lower().replace(' ','-'),name=name,category=category,
    description=short+' Part of the Common Thread collection.',short_description=short,color=color,
    price=price,sale_price=sale,stock=stock,weight_kg=.7 if category=='Hoodies' else .25,image='assets/'+image))
 # One fixed seed intermixes all merchandise; it is unrelated to shopping-list answers.
 random.Random(20261006).shuffle(products)
 catalog['products']=products
 assert len(products)==530 and len({p['sku'] for p in products})==530 and len({p['name'] for p in products})==530
 assert all(p['image'] and (root/'catalog'/p['image']).is_file() for p in products)
 assert all('noise' not in json.dumps(p).lower() and 'filler' not in json.dumps(p).lower() for p in products)
 path.write_text(json.dumps(catalog,indent=2)+'\n')
 with (root/'catalog/products.csv').open('w',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=list(products[0]));writer.writeheader();writer.writerows(products)
 print(json.dumps({'products':len(products),'new_merchandise':500,'photos':len({p['image'] for p in products}),'discounted':sum(p['sale_price'] is not None for p in products),'out_of_stock':sum(p['stock']==0 for p in products),'catalog_sha256':hashlib.sha256(path.read_bytes()).hexdigest()}),flush=True)

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--generate-only',action='store_true');args=parser.parse_args();root=project_root();generate(root)
 if args.generate_only:return
 compose=compose_command(root)
 for label,args in [
  ('WooCommerce',['run','--rm','-T','wpcli','wp','eval-file','/demo-scripts/seed-woocommerce.php']),
  ('PrestaShop',['exec','-T','--user','www-data','prestashop','php','/demo-scripts/seed-prestashop.php']),
  ('Magento',['exec','-T','--user','www-data','magento','php','/demo-scripts/seed-magento.php']),
  ('Magento indexes',['exec','-T','--user','www-data','magento','php','bin/magento','indexer:reindex']),
  ('Magento caches',['exec','-T','--user','www-data','magento','php','bin/magento','cache:flush'])]:
  print('Importing '+label,flush=True);subprocess.run(compose+args,cwd=root,check=True)
 subprocess.run([sys.executable,str(root/'scripts/verify.py')],cwd=root,check=True)
if __name__=='__main__':main()
