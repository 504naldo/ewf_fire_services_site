'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { launch, fixture, fill, events, site, provider, marker } = require('./fixture.cjs');

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

async function setup(t, options) {
  const f = await fixture(browser, options);
  t.after(async () => {
    await f.context.close();
    assert.deepEqual(f.errors, []);
  });
  return f;
}

const submit = '.submit-btn';
const warning = '#enquiry-offline';
const focus = page => page.evaluate(() => document.activeElement.id || document.activeElement.className);
const formData = page => page.locator('#enquiry-form').evaluate(form => [...new FormData(form)]);
const metadata = { service_type: 'sprinkler', source_page: '/sprinkler-systems' };

for (const [width, height, touch] of [[320, 568, true], [390, 844, true], [768, 1024, true], [1440, 900, false]]) {
  test(`offline, reconnect and explicit retry at ${width}×${height}`, async t => {
    const { context, page, posts, nextPost } = await setup(t, { width, height, touch });
    await page.goto(site + '/sprinkler-systems');
    await page.locator('a[href*="request=prv-service"]').first().click();
    assert.equal(await page.locator('#service').inputValue(), 'Sprinkler');
    assert.equal(await page.locator('#request-type').inputValue(), 'prv-service');
    assert.equal(await page.locator('[name="source_page"]').inputValue(), metadata.source_page);
    const url = page.url();
    const button = page.locator(submit);
    await button.focus();
    await page.keyboard.press('Enter');
    assert.equal(await focus(page), 'property-type');
    await fill(page);
    const values = await formData(page);
    await context.setOffline(true);
    if (touch) await button.tap();
    else { await button.focus(); await page.keyboard.press('Enter'); }
    await page.getByRole('alert').waitFor();
    assert.equal(await focus(page), 'enquiry-offline');
    assert.match(await page.getByRole('alert').innerText(), /not been sent.*Reconnect/i);
    const layout = await page.locator(warning).evaluate(el => {
      const r = el.getBoundingClientRect();
      const bar = document.querySelector('.mobile-action-bar').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right,
        header: document.querySelector('header').getBoundingClientRect().bottom,
        limit: bar.height ? bar.top : innerHeight, width: document.documentElement.clientWidth };
    });
    assert.ok(layout.left >= 0 && layout.right <= layout.width &&
      layout.top >= layout.header - 1 && layout.bottom <= layout.limit + 1, JSON.stringify(layout));
    if (process.env.QA_SCREENSHOTS) await page.screenshot({path: process.env.QA_SCREENSHOTS + '/warning-' + width + '.png'});
    await page.keyboard.press('Tab');
    assert.equal(await focus(page), 'submit-btn');
    await page.keyboard.press('Enter');
    assert.equal(await focus(page), 'enquiry-offline');
    assert.deepEqual(await formData(page), values);
    assert.equal(page.url(), url);
    assert.equal(posts.length, 0);
    assert.deepEqual(await events(page), []);
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), marker), null);

    // A user editing another field keeps their focus when connectivity returns.
    await page.locator('#contact-message').focus();
    await context.setOffline(false);
    await page.locator(warning).waitFor({ state: 'hidden' });
    assert.equal(await focus(page), 'contact-message');
    await context.setOffline(true);
    await button.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('alert').waitFor();
    await context.setOffline(false);
    await page.locator(warning).waitFor({ state: 'hidden' });
    assert.equal(await focus(page), 'submit-btn');
    assert.deepEqual(await formData(page), values);
    assert.equal(posts.length, 0);
    assert.deepEqual(await events(page), []);

    const sent = nextPost();
    await page.keyboard.press('Enter');
    await sent;
    await page.waitForFunction(() => window.dataLayer.some(c => c[1] === 'enquiry_form_submit'));
    assert.equal(posts.length, 1);
    const { fields, route } = posts[0];
    const next = new URL(fields.get('_next'));
    assert.equal(next.origin + next.pathname, site + '/thank-you.html');
    assert.match(next.searchParams.get('enquiry_return'), /^[a-f0-9]{32}$/);
    assert.equal(fields.has('_captcha'), false);
    assert.equal(fields.get('_honey'), '');
    assert.deepEqual([...fields].filter(([k]) => k !== '_next'), values.filter(([k]) => k !== '_next'));
    const pending = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), marker);
    assert.deepEqual(Object.keys(pending).sort(), ['createdAt', 'service', 'sourcePage', 'token']);
    assert.equal(pending.token, next.searchParams.get('enquiry_return'));
    assert.deepEqual(await events(page), [['enquiry_form_submit', metadata]]);
    // Use a fixture link for the provider return, with the native _next payload.
    await route.fulfill({contentType: 'text/html', body: '<a id="return">Return</a>'});
    await page.waitForURL(provider);
    await page.locator('#return').evaluate((a, url) => a.href = url, next.href);
    await page.locator('#return').click();
    await page.waitForURL(site + '/thank-you');
    assert.deepEqual(await events(page), [['enquiry_form_return', metadata]]);
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), marker), null);
    await page.reload();
    assert.deepEqual(await events(page), []);
  });
}

test('repeated keyboard activation while a provider response is pending', async t => {
  const { page, posts, nextPost } = await setup(t);
  await page.goto(site);
  await fill(page);
  await page.locator(submit).focus();
  const sent = nextPost();
  await page.keyboard.press('Enter');
  await sent;
  await page.keyboard.press('Enter');
  await delay(150);
  assert.equal(posts.length, 1, 'repeated Enter must not start a second native POST');
  assert.equal((await events(page)).length, 1);
});

test('provider error, browser Back and a manual retry', async t => {
  const { page, posts, nextPost } = await setup(t, { width: 390, height: 844, touch: true });
  await page.goto(site);
  await fill(page);
  const send = async () => {
    const started = nextPost();
    await page.locator(submit).focus();
    await page.keyboard.press('Enter');
    await started;
  };
  await send();
  await posts[0].route.fulfill({status: 503, contentType: 'text/html', body: '<h1>Provider unavailable</h1>'});
  await page.getByRole('heading', {name:'Provider unavailable'}).waitFor();
  await page.goBack();
  const recovery = page.locator('.form-note').filter({hasText:'If the form cannot complete'});
  assert.equal(await recovery.isVisible(), true);
  assert.equal(await recovery.locator('a').first().getAttribute('href'), 'tel:6046495665');
  assert.equal(await recovery.locator('a').last().getAttribute('href'), 'mailto:office@ewandf.ca');
  assert.equal((await events(page)).some(([event]) => event === 'enquiry_form_return'), false);
  await fill(page);
  await send();
  assert.equal(posts.length, 2);
  assert.notEqual(posts[0].fields.get('_next'), posts[1].fields.get('_next'));
});

test('no JavaScript preserves the native request and recovery contacts', async t => {
  const { page, posts, nextPost } = await setup(t, {js: false, width: 390, height: 844, touch: true});
  await page.goto(site);
  await page.locator('#service').selectOption('Backflow');
  await page.locator('#property-type').selectOption('Commercial');
  await page.locator('#contact-name').fill('Fixture Contact');
  await page.locator('#contact-email').fill('fixture@example.invalid');
  assert.equal(await page.locator('#enquiry-form a[href^="mailto:"]').isVisible(), true);
  const sent = nextPost();
  await page.locator(submit).focus();
  await page.keyboard.press('Enter');
  await sent;
  assert.equal(posts[0].fields.get('_next'), site + '/thank-you.html');
  assert.equal(posts[0].fields.get('_honey'), '');
  assert.equal(posts[0].fields.has('_captcha'), false);
});
