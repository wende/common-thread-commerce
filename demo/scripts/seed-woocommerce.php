<?php
if (!class_exists('WooCommerce')) { throw new RuntimeException('WooCommerce must be active.'); }
require_once ABSPATH . 'wp-admin/includes/image.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
$catalog = json_decode(file_get_contents('/catalog/products.json'), true, 512, JSON_THROW_ON_ERROR);
update_option('blogname', 'Common Thread');
update_option('blogdescription', 'Everyday essentials. Thoughtfully chosen.');
update_option('woocommerce_currency', 'USD');
update_option('woocommerce_default_country', 'US:CA');
update_option('woocommerce_calc_taxes', 'no');
update_option('woocommerce_enable_reviews', 'no');
update_option('woocommerce_hide_out_of_stock_items', 'no');
update_option('woocommerce_store_address', '100 Example Avenue');
update_option('woocommerce_store_city', 'San Francisco');
update_option('woocommerce_store_postcode', '94103');
update_option('woocommerce_onboarding_profile', ['completed' => true, 'skipped' => true]);
update_option('woocommerce_store_pages', ['shop']);
update_option('woocommerce_cod_settings', ['enabled'=>'yes','title'=>'Pay on delivery (demo)','description'=>'Local demonstration order. No payment is collected.','enable_for_virtual'=>'yes']);
update_option('woocommerce_coming_soon', 'no');
update_option('woocommerce_store_visibility', 'live');
WC_Install::create_pages();
$shop_id = (int) get_option('woocommerce_shop_page_id');
wp_update_post(['ID'=>$shop_id,'post_title'=>'The collection']);
update_option('show_on_front', 'page');
update_option('page_on_front', $shop_id);
update_option('permalink_structure', '/%postname%/');
$category_ids=[];
foreach ($catalog['products'] as $p) {
 if (!isset($category_ids[$p['category']])) {
  $term = term_exists($p['category'], 'product_cat');
  if (!$term) $term = wp_insert_term($p['category'], 'product_cat');
  $category_ids[$p['category']] = (int) $term['term_id'];
 }
 $id = wc_get_product_id_by_sku($p['sku']);
 // Migrate only known numbered filler records, preserving native IDs.
 if (!$id && $p['id'] > 30) $id = wc_get_product_id_by_sku(sprintf('CT-NOISE-%04d', $p['id'] - 30));
 $product = $id ? wc_get_product($id) : new WC_Product_Simple();
 $product->set_name($p['name']); $product->set_slug($p['slug']); $product->set_sku($p['sku']);
 $product->set_description($p['description']); $product->set_short_description($p['short_description']);
 $product->set_status('publish'); $product->set_catalog_visibility('visible');
 $product->set_regular_price((string)$p['price']);
 $product->set_sale_price($p['sale_price'] !== null ? (string)$p['sale_price'] : '');
 $product->set_price((string)($p['sale_price'] ?? $p['price']));
 $product->set_manage_stock(true); $product->set_stock_quantity($p['stock']);
 $product->set_stock_status($p['stock'] ? 'instock':'outofstock');
 $product->set_weight((string)$p['weight_kg']); $product->set_category_ids([$category_ids[$p['category']]]);
 $product->set_reviews_allowed(false);
 $attachment_id=0;
 if (!empty($p['image'])) {
  $attachment_id=(int)get_option('ct_image_'.basename($p['image']));
  if (!$attachment_id || !get_post($attachment_id)) {
   $tmp=wp_tempnam(basename($p['image']));copy('/catalog/'.$p['image'],$tmp);
   $attachment_id=media_handle_sideload(['name'=>basename($p['image']),'tmp_name'=>$tmp],0);
   if(is_wp_error($attachment_id)) throw new RuntimeException($attachment_id->get_error_message());
   update_option('ct_image_'.basename($p['image']),$attachment_id);
  }
 }
 $product->set_image_id($attachment_id); $product->save();
 echo $p['sku'].' '.$p['name']."\n";
}
$menu=wp_get_nav_menu_object('Collection');$menu_id=$menu?$menu->term_id:wp_create_nav_menu('Collection');
$existing=wp_get_nav_menu_items($menu_id)?:[];
if (!$existing) {
 wp_update_nav_menu_item($menu_id,0,['menu-item-title'=>'Shop all','menu-item-object'=>'page','menu-item-object-id'=>$shop_id,'menu-item-type'=>'post_type','menu-item-status'=>'publish']);
 foreach($category_ids as $name=>$id)wp_update_nav_menu_item($menu_id,0,['menu-item-title'=>$name,'menu-item-object'=>'product_cat','menu-item-object-id'=>$id,'menu-item-type'=>'taxonomy','menu-item-status'=>'publish']);
}
set_theme_mod('nav_menu_locations',['primary'=>$menu_id,'handheld'=>$menu_id]);
set_theme_mod('storefront_header_background_color','#132c3b');
set_theme_mod('storefront_header_text_color','#ffffff');
set_theme_mod('storefront_header_link_color','#ffffff');
set_theme_mod('storefront_accent_color','#136e73');
set_theme_mod('storefront_button_background_color','#136e73');
set_theme_mod('storefront_button_text_color','#ffffff');
$zone = new WC_Shipping_Zone(0);
$methods=$zone->get_shipping_methods();
if(!$methods) {
 $instance=$zone->add_shipping_method('flat_rate');
 update_option('woocommerce_flat_rate_'.$instance.'_settings',['title'=>'Standard shipping','tax_status'=>'none','cost'=>'5']);
}
$sample = get_post(1);
if ($sample && $sample->post_type === 'post' && $sample->post_title === 'Hello world!') {
 wp_delete_post(1,true);
}
flush_rewrite_rules();
echo 'WooCommerce: '.count($catalog['products'])." products seeded.\n";
