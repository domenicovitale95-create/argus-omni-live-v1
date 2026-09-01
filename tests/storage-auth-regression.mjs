import assert from 'node:assert/strict';
import { storageConfiguration } from '../api/_report-store.js';

assert.deepEqual(storageConfiguration({}), {
  ready: false,
  mode: 'UNAVAILABLE',
  hasStoreId: false,
  hasOidcToken: false,
  hasReadWriteToken: false,
  missing: ['BLOB_STORE_ID_AND_VERCEL_OIDC_TOKEN_OR_BLOB_READ_WRITE_TOKEN']
});

assert.equal(storageConfiguration({ BLOB_STORE_ID: 'store_example' }).ready, false);
assert.equal(storageConfiguration({ VERCEL_OIDC_TOKEN: 'oidc' }).ready, false);
assert.equal(storageConfiguration({ BLOB_STORE_ID: 'store_example', VERCEL_OIDC_TOKEN: 'oidc' }).mode, 'OIDC');
assert.equal(storageConfiguration({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_example' }).mode, 'READ_WRITE_TOKEN');
assert.equal(storageConfiguration({ BLOB_STORE_ID: 'store_example', VERCEL_OIDC_TOKEN: 'oidc', BLOB_READ_WRITE_TOKEN: 'legacy' }).mode, 'READ_WRITE_TOKEN');

console.log('storage auth regression: ok');
