const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

async function run() {
  const { Catalog } = require(path.join(process.argv[2], 'dist-electron/library.js'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lpv-packaged-'));
  const catalog = new Catalog(root, () => {});
  await catalog.openProject(process.argv[3]);
  const photo = catalog.library.photos.find(p => p.rawPath);
  const inspected = await catalog.inspect(photo.id);
  assert.equal(inspected.kind, 'RAW decoded', inspected.warning);
  assert(inspected.width > 1000);
  console.log('Packaged RAW decode passed:', inspected.width, inspected.height);
  const result = await catalog.rerank();
  assert.equal(result.report.errors.length, 0);
  assert.equal(result.report.completed, catalog.library.photos.length);
  console.log('Packaged offline ranking passed');
  const suggested = await catalog.suggest(1, 0.7);
  assert.equal(suggested.length, 1);
  console.log('Packaged background selection passed');
  console.log('Temporary test data:', root);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
