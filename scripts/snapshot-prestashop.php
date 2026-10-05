<?php
require '/var/www/html/config/config.inc.php';require '/var/www/html/init.php';$lang=(int)Configuration::get('PS_LANG_DEFAULT');$rows=[];
Context::getContext()->currency=new Currency((int)Configuration::get('PS_CURRENCY_DEFAULT'));
foreach(Db::getInstance()->executeS('SELECT id_product FROM '._DB_PREFIX_.'product WHERE active=1 ORDER BY reference') as $row){$p=new Product((int)$row['id_product'],false,$lang);$c=new Category((int)$p->id_category_default,$lang);$rows[]=['sku'=>$p->reference,'name'=>$p->name,'category'=>$c->name,'price'=>(float)$p->price,'effective_price'=>(float)Product::getPriceStatic($p->id,false),'stock'=>(int)StockAvailable::getQuantityAvailableByProduct($p->id,0,1),'has_image'=>(bool)Image::getCover($p->id)];}
echo json_encode(['platform'=>'prestashop','version'=>_PS_VERSION_,'products'=>$rows])."\n";
