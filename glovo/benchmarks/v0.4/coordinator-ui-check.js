(() => {
  const element = [...document.querySelectorAll('[class*="StoreCart_cartContent"], [data-testid="store-cart"]')]
    .find(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
  return JSON.stringify({ url: location.href, adapterAbsent: typeof window.glovoBridge === 'undefined',
    nativeBasketFound: !!element, nativeBasketText: element?.innerText || '',
    nativeImageCount: element?.querySelectorAll('img[alt]').length ?? null,
    nativeRemoveButtons: element?.querySelectorAll('button[aria-label="Remove item"], button[aria-label="Decrease quantity"]').length ?? null,
    capturedAt: new Date().toISOString() });
})()
