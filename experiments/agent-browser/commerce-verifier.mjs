// Controller-only assertions. Workers receive no selectors or site-specific hints.
import { readFile } from 'node:fs/promises';
const catalog=JSON.parse(await readFile(new URL('../../catalog/products.json',import.meta.url),'utf8')).products;
export async function verifyCommerceCart(page,target){
  const expected=target.cart;
  const url=new URL(page.url());
  const cartPage=url.origin===new URL(target.url).origin&&
    (target.name==='magento'?/^\/checkout\/cart(?:\/|$)/.test(url.pathname):/^\/cart(?:\/|$)/.test(url.pathname));
  if(!cartPage)return {ok:false,reason:'Leave the full shopping cart page open.',url:page.url()};
  let container;
  if(target.name==='woocommerce')container=page.getByRole('table',{name:'Products in cart',exact:true});
  else if(target.name==='magento')container=page.getByRole('table',{name:'Shopping Cart Items',exact:true});
  else if(target.name==='prestashop')container=page.locator('.cart-items');
  else throw new Error('Unsupported commerce target '+target.name);
  if(await container.count()!==1||!await container.isVisible())return {ok:false,reason:'Cart item container is not visible.'};
  const observed=await container.evaluate((element)=>{
    const quantities=Array.from(element.querySelectorAll('input[type="number"]'));
    return {text:element.innerText,lines:quantities.map(input=>{
      const row=input.closest('tr,li.cart-item');
      return {quantity:Number(input.value),text:row?.innerText||''};
    })};
  });
  const heading=await page.getByRole('heading',{name:target.name==='woocommerce'?'Cart':'Shopping Cart',exact:true}).isVisible();
  if(expected.distinctItems){
    const items=observed.lines.map(line=>{
      const product=catalog.find(p=>line.text.includes(p.name));
      const price=product?.sale_price??product?.price;
      return {name:product?.name||null,sku:product?.sku||null,quantity:line.quantity,unitPrice:price??null,category:product?.category||null,discounted:Boolean(product?.sale_price),inStock:Boolean(product?.stock>0),priceVisible:price!==undefined&&line.text.includes('$'+price.toFixed(2))};
    });
    const ok=heading&&items.length===expected.distinctItems&&new Set(items.map(x=>x.name)).size===expected.distinctItems&&items.every(x=>x.name&&x.inStock&&x.priceVisible&&x.quantity===(expected.quantityPerItem||1));
    return {ok,cartPage,observed,items,merchandiseSubtotal:Math.round(items.reduce((s,x)=>s+(x.unitPrice||0)*x.quantity,0)*100)/100,expected:{distinctItems:expected.distinctItems,quantityPerItem:expected.quantityPerItem||1}};
  }
  const unitPrice='$'+expected.unitPrice.toFixed(2),subtotal='$'+(expected.unitPrice*expected.quantity).toFixed(2);
  const line=observed.lines[0];
  return {ok:heading&&observed.lines.length===1&&line.quantity===expected.quantity&&line.text.includes(expected.product)&&line.text.includes(unitPrice)&&line.text.includes(subtotal),observed,expected:{product:expected.product,quantity:expected.quantity,unitPrice,subtotal},cartPage};
}
