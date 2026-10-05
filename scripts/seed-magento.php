<?php
use Magento\Framework\App\Bootstrap;
require '/var/www/html/app/bootstrap.php';
$bootstrap=Bootstrap::create(BP,$_SERVER);$om=$bootstrap->getObjectManager();
try{$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');}catch(\Magento\Framework\Exception\LocalizedException $e){}
$om->get(\Magento\Store\Model\StoreManagerInterface::class)->setCurrentStore(0);
$catalog=json_decode(file_get_contents('/catalog/products.json'),true,512,JSON_THROW_ON_ERROR);
$categoryFactory=$om->get(\Magento\Catalog\Model\CategoryFactory::class);
$categoryRepository=$om->get(\Magento\Catalog\Api\CategoryRepositoryInterface::class);
$existing=$categoryFactory->create()->getCollection()->addAttributeToSelect('name')->addAttributeToFilter('parent_id',2);
$categories=[];foreach($existing as $c)$categories[$c->getName()]=$c->getId();
$names=array_merge(['Collection'],array_values(array_unique(array_column($catalog['products'],'category'))));
foreach($names as $pos=>$name){
 if(!isset($categories[$name])){
  $c=$categoryFactory->create();$c->setStoreId(0)->setName($name)->setIsActive(true)->setIncludeInMenu(true)->setParentId(2)->setPath('1/2')->setPosition($pos+1)->setUrlKey(strtolower($name))->setDisplayMode('PRODUCTS');
  $categoryRepository->save($c);$categories[$name]=$c->getId();
 }
 // Persist the complete hierarchy through the native category resource model.
 $c=$categoryFactory->create()->setStoreId(0)->load((int)$categories[$name]);
 $c->setPath('1/2/'.$c->getId())->setLevel(2)->setParentId(2)->setIsActive(1)->setIncludeInMenu(1)->save();
}
$factory=$om->get(\Magento\Catalog\Model\ProductFactory::class);
$repo=$om->get(\Magento\Catalog\Api\ProductRepositoryInterface::class);
$setId=(int)$om->get(\Magento\Eav\Model\Config::class)->getEntityType('catalog_product')->getDefaultAttributeSetId();
$stockRegistry=$om->get(\Magento\CatalogInventory\Api\StockRegistryInterface::class);
foreach($catalog['products'] as $p){
 try{$product=$repo->get($p['sku'],false,0,true);}catch(\Magento\Framework\Exception\NoSuchEntityException $e){$product=$factory->create();$product->setSku($p['sku']);}
 $product->setStoreId(0)->setAttributeSetId($setId)->setTypeId('simple')->setName($p['name'])->setUrlKey($p['slug'])->setStatus(1)->setVisibility(4)->setPrice($p['price'])->setWeight($p['weight_kg'])->setTaxClassId(0)->setDescription($p['description'])->setShortDescription($p['short_description'])->setWebsiteIds([1])->setCategoryIds([$categories['Collection'],$categories[$p['category']]]);
 $product->setSpecialPrice($p['sale_price']);$product->setSpecialFromDate(null);$product->setSpecialToDate(null);
 $product->setStockData(['use_config_manage_stock'=>0,'manage_stock'=>1,'is_in_stock'=>$p['stock']>0,'qty'=>$p['stock']]);
 if(!$product->getId() || !$product->getImage() || $product->getImage()==='no_selection'){
  $importDir=BP.'/pub/media/import';if(!is_dir($importDir))mkdir($importDir,0775,true);
  $target=$importDir.'/ct-'.basename($p['image']);copy('/catalog/'.$p['image'],$target);
  $product->addImageToMediaGallery($target,['image','small_image','thumbnail'],false,false);
 }
 $product=$repo->save($product);
 $stock=$stockRegistry->getStockItemBySku($p['sku']);$stock->setQty($p['stock'])->setIsInStock($p['stock']>0);$stockRegistry->updateStockItemBySku($p['sku'],$stock);
 if(interface_exists(\Magento\InventoryApi\Api\SourceItemsSaveInterface::class)){
  $item=$om->get(\Magento\InventoryApi\Api\Data\SourceItemInterfaceFactory::class)->create();$item->setSku($p['sku']);$item->setSourceCode('default');$item->setQuantity($p['stock']);$item->setStatus($p['stock']>0?1:0);
  $om->get(\Magento\InventoryApi\Api\SourceItemsSaveInterface::class)->execute([$item]);
 }
 echo $p['sku'].' '.$p['name']."\n";
}
$page=$om->get(\Magento\Cms\Model\PageFactory::class)->create()->load('home','identifier');
$page->setTitle('Common Thread — The collection')->setIdentifier('home')->setIsActive(1)->setStores([0])->setPageLayout('1column')->setContentHeading('')->setContent('<style>.ct-intro{padding:24px 0 30px;border-bottom:1px solid #ddd;margin-bottom:30px}.ct-intro h1{font-size:36px;font-weight:500;margin-bottom:12px}.ct-intro p{font-size:16px;max-width:640px}.block.widget .products-grid .product-item{width:24%!important;margin-left:0!important;padding:0 12px!important}.product-item-name{font-size:16px}.page-wrapper{font-size:16px}@media(max-width:767px){.block.widget .products-grid .product-item{width:49%!important}.ct-intro h1{font-size:28px}}</style><div class="ct-intro"><h1>Everyday, considered.</h1><p>A collection of 30 easy-wearing essentials. Find your next favorite from Common Thread.</p></div>{{widget type="Magento\\CatalogWidget\\Block\\Product\\ProductsList" title="The collection" show_pager="1" products_per_page="30" products_count="30" conditions_encoded="[]" template="Magento_CatalogWidget::product/widget/content/grid.phtml"}}');
$page->save();
$writer=$om->get(\Magento\Framework\App\Config\Storage\WriterInterface::class);
foreach([
 'web/default/cms_home_page'=>'home','general/store_information/name'=>'Common Thread','general/store_information/country_id'=>'US',
 'design/header/welcome'=>'Everyday essentials','design/head/default_title'=>'Common Thread','design/header/logo_alt'=>'Common Thread','design/footer/copyright'=>'Common Thread · Magento Open Source demo',
 'catalog/frontend/list_per_page'=>'12,24,30','catalog/frontend/grid_per_page'=>'12,24,30','catalog/frontend/grid_per_page_values'=>'12,24,30','catalog/frontend/grid_per_page'=>30,
 'cataloginventory/options/show_out_of_stock'=>1,'catalog/review/active'=>0,'payment/checkmo/active'=>1,'payment/checkmo/title'=>'Demo payment — no money collected','payment/checkmo/payable_to'=>'Common Thread demo','payment/checkmo/mailing_address'=>'Local test order only.',
 'carriers/flatrate/active'=>1,'carriers/flatrate/price'=>5,'carriers/flatrate/type'=>'O','carriers/flatrate/title'=>'Standard shipping','carriers/flatrate/name'=>'Flat rate',
 'design/theme/theme_id'=>3,
] as $path=>$value)$writer->save($path,$value);
$themes=$om->get(\Magento\Theme\Model\ResourceModel\Theme\CollectionFactory::class)->create()->addFieldToFilter('theme_path','Magento/luma');
if($themes->getFirstItem()->getId())$writer->save('design/theme/theme_id',$themes->getFirstItem()->getId());
$media=BP.'/pub/media/logo/stores/1';if(!is_dir($media))mkdir($media,0775,true);
file_put_contents($media.'/common-thread.svg','<svg xmlns="http://www.w3.org/2000/svg" width="280" height="45" viewBox="0 0 280 45"><text x="0" y="32" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="#153442">Common Thread</text></svg>');
$writer->save('design/header/logo_src','stores/1/common-thread.svg');$writer->save('design/header/logo_width',280);$writer->save('design/header/logo_height',45);
echo 'Magento: '.count($catalog['products'])." products seeded.\n";
