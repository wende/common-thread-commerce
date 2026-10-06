// Read and validation checks only: this script never sends a basket mutation.
(async () => {
  const bridge = window.glovoBridge, checks = [];
  const check = (name, condition) => { if (!condition) throw new Error(`Check failed: ${name}`); checks.push(name); };
  const info = bridge.inspect();
  check('Expected store', info.store.slug === 'mcdonald-s-kra');
  const search = bridge.searchProducts('McDouble');
  check('Deduplicated product IDs', search.total === 1 && search.products[0].attributeGroups.length === 0);
  check('Case insensitive search', bridge.searchProducts('mcdouble').products[0].id === search.products[0].id);
  check('Diacritic tolerant search', bridge.searchProducts('frytki male').total > 0);
  check('Empty search result', bridge.searchProducts('no-such-product-851bc').total === 0);
  const all = bridge.searchProducts({ query: '', limit: 1 });
  check('Search limit and hasMore', all.products.length === 1 && all.total > 1 && all.hasMore);
  const coffee = bridge.searchProducts('Caramel Latte').products[0];
  check('Required option metadata', coffee.attributeGroups.length === 1 && coffee.attributeGroups[0].min === 1);
  async function rejected(name, input, expected) {
    let error; try { await bridge.addToBasket(input); } catch (failure) { error = failure; }
    check(name, !!error && error.message.includes(expected));
  }
  await rejected('Unknown product rejected', { productId: 'no-such-product-851bc' }, 'not in the current');
  await rejected('Zero quantity rejected', { productId: search.products[0].id, quantity: 0 }, 'Quantity must');
  await rejected('Fractional quantity rejected', { productId: search.products[0].id, quantity: 1.5 }, 'Quantity must');
  await rejected('Missing required option rejected', { productId: coffee.id }, 'Choose 1–1');
  await rejected('Unknown option rejected', { productId: coffee.id, choices: [{ groupId: 'bad', attributeId: 'bad' }] }, 'not valid');
  const group = coffee.attributeGroups[0];
  await rejected('Group maximum enforced', { productId: coffee.id, choices: group.attributes.map(attribute => ({ groupId: group.id, attributeId: attribute.id })) }, 'Choose 1–1');
  await rejected('Duplicate option rejected', { productId: coffee.id, choices: Array(2).fill({ groupId: group.id, attributeId: group.attributes[0].id }) }, 'more than once');
  check('Validation never starts a mutation', bridge.inspect().mutationPending === false);
  return JSON.stringify({ passed: checks.length, checks, loadedProducts: all.total, mutationSent: false });
})()
