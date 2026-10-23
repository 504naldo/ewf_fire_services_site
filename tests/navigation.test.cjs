'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'nav.js'), 'utf8');

function fixture(options = {}) {
  const classes = new Set(['js']);
  const navClasses = new Set();
  const handlers = {};
  const attributes = {};
  let focused = null;
  const summary = { focus() { focused = 'services'; } };
  const services = { open: false, querySelector: () => summary };
  const icon = { className: 'fa-solid fa-bars' };
  const link = { addEventListener(type, fn) { handlers.link = fn; } };
  const toggle = {
    setAttribute(name, value) { attributes[name] = value; },
    querySelector: () => icon,
    contains: target => target === toggle,
    focus() { focused = 'toggle'; },
    addEventListener(type, fn) { handlers.toggle = fn; }
  };
  const nav = {
    classList: {
      contains: value => navClasses.has(value),
      toggle(value, active) { if (active) navClasses.add(value); else navClasses.delete(value); }
    },
    querySelector: () => services,
    querySelectorAll: () => [link],
    contains: target => target === nav || target === link
  };
  const document = {
    documentElement: { classList: { add: value => classes.add(value) } },
    querySelector: () => options.missingToggle ? null : toggle,
    getElementById: () => nav,
    addEventListener(type, fn) {
      if (options.failRegistration && type === 'keydown') throw new Error('Registration failed');
      handlers[type] = fn;
    }
  };
  const media = options.legacyMedia
    ? { addListener(fn) { handlers.resize = fn; } }
    : { addEventListener(type, fn) { handlers.resize = fn; } };
  return {
    classes, navClasses, handlers, attributes, services, link, toggle,
    focused: () => focused,
    run: () => vm.runInNewContext(code, { document, window: { matchMedia: () => media } })
  };
}

test('navigation only becomes collapsible after successful initialization', () => {
  const ready = fixture();
  ready.run();
  assert.equal(ready.classes.has('nav-ready'), true);
  assert.equal(ready.attributes['aria-expanded'], 'false');
  assert.equal(ready.navClasses.has('open'), false);

  const failed = fixture({ failRegistration: true });
  assert.throws(failed.run, /Registration failed/);
  assert.equal(failed.classes.has('js'), true);
  assert.equal(failed.classes.has('nav-ready'), false);

  const missing = fixture({ missingToggle: true });
  missing.run();
  assert.equal(missing.classes.has('nav-ready'), false);
});

test('menu controls retain click, Escape, outside click and focus behavior', () => {
  const f = fixture(); f.run();
  f.handlers.toggle();
  assert.equal(f.navClasses.has('open'), true);
  assert.equal(f.attributes['aria-expanded'], 'true');
  f.services.open = true;
  f.handlers.keydown({ key: 'Escape' });
  assert.equal(f.services.open, false);
  assert.equal(f.focused(), 'services');
  assert.equal(f.navClasses.has('open'), true);
  f.handlers.keydown({ key: 'Escape' });
  assert.equal(f.navClasses.has('open'), false);
  assert.equal(f.focused(), 'toggle');
  f.handlers.toggle(); f.handlers.click({ target: {} });
  assert.equal(f.navClasses.has('open'), false);
  f.handlers.toggle(); f.handlers.link();
  assert.equal(f.navClasses.has('open'), false);
});

test('viewport transitions close navigation with both modern and legacy MediaQueryList', () => {
  for (const legacyMedia of [false, true]) {
    const f = fixture({ legacyMedia }); f.run();
    assert.equal(f.classes.has('nav-ready'), true);
    f.handlers.toggle(); f.services.open = true; f.handlers.resize();
    assert.equal(f.navClasses.has('open'), false);
    assert.equal(f.services.open, false);
    assert.equal(f.attributes['aria-expanded'], 'false');
  }
});
