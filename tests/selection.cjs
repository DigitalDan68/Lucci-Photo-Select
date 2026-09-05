const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Catalog } = require('../dist-electron/library');

test('background best-N selection honors rejects without changing flags', async () => {
  const catalog = new Catalog('', () => {});
  catalog.library = { photos: [
    { id: 'a', score: 5, flag: 'reject', signature: [] },
    { id: 'b', score: 4, flag: 'none', signature: [] },
    { id: 'c', score: 3, flag: 'pick', signature: [] },
  ] };
  assert.deepEqual(await catalog.suggest(1, 0), ['b']);
  assert.equal(catalog.library.photos[1].flag, 'none');
  assert.equal(catalog.busy, false);
});

test('background suggestion can be cancelled', async () => {
  const catalog = new Catalog('', () => {});
  catalog.library = { photos: [] };
  const pending = catalog.suggest(100, 1);
  catalog.cancel();
  await assert.rejects(pending, /cancelled/);
  assert.equal(catalog.busy, false);
});
