const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');

const window = {
  location: new URL('https://2.tvaity.ru/reg-short/?utm_source=default'),
  document: { referrer: 'https://example.com/ad' },
};
runInNewContext(readFileSync(resolve(__dirname, '../short-land/gc-tracking.js'), 'utf8'),
  { window, URL, URLSearchParams });
const build = (href, base = 'https://my.tvaity.ru/pl/lite/widget/widget?id=1657350', extra = {}) =>
  new URL(window.GcTracking.withTrackingParams(base, { currentHref: href, ...extra }));

test('collects every utm_* and ref case-insensitively from the supplied page URL', () => {
  const url = build('https://2.tvaity.ru/reg/?UTM_Source=VK&utm_New=custom&ReF=partner&id=wrong&loc=wrong');
  assert.equal(url.searchParams.get('utm_source'), 'VK');
  assert.equal(url.searchParams.get('utm_new'), 'custom');
  assert.equal(url.searchParams.get('ref'), 'partner');
  assert.equal(url.searchParams.get('id'), '1657350');
  assert.equal(url.searchParams.getAll('id').length, 1);
  assert.equal(url.searchParams.get('loc'), 'https://2.tvaity.ru/reg/?UTM_Source=VK&utm_New=custom&ReF=partner&id=wrong&loc=wrong');
  assert.equal(url.searchParams.has('UTM_Source'), false);
});

test('keeps all duplicate tracking values but removes stale target values in any case', () => {
  const url = build('https://2.tvaity.ru/?UTM_source=first&utm_source=second&ref=',
    'https://my.tvaity.ru/pl/lite/widget/widget?id=1657552&UTM_SOURCE=stale&ref=stale');
  assert.deepEqual(url.searchParams.getAll('utm_source'), ['first', 'second']);
  assert.equal(url.searchParams.has('UTM_SOURCE'), false);
  assert.equal(url.searchParams.get('ref'), '');
  assert.equal(url.searchParams.get('id'), '1657552');
});

test('preserves spaces, Cyrillic, literal plus, ampersands and fragments without double encoding', () => {
  const href = 'https://2.tvaity.ru/?utm_campaign=' + encodeURIComponent('тест + a&b=#%') + '#form';
  const url = build(href);
  assert.equal(url.searchParams.get('utm_campaign'), 'тест + a&b=#%');
  assert.equal(url.searchParams.get('loc'), href);
  assert.equal(url.search.includes('+'), false);
  assert.equal(url.search.includes('%20'), true);
});

test('uses the current browser URL by default and supports an explicit search override', () => {
  const base = 'https://my.tvaity.ru/pl/lite/widget/widget?id=1657350';
  assert.equal(new URL(window.GcTracking.withTrackingParams(base)).searchParams.get('utm_source'), 'default');
  assert.equal(build('https://2.tvaity.ru/?utm_source=page', base, {search:'?utm_source=override'}).searchParams.get('utm_source'), 'override');
});

test('preserves service parameters and only falls back to the document referrer when ref is absent', () => {
  const url = build('https://2.tvaity.ru/', 'https://my.tvaity.ru/pl/lite/widget/widget?id=1657350&_t=123',
    {clrtQueryData:{campaign:'ads'}});
  assert.equal(url.searchParams.get('ref'), window.document.referrer);
  assert.equal(url.searchParams.get('_t'), '123');
  assert.equal(url.searchParams.get('clrtQueryData'), '{"campaign":"ads"}');
  assert.equal(build('https://2.tvaity.ru/?ref=page').searchParams.get('ref'), 'page');
});

test('ignores unrelated query parameters and tolerates circular optional tracking data', () => {
  const circular = {}; circular.self = circular;
  const url = build('https://2.tvaity.ru/?foo=bar&id=wrong&utm_term=test', undefined, {clrtQueryData:circular});
  assert.equal(url.searchParams.has('foo'), false);
  assert.equal(url.searchParams.get('id'), '1657350');
  assert.equal(url.searchParams.get('utm_term'), 'test');
  assert.equal(url.searchParams.has('clrtQueryData'), false);
});
