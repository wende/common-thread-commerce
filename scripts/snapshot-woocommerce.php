<?php
$products=wc_get_products(['limit'=>-1,'status'=>'publish','orderby'=>'sku','order'=>'ASC']);$rows=[];
foreach($products as $p){$cats=wp_get_post_terms($p->get_id(),'product_cat',['fields'=>'names']);$rows[]=['sku'=>$p->get_sku(),'name'=>$p->get_name(),'category'=>$cats[0]??'','price'=>(float)$p->get_regular_price(),'effective_price'=>(float)$p->get_price(),'stock'=>(int)$p->get_stock_quantity(),'has_image'=>(bool)$p->get_image_id()];}
echo json_encode(['platform'=>'woocommerce','version'=>WC_VERSION,'products'=>$rows])."\n";
