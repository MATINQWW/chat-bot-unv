// Standalone server regression tests. No network services or third-party packages are required.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const server = require('../server');

(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET') => fetch(base + path, { method, headers: { Connection: 'close' }, redirect: 'manual' });

  try {
    let response = await request('/health/live');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });

    response = await request('/api/not-a-real-endpoint');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });

    response = await fetch(base + '/api/admin-users', { method: 'PUT', headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: '{invalid' });
    assert.equal(response.status, 400, 'PUT JSON bodies must be parsed and rejected when malformed');
    response = await fetch(base + '/api/admin-users', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: '{invalid' });
    assert.equal(response.status, 400, 'DELETE JSON bodies must be parsed and rejected when malformed');

    response = await request('/%E0%A4%A');
    assert.equal(response.status, 400, 'malformed percent-encoding must not crash the request handler');

    response = await request('/..%2f.env');
    assert.ok([302, 404].includes(response.status), 'private files must not be served');

    response = await request('/', 'HEAD');
    assert.equal(response.status, 200);
    assert.ok(Number(response.headers.get('content-length')) > 1000);

    response = await request('/does-not-exist.js');
    assert.equal(response.status, 404);

    const externalLink = path.join(__dirname, '..', 'test-external-link.txt');
    try {
      await fs.symlink('/etc/passwd', externalLink);
      response = await request('/test-external-link.txt');
      assert.equal(response.status, 404, 'a public symlink must not expose files outside the project');
    } finally {
      await fs.unlink(externalLink).catch(() => {});
    }

    console.log('✓ live health endpoint');
    console.log('✓ unknown API route returns JSON 404');
    console.log('✓ JSON request bodies are parsed for PUT and DELETE');
    console.log('✓ malformed URL is handled as 400');
    console.log('✓ dotfiles remain inaccessible');
    console.log('✓ HEAD and static path handling');
    console.log('✓ static symlinks cannot expose files outside the project root');
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
