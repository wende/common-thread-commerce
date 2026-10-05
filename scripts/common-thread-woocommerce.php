<?php
/** Plugin Name: Common Thread demo storefront */
add_filter('loop_shop_per_page',fn()=>30,20);
add_filter('loop_shop_columns',fn()=>4,20);
add_action('wp',function(){ if(is_woocommerce()||is_cart()||is_checkout())remove_action('storefront_sidebar','storefront_get_sidebar',10); });
add_filter('body_class',function($classes){if(is_woocommerce()||is_cart()||is_checkout())$classes[]='storefront-full-width-content';return $classes;});
add_action('woocommerce_archive_description',function(){if(is_shop())echo '<p class="ct-intro">Good pieces for everyday living. Explore 30 essentials from Common Thread.</p>';},5);
add_action('wp_head',function(){echo '<style>.ct-intro{font-size:1.1rem;max-width:48rem}.site-header{padding-top:2rem}.site-branding .site-title{font-size:2rem}.woocommerce-products-header{padding-bottom:1.5rem!important}.products .woocommerce-loop-product__title{font-size:1rem!important}body{font-size:16px}.storefront-breadcrumb{margin-bottom:1.5rem}button,.button{border-radius:3px}</style>';});
