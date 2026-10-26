'use strict';

// DOM/storage doubles exercise the actual shipped script without a browser,
// network access, Analytics collection, or delivery of a test enquiry.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const code = fs.readFileSync(path.join(__dirname, '..', 'enquiry.js'), 'utf8');
const STORAGE_KEY = 'ewf.enquiry.pending.v1';
const ORIGINAL_NEXT = 'https://ewfservices.ca/thank-you.html';
const NOW = Date.UTC(2026, 9, 14, 18, 0, 0);
const labels = ['', 'Fire Alarm', 'Sprinkler', 'Backflow', 'Smoke Control', 'Emergency Lighting',
  'Fire Extinguishers', 'Multiple Services', 'Emergency / Troubleshooting', 'Not sure'];

function fixture(options = {}) {
  const events = [];
  const documentListeners = {};
  const handlers = {};
  const store = options.store || new Map();
  let now = NOW;
  let location = new URL(options.href || 'https://ewfservices.ca/');
  class Clock extends Date { static now() { return now; } }
  const service = {
    value: options.service || '',
    options: labels.map(value => ({ value })),
    addEventListener: (type, listener) => { handlers['service:' + type] = listener; }
  };
  const request = { value: '', disabled: false };
  const wrapper = { hidden: true };
  const source = { value: '/' };
  const next = { value: ORIGINAL_NEXT };
  const honey = { value: options.honey || '' };
  const offlineNotice = { hidden: true, focus() { this.focused = true; } };
  let prevented = 0;
  const windowListeners = {};
  const inputs = {
    'input[name="source_page"]': source,
    'input[name="_next"]': next,
    'input[name="_honey"]': honey
  };
  const form = {
    action: 'https://formsubmit.co/office@ewandf.ca',
    method: 'POST',
    checkValidity: () => options.valid !== false,
    querySelector: selector => inputs[selector] || null,
    addEventListener: (type, listener) => { handlers[type] = listener; },
    submit: () => assert.fail('Measurement must not submit another request.'),
    requestSubmit: () => assert.fail('Measurement must not submit another request.')
  };
  const nodes = { 'enquiry-form': options.noForm ? null : form, service,
    'request-type': request, 'request-type-field': wrapper, 'enquiry-offline': offlineNotice };
  function guardStorage(operation) {
    if (options.storageThrows === true || options.storageThrows === operation) throw new Error('Storage blocked');
  }
  const sessionStorage = {
    getItem(key) { guardStorage('getItem'); return store.get(key) || null; },
    setItem(key, value) { guardStorage('setItem'); store.set(key, value); },
    removeItem(key) { guardStorage('removeItem'); store.delete(key); }
  };
  const document = {
    readyState: 'loading',
    referrer: options.referrer || '',
    title: 'EWF',
    getElementById: id => nodes[id],
    addEventListener: (type, listener) => { documentListeners[type] = listener; }
  };
  class Link {
    constructor(href) { this.href = href; }
    closest() { return this; }
    getAttribute() { return this.href; }
  }
  const window = {
    location,
    navigator: { onLine: options.online },
    addEventListener: (type, listener) => { windowListeners[type] = listener; },
    history: {
      state: null,
      replaceState(_state, _title, url) {
        if (options.historyThrows) throw new Error('History blocked');
        location = new URL(url, location);
        window.location = location;
      }
    },
    crypto: options.noCrypto ? undefined : webcrypto,
    sessionStorage,
    gtag: options.noTag ? undefined : (...args) => events.push(args)
  };
  vm.runInNewContext(code, {
    window, document, URL, Uint8Array, Element: Link, Date: Clock,
    fetch: () => assert.fail('Measurement must not make a provider request.')
  });
  return {
    events, store, handlers, service, request, wrapper, source, next, honey, form, window,
    offlineNotice, windowListeners, prevented: () => prevented,
    ready: () => documentListeners.DOMContentLoaded(),
    advance: milliseconds => { now += milliseconds; },
    submit: (defaultPrevented = false) => handlers.submit({
      defaultPrevented,
      preventDefault: () => { prevented++; if (window.navigator.onLine !== false) assert.fail('Online submission must remain native.'); }
    }),
    click: href => documentListeners.click({ target: new Link(href) })
  };
}

function submitFixture(options = {}) {
  const f = fixture({ service: 'Sprinkler', referrer: 'https://ewfservices.ca/sprinkler-systems', ...options });
  f.ready();
  f.submit();
  return f;
}

test('allowlisted service links prefill label-valued options and preserve customer edits', () => {
  for (const [slug, label] of [
    ['fire-alarm', 'Fire Alarm'], ['sprinkler', 'Sprinkler'], ['backflow', 'Backflow'],
    ['smoke-control', 'Smoke Control'], ['emergency-lighting', 'Emergency Lighting'],
    ['fire-extinguishers', 'Fire Extinguishers'], ['multiple-services', 'Multiple Services'],
    ['troubleshooting', 'Emergency / Troubleshooting'], ['not-sure', 'Not sure'],
    ['fire-alarm-systems', 'Fire Alarm']
  ]) {
    const f = fixture({ href: 'https://ewfservices.ca/?service=' + slug + '#contact' });
    f.ready();
    assert.equal(f.service.value, label);
  }
  const restored = fixture({ href: 'https://ewfservices.ca/?service=sprinkler', service: 'Backflow' });
  restored.ready();
  assert.equal(restored.service.value, 'Backflow');
});

