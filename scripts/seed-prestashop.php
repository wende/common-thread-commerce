<?php
$seedLock=fopen('/tmp/common-thread-presta-seed.lock','c');flock($seedLock,LOCK_EX);
require '/var/www/html/config/config.inc.php';
require '/var/www/html/init.php';
$catalog=json_decode(file_get_contents('/catalog/products.json'),true,512,JSON_THROW_ON_ERROR);
$context=Context::getContext();
$context->shop=new Shop(1);
$lang=(int)Configuration::get('PS_LANG_DEFAULT');
$context->language=new Language($lang);
$context->employee=new Employee(1);
// Theme/module writes require the native admin service container in PrestaShop 9.
$kernel=new AdminKernel('prod',false);$kernel->boot();
$context->container=$kernel->getContainer();
\PrestaShop\PrestaShop\Adapter\SymfonyContainer::resetStaticCache();
$context->container->get(\PrestaShop\PrestaShop\Core\Context\ContextBuilderPreparer::class)->prepareFromLegacyContext($context);
if ($context->shop->theme_name !== 'classic') {
 $builder=new \PrestaShop\PrestaShop\Core\Addon\Theme\ThemeManagerBuilder($context,Db::getInstance());
 if(!$builder->build()->enable('classic',true))throw new RuntimeException('Could not enable the native Classic theme.');
 $context->shop=new Shop(1);
}
$langs=Language::getLanguages(false);
function localized($value){global $langs;$out=[];foreach($langs as $l)$out[(int)$l['id_lang']]=$value;return $out;}
Configuration::updateValue('PS_SHOP_NAME','Common Thread');
file_put_contents(_PS_IMG_DIR_.'common-thread.svg','<svg xmlns="http://www.w3.org/2000/svg" width="280" height="45" viewBox="0 0 280 45"><text x="0" y="32" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="#153442">Common Thread</text></svg>');
Configuration::updateValue('PS_LOGO','common-thread.svg');
Configuration::updateValue('PS_SHOP_EMAIL','hello@example.test');
Configuration::updateValue('PS_TAX',0);
Configuration::updateValue('PS_PRODUCTS_PER_PAGE',30);
Configuration::updateValue('PS_DISPLAY_SUPPLIERS',0);
Configuration::updateValue('PS_DISPLAY_MANUFACTURERS',0);
Configuration::updateValue('PS_ORDER_OUT_OF_STOCK',0);
Configuration::updateValue('PS_NB_DAYS_NEW_PRODUCT',0);
Configuration::updateValue('PS_REWRITING_SETTINGS',1);
$usd=Currency::getIdByIsoCode('USD');
if(!$usd){$currency=new Currency();$currency->name=localized('US Dollar');$currency->iso_code='USD';$currency->numeric_iso_code='840';$currency->symbol=localized('$');$currency->precision=2;$currency->conversion_rate=1;$currency->active=1;$currency->add();$usd=$currency->id;}
Configuration::updateValue('PS_CURRENCY_DEFAULT',$usd);
Db::getInstance()->update('currency',['conversion_rate'=>1], 'id_currency='.(int)$usd);
$context->currency=new Currency($usd);
// Remove only the sample merchandise created in this new demo installation.
if(!Configuration::get('CT_CATALOG_INITIALIZED')){
 foreach(Db::getInstance()->executeS('SELECT id_product FROM '._DB_PREFIX_.'product') as $row){$p=new Product((int)$row['id_product']);$p->delete();}
 foreach(Db::getInstance()->executeS('SELECT id_category FROM '._DB_PREFIX_.'category WHERE id_category>2 ORDER BY level_depth DESC') as $row){$c=new Category((int)$row['id_category']);$c->delete();}
 Configuration::updateValue('CT_CATALOG_INITIALIZED',1);
}
$categories=[];
foreach($catalog['products'] as $p){
 if(!isset($categories[$p['category']])){
  $existing=Db::getInstance()->getValue('SELECT c.id_category FROM '._DB_PREFIX_."category c JOIN "._DB_PREFIX_."category_lang cl ON c.id_category=cl.id_category WHERE cl.name='".pSQL($p['category'])."' AND cl.id_lang=$lang AND c.id_parent=2");
  if($existing)$categories[$p['category']]=(int)$existing;
  else{$c=new Category();$c->name=localized($p['category']);$c->link_rewrite=localized(strtolower($p['category']));$c->id_parent=2;$c->active=1;$c->add();$categories[$p['category']]=$c->id;}
 }
 $id=(int)Db::getInstance()->getValue('SELECT id_product FROM '._DB_PREFIX_."product WHERE reference='".pSQL($p['sku'])."'");
 $product=$id?new Product($id):new Product();
 $product->name=localized($p['name']);$product->link_rewrite=localized($p['slug']);$product->reference=$p['sku'];
 $product->description=localized('<p>'.htmlspecialchars($p['description']).'</p>');$product->description_short=localized('<p>'.htmlspecialchars($p['short_description']).'</p>');
 $product->price=$p['price'];$product->id_tax_rules_group=0;$product->active=1;$product->available_for_order=1;$product->show_price=1;
 $product->id_category_default=$categories[$p['category']];$product->visibility='both';$product->weight=$p['weight_kg'];
 $product->condition='new';$product->minimal_quantity=1;$product->save();
 $product->updateCategories([2,$categories[$p['category']]]);
 StockAvailable::setQuantity($product->id,0,$p['stock'],1);StockAvailable::setProductOutOfStock($product->id,0,1);
 $images=Image::getImages($lang,$product->id);
 if(!$images){
  $image=new Image();$image->id_product=$product->id;$image->position=1;$image->cover=1;$image->legend=localized($p['name']);$image->add();
  $path=$image->getPathForCreation();$source='/catalog/'.$p['image'];
  ImageManager::resize($source,$path.'.jpg');
  foreach(ImageType::getImagesTypes('products') as $type)ImageManager::resize($source,$path.'-'.stripslashes($type['name']).'.jpg',(int)$type['width'],(int)$type['height']);
 }
 SpecificPrice::deleteByProductId($product->id);
 if($p['sale_price']!==null){$s=new SpecificPrice();$s->id_product=$product->id;$s->id_shop=1;$s->id_currency=0;$s->id_country=0;$s->id_group=0;$s->id_customer=0;$s->price=-1;$s->from_quantity=1;$s->reduction=$p['price']-$p['sale_price'];$s->reduction_type='amount';$s->reduction_tax=0;$s->from='0000-00-00 00:00:00';$s->to='0000-00-00 00:00:00';$s->add();}
 echo $p['sku'].' '.$p['name']."\n";
}
// Keep this storefront focused on its own 30 products.
foreach(['ps_imageslider','ps_banner','ps_customtext','ps_specials','ps_newproducts','ps_bestsellers','ps_supplierlist','ps_brandlist','ps_emailsubscription','blockwishlist','productcomments','blockreassurance','ps_sharebuttons'] as $name){$m=Module::getInstanceByName($name);if($m&&$m->active)$m->disable();}
Configuration::updateValue('HOME_FEATURED_NBR',30);
Configuration::updateValue('HOME_FEATURED_CAT',2);
Configuration::updateValue('HOME_FEATURED_RANDOMIZE',false);
$menu=Module::getInstanceByName('ps_mainmenu');
if($menu)Configuration::updateValue('MOD_BLOCKTOPMENU_ITEMS',implode(',',array_map(fn($id)=>'CAT'.$id,$categories)));
$check=Module::getInstanceByName('ps_checkpayment');if($check&&!$check->active)$check->enable();
Configuration::updateValue('CHEQUE_NAME','Common Thread demo');Configuration::updateValue('CHEQUE_ADDRESS','Local demonstration order. No payment is collected.');
Search::indexation(true);
Tools::generateHtaccess();
Tools::clearAllCache();
echo 'PrestaShop: '.count($catalog['products'])." products seeded.\n";
