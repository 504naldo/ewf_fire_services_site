'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'canonical.js'), 'utf8');

function run(href, blocked = false) {
  const calls = [];
  const window = { location: new URL(href) };
  window.history = {
    state: { preserved: true },
    replaceState(state, title, value) {
      if (blocked) throw new Error('History unavailable');
      calls.push({ state, value });
      window.location = new URL(value, window.location);
    }
  };
  vm.runInNewContext(code, { window, URL });
  return { window, calls };
}

test('all HTML aliases share a clean GA location without losing campaign or form parameters', () => {
  const pages = ['index', 'fire-alarm-systems', 'sprinkler-systems', 'backflow-testing',
    'smoke-control-systems', 'emergency-lighting', 'fire-extinguishers', 'privacy-policy', 'thank-you'];
  for (const page of pages) {
    const suffix = '?utm_source=email&service=sprinkler&request=prv-service#contact';
    const { window, calls } = run('https://ewfservices.ca/' + page + '.html' + suffix);
    const expected = 'https://ewfservices.ca/' + (page === 'index' ? '' : page) + suffix;
    assert.equal(window.location.href, expected);
    assert.equal(window.ewfAnalyticsPage.page_location, expected);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].state.preserved, true);
  }
});

test('canonical URLs are unchanged and unknown paths are not rewritten', () => {
  for (const pathname of ['/', '/fire-alarm-systems', '/unrelated.html']) {
    const url = 'https://ewfservices.ca' + pathname;
    const { window, calls } = run(url);
    assert.equal(window.location.href, url);
    assert.equal(calls.length, 0);
  }
});

test('history failure still gives GA a canonical location without the return token', () => {
  const href = 'https://ewfservices.ca/thank-you.html?enquiry_return=' + 'a'.repeat(32) + '&utm_source=email';
  const { window } = run(href, true);
  assert.equal(window.location.href, href);
  assert.equal(window.ewfAnalyticsPage.page_location, 'https://ewfservices.ca/thank-you?utm_source=email');
});

test('normalization stays on the current origin and is inactive for file previews', () => {
  assert.equal(run('http://localhost:8080/index.html').window.location.href, 'http://localhost:8080/');
  const f = run('file:///tmp/index.html');
  assert.equal(f.calls.length, 0);
  assert.equal(f.window.ewfAnalyticsPage, undefined);
});

test('every HTML page consumes return metadata then normalizes before GA initializes', () => {
  for (const file of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const enquiry = html.indexOf('<script src="/enquiry.js"></script>');
    const canonical = html.indexOf('<script src="/canonical.js"></script>');
    const ga = html.indexOf("gtag('config'");
    assert.ok(enquiry > 0 && canonical > enquiry && ga > canonical, file);
    assert.ok(html.includes("gtag('config', 'G-9ZJPP9CTGQ', window.ewfAnalyticsPage || {});"), file);
  }
});