test('all four sprinkler subtypes prefill and remain editable only for sprinkler enquiries', () => {
  for (const subtype of ['annual-inspection', 'five-year-inspection', 'prv-service', 'deficiency-follow-up']) {
    const f = fixture({ href: 'https://ewfservices.ca/?service=sprinkler&request=' + subtype });
    f.ready();
    assert.equal(f.request.value, subtype);
    assert.equal(f.request.disabled, false);
    assert.equal(f.wrapper.hidden, false);
    f.service.value = 'Backflow';
    f.handlers['service:change']();
    assert.equal(f.request.disabled, true);
    assert.equal(f.wrapper.hidden, true);
    f.service.value = 'Sprinkler';
    f.handlers['service:change']();
    assert.equal(f.request.value, subtype);
    assert.equal(f.request.disabled, false);
  }
});

test('unrecognized query values cannot become form selections or event metadata', () => {
  const f = fixture({ href: 'https://ewfservices.ca/?service=private%40example.com&request=arbitrary' });
  f.ready();
  assert.equal(f.service.value, '');
  assert.equal(f.request.value, '');
  f.service.value = 'private@example.com';
  f.submit();
  assert.equal(f.events.length, 0);
  assert.equal(f.store.size, 0);
});

test('source attribution accepts only known paths from the same origin', () => {
  for (const [referrer, expected] of [
    ['https://ewfservices.ca/sprinkler-systems.html?name=Private#details', '/sprinkler-systems'],
    ['https://ewfservices.ca/backflow-testing', '/backflow-testing'],
    ['https://example.com/fire-alarm-systems', '/'],
    ['https://ewfservices.ca/customer/private', '/'],
    ['', '/']
  ]) {
    const f = fixture({ referrer });
    f.ready();
    assert.equal(f.source.value, expected);
  }
  const f = submitFixture();
  f.source.value = '/customer/private@example.com';
  f.advance(2000);
  f.submit();
  assert.equal(f.events[1][2].source_page, '/sprinkler-systems');
});

test('native handoff records metadata only and does not alter form action or POST method', () => {
  const f = submitFixture();
  assert.equal(f.form.action, 'https://formsubmit.co/office@ewandf.ca');
  assert.equal(f.form.method, 'POST');
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0][1], 'enquiry_form_submit');
  assert.deepEqual(Object.keys(f.events[0][2]).sort(), ['service_type', 'source_page']);
  const pending = JSON.parse(f.store.get(STORAGE_KEY));
  assert.deepEqual(Object.keys(pending).sort(), ['createdAt', 'service', 'sourcePage', 'token']);
  assert.match(pending.token, /^[a-f0-9]{32}$/);
  assert.equal(new URL(f.next.value).searchParams.get('enquiry_return'), pending.token);
  assert.equal(f.events.some(entry => entry[1] === 'generate_lead'), false);
});

test('rapid duplicate submit notifications share one marker and one event', () => {
  const f = submitFixture();
  const firstMarker = f.store.get(STORAGE_KEY);
  f.submit();
  assert.equal(f.events.length, 1);
  assert.equal(f.store.get(STORAGE_KEY), firstMarker);
  f.advance(2000);
  f.submit();
  assert.equal(f.events.length, 2);
  assert.notEqual(f.store.get(STORAGE_KEY), firstMarker);
});

test('invalid, cancelled, and honeypot submissions produce no custom form signals', () => {
  for (const options of [{ valid: false }, { honey: 'bot' }]) {
    const f = submitFixture(options);
    assert.equal(f.events.length, 0);
    assert.equal(f.store.size, 0);
    assert.equal(f.next.value, ORIGINAL_NEXT);
  }
  const cancelled = fixture({ service: 'Fire Alarm' });
  cancelled.ready();
  cancelled.submit(true);
  assert.equal(cancelled.events.length, 0);
  const stale = submitFixture();
  stale.honey.value = 'bot';
  stale.submit();
  assert.equal(stale.events.length, 1);
  assert.equal(stale.store.size, 0);
  assert.equal(stale.next.value, ORIGINAL_NEXT);
});

test('storage or crypto failures preserve native fallback and allow the handoff signal', () => {
  for (const options of [{ storageThrows: true }, { storageThrows: 'setItem' }, { noCrypto: true }]) {
    const f = submitFixture(options);
    assert.equal(f.next.value, ORIGINAL_NEXT);
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0][1], 'enquiry_form_submit');
  }
});

