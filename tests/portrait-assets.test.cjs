const { test } = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./support/app-fixture.cjs');

test('page portraits are publicly served as PNG images', async t => {
  const { client } = await fixture(t);
  const guest = client();
  for (const image of ['analyst_jannick.png', 'lucas.png', 'oscar.png']) {
    const response = await guest.call(`/images/${image}`, { raw: true });
    assert.equal(response.status, 200, image);
    assert.ok(response.data.startsWith('\uFFFDPNG\r\n\u001a\n'), `${image} has a PNG signature`);
  }
});
