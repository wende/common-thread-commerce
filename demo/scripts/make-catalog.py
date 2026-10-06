import json, csv, urllib.request, concurrent.futures
from pathlib import Path
root = Path(__file__).resolve().parents[1]
# The same invented catalog is imported into each native commerce platform.
groups = [
('Tees', [
 ('Harbor Everyday Tee','tshirt-2.jpg',24,'Heather gray','Soft cotton jersey with a relaxed everyday fit.'),
 ('Signal Graphic Tee','t-shirt-with-logo-1.jpg',28,'Slate','A cotton crewneck with a small graphic at the chest.'),
 ('Canyon V-Neck Tee','vneck-tee-2.jpg',26,'Coral','A lightweight V-neck for warm days and easy layering.'),
 ('Grove V-Neck Tee','vnech-tee-green-1.jpg',26,'Forest green','Breathable cotton jersey with a clean V-neck.'),
 ('Tide V-Neck Tee','vnech-tee-blue-1.jpg',26,'Ocean blue','A soft jersey essential with a gently tapered cut.'),
 ('Dusk Long-Sleeve Tee','long-sleeve-tee-2.jpg',34,'Charcoal','A long-sleeve cotton layer with a ribbed collar.')]),
('Hoodies', [
 ('Ember Pullover Hoodie','hoodie-2.jpg',64,'Coral','A fleece-lined pullover with a roomy hood.'),
 ('Tide Pullover Hoodie','hoodie-blue-1.jpg',64,'Ocean blue','Soft brushed fleece for cool evenings.'),
 ('Grove Pullover Hoodie','hoodie-green-1.jpg',64,'Forest green','A cotton-blend hoodie with a comfortable relaxed fit.'),
 ('Waypoint Logo Hoodie','hoodie-with-logo-2.jpg',68,'Blue','A midweight pullover finished with a chest mark.'),
 ('Trail Pocket Hoodie','hoodie-with-pocket-2.jpg',72,'Gray','A fleece hoodie with a generous front pocket.'),
 ('Transit Zip Hoodie','hoodie-with-zipper-2.jpg',78,'Gray','An easy zip-through layer with two hand pockets.')]),
('Shirts', [
 ('Sunday Classic Polo','polo-2.jpg',42,'Blue','A cotton pique polo with a soft collar.'),
 ('Studio Everyday Polo','polo-2.jpg',46,'Blue','An easy-care polo with a neatly structured placket.'),
 ('Weekend Jersey Polo','polo-2.jpg',44,'Blue','A comfortable collared shirt for relaxed weekends.'),
 ('Field Cotton Polo','polo-2.jpg',48,'Blue','A durable cotton polo made for daily rotation.'),
 ('Northline Long-Sleeve Shirt','long-sleeve-tee-2.jpg',38,'Charcoal','A heavier jersey shirt with full-length sleeves.'),
 ('Afterhours Jersey Shirt','long-sleeve-tee-2.jpg',40,'Charcoal','A smooth cotton shirt with a soft, easy drape.')]),
('Headwear', [
 ('Ridge Ribbed Beanie','beanie-2.jpg',22,'Red','A warm rib-knit beanie with a folded cuff.'),
 ('Summit Mark Beanie','beanie-with-logo-1.jpg',25,'Red','A soft winter beanie with a small woven mark.'),
 ('Daybreak Knit Beanie','beanie-2.jpg',24,'Red','A lightweight knit hat for crisp mornings.'),
 ('Compass Everyday Cap','cap-2.jpg',27,'Blue','An adjustable cap with a gently curved brim.'),
 ('Coast Cotton Cap','cap-2.jpg',29,'Blue','A breathable cotton cap with an adjustable back.'),
 ('Roam Weekend Cap','cap-2.jpg',31,'Blue','A sturdy six-panel cap for the daily outdoors.')]),
('Accessories', [
 ('Foundry Leather Belt','belt-2.jpg',39,'Brown','A smooth leather belt with a simple metal buckle.'),
 ('Waypoint Everyday Belt','belt-2.jpg',44,'Brown','A versatile leather belt with a classic finish.'),
 ('Heritage Leather Belt','belt-2.jpg',49,'Brown','A substantial leather belt for daily wear.'),
 ('Horizon Classic Sunglasses','sunglasses-2.jpg',36,'Black','Lightweight frames with dark everyday lenses.'),
 ('Vista Weekend Sunglasses','sunglasses-2.jpg',42,'Black','An easy-wearing pair of sunglasses with a timeless shape.'),
 ('Outlook City Sunglasses','sunglasses-2.jpg',48,'Black','Comfortable frames designed for bright city days.')])]
products=[]
for category, entries in groups:
 for name, image, price, color, desc in entries:
  idx=len(products)+1
  products.append(dict(id=idx,sku=f'CT-{idx:03d}',slug=name.lower().replace(' ','-'),name=name,category=category,description=desc+' Part of the Common Thread collection.',short_description=desc,color=color,price=price,sale_price=round(price*.8,2) if idx in (3,11,19,28) else None,stock=0 if idx in (18,30) else 12+idx*3,weight_kg=0.25 if category!='Hoodies' else 0.7,image=f'assets/{image}'))
(root/'catalog/products.json').write_text(json.dumps(dict(store='Common Thread',currency='USD',products=products),indent=2)+'\n')
with (root/'catalog/products.csv').open('w',newline='') as f:
 fields=list(products[0]); writer=csv.DictWriter(f,fields);writer.writeheader();writer.writerows(products)
urls={p['image']:'https://woocommercecore.mystagingwebsite.com/wp-content/uploads/2017/12/'+Path(p['image']).name for p in products}
def download(item):
 file,url=item; target=root/'catalog'/file
 if not target.exists():
  request=urllib.request.Request(url,headers={'User-Agent':'CommonThreadDemo/1.0'})
  with urllib.request.urlopen(request,timeout=60) as r: target.write_bytes(r.read())
 return file,target.stat().st_size
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 for result in pool.map(download,urls.items()):print(*result)
(root/'catalog/assets/SOURCES.txt').write_text('Illustrative product images from the official WooCommerce sample catalog.\nSource: https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/sample-data/sample_products.csv\nDownloaded from the URLs in that source. Product names, descriptions, prices and stock are invented for this local demo.\n')
print(f'Created {len(products)} products across {len(groups)} categories.')