test('fresh return removes the nonce before DOM readiness and records exactly once afterwards', () => {
  const submitted = submitFixture();
  const returned = fixture({ href: submitted.next.value + '#confirmation', store: submitted.store, noForm: true });
  assert.equal(returned.window.location.search, '');
  assert.equal(returned.window.location.hash, '#confirmation');
  assert.equal(returned.events.length, 0);
  assert.equal(returned.store.size, 0);
  returned.ready();
  assert.equal(returned.events.length, 1);
  assert.equal(returned.events[0][1], 'enquiry_form_return');
  assert.equal(returned.events[0][2].service_type, 'sprinkler');
  const reloaded = fixture({ href: submitted.next.value, store: submitted.store, noForm: true });
  reloaded.ready();
  assert.equal(reloaded.events.length, 0);
});

test('direct, mismatched, malformed, and non-confirmation visits cannot become returns', () => {
  const submitted = submitFixture();
  const pending = submitted.store.get(STORAGE_KEY);
  for (const href of [ORIGINAL_NEXT, ORIGINAL_NEXT + '?enquiry_return=invalid',
    ORIGINAL_NEXT + '?enquiry_return=' + 'f'.repeat(32),
    submitted.next.value.replace('/thank-you.html', '/')]) {
    const f = fixture({ href, store: new Map([[STORAGE_KEY, pending]]), noForm: true });
    f.ready();
    assert.equal(f.events.length, 0);
    assert.equal(f.store.get(STORAGE_KEY), pending);
  }
});

test('expired, future-dated, malformed and unsafe stored metadata never produce return events', () => {
  const submitted = submitFixture();
  const pending = JSON.parse(submitted.store.get(STORAGE_KEY));
  for (const value of [
    JSON.stringify({ ...pending, createdAt: NOW - 31 * 60 * 1000 }),
    JSON.stringify({ ...pending, createdAt: NOW + 1000 }),
    JSON.stringify({ ...pending, sourcePage: '/customer/private@example.com' }),
    JSON.stringify({ ...pending, service: 'private@example.com' }),
    '{malformed'
  ]) {
    const f = fixture({ href: submitted.next.value, store: new Map([[STORAGE_KEY, value]]), noForm: true });
    f.ready();
    assert.equal(f.events.length, 0);
  }
});

test('unavailable return storage and Analytics do not interrupt the page', () => {
  const submitted = submitFixture();
  for (const options of [{ storageThrows: 'getItem' }, { storageThrows: 'removeItem' }, { noTag: true }]) {
    const f = fixture({ href: submitted.next.value, store: new Map(submitted.store), noForm: true, ...options });
    assert.doesNotThrow(() => f.ready());
    assert.equal(f.events.length, 0);
  }
  const blockedHistory = fixture({ href: submitted.next.value, store: new Map(submitted.store), noForm: true, historyThrows: true });
  assert.doesNotThrow(() => blockedHistory.ready());
});

test('phone and email clicks record intent without addresses or link query values', () => {
  const f = fixture({ href: 'https://ewfservices.ca/fire-alarm-systems', noForm: true });
  f.ready();
  f.click('tel:6046495665');
  f.click('mailto:office@ewandf.ca?subject=private');
  f.click('/?service=fire-alarm#contact');
  assert.equal(f.events.length, 2);
  assert.equal(f.events[0][2].contact_method, 'phone');
  assert.equal(f.events[1][2].contact_method, 'email');
  assert.equal(f.events[0][2].source_page, '/fire-alarm-systems');
  assert.equal(f.events[0][2].service_type, 'fire-alarm');
  assert.doesNotMatch(JSON.stringify(f.events), /private|6046495665|office@/);
});

test('offline submission stays on the form and emits no handoff or return marker', () => {
  const f = submitFixture({ online: false });
  assert.equal(f.prevented(), 1);
  assert.equal(f.offlineNotice.hidden, false);
  assert.equal(f.offlineNotice.focused, true);
  assert.equal(f.events.length, 0);
  assert.equal(f.store.size, 0);
  assert.equal(f.next.value, ORIGINAL_NEXT);
  assert.equal(f.service.value, 'Sprinkler');
  assert.equal(f.form.action, 'https://formsubmit.co/office@ewandf.ca');
});

test('reconnecting clears the warning and permits a fresh native handoff without auto-sending', () => {
  const f = submitFixture({ online: false });
  f.window.navigator.onLine = true;
  f.windowListeners.online();
  assert.equal(f.offlineNotice.hidden, true);
  assert.equal(f.events.length, 0);
  assert.equal(f.store.size, 0);
  f.submit();
  assert.equal(f.prevented(), 1);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0][1], 'enquiry_form_submit');
  assert.equal(f.store.size, 1);
});

test('online or unavailable connectivity detection preserves native submission', () => {
  for (const online of [true, undefined]) {
    const f = submitFixture({ online });
    assert.equal(f.prevented(), 0);
    assert.equal(f.offlineNotice.hidden, true);
    assert.equal(f.events.length, 1);
  }
});
