// lib/core/ticket.js -- a WebSocket URL with the relay's one-shot ticket.
const test = require('node:test');
const assert = require('node:assert/strict');
const { create, ticketUrl, withTicket } = require('../lib/core/ticket.js');

function fakeFetch(answer) {
  const asked = [];
  const fetch = async (u, o) => {
    asked.push([u, o]);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { asked, fetch };
}

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('the ticket is asked of the socket\'s own relay', () => {
  assert.equal(ticketUrl('ws://127.0.0.1:4100/'), 'http://127.0.0.1:4100/ticket');
  assert.equal(ticketUrl('ws://127.0.0.1:4101/pty?name=a'), 'http://127.0.0.1:4101/ticket');
  assert.equal(ticketUrl('wss://localhost:4100/lsp'), 'https://localhost:4100/ticket');
});

test('the ticket joins the query, which is kept', () => {
  assert.equal(withTicket('ws://127.0.0.1:4100/?name=a&id=b', 'T-1_x'),
    'ws://127.0.0.1:4100/?name=a&id=b&ticket=T-1_x');
  assert.equal(withTicket('ws://127.0.0.1:4100/xipe', 'abc'), 'ws://127.0.0.1:4100/xipe?ticket=abc');
});

test('with a ticket: the URL carries it, asked without the cache', async () => {
  const f = fakeFetch(json(200, { ticket: 'abc' }));
  const url = await create(f).url('ws://127.0.0.1:4100/pty');
  assert.equal(url, 'ws://127.0.0.1:4100/pty?ticket=abc');
  assert.deepEqual(f.asked, [['http://127.0.0.1:4100/ticket', { cache: 'no-store' }]]);
});

test('a relay without a secret ({"ticket": null}): the URL as it is', async () => {
  const f = fakeFetch(json(200, { ticket: null }));
  assert.equal(await create(f).url('ws://127.0.0.1:4100/'), 'ws://127.0.0.1:4100/');
});

test('refused (401), down, or not a URL: the URL as it is', async () => {
  assert.equal(await create(fakeFetch(json(401, null))).url('ws://127.0.0.1:4100/'), 'ws://127.0.0.1:4100/');
  assert.equal(await create(fakeFetch(new TypeError('Failed to fetch'))).url('ws://127.0.0.1:4100/lsp'),
    'ws://127.0.0.1:4100/lsp');
  const f = fakeFetch(json(200, { ticket: 'x' }));
  assert.equal(await create(f).url('not a url'), 'not a url');
  assert.equal(f.asked.length, 0);
});
