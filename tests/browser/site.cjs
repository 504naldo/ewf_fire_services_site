'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, fixture, site } = require('./fixture.cjs');

const pages = ['index', 'fire-alarm-systems', 'sprinkler-systems', 'backflow-testing',
  'smoke-control-systems', 'emergency-lighting', 'fire-extinguishers', 'privacy-policy', 'thank-you'];
let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

for (const width of [390, 768, 1024, 1440]) {
  test(`navigation, keyboard access and page measurement at ${width}px`, async t => {
    const { context, page, errors } = await fixture(browser, { width, height: 900, touch: width <= 768 });
    t.after(() => context.close());
    for (const slug of pages) {
      const url = new URL('/' + slug + '.html?utm_source=fixture', site);
      await page.goto(url.href);
      url.pathname = slug === 'index' ? '/' : '/' + slug;
      assert.equal(page.url(), url.href);
      const config = await page.evaluate(() => window.dataLayer.filter(c => c[0] === 'config')
        .map(c => [c[1], c[2].page_location]));
      assert.deepEqual(config, [['G-9ZJPP9CTGQ', url.href]]);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), slug + ' overflows');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.skip-link').evaluate(a => document.activeElement === a), true, slug);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'main', slug);
      if (slug === 'thank-you') continue;
      const toggle = page.locator('.menu-toggle');
      assert.equal(await toggle.isVisible(), width <= 1100);
      if (width <= 1100) {
        assert.equal(await toggle.locator('.icon-open').isVisible(), true, slug);
        assert.equal(await toggle.locator('.icon-close').isVisible(), false, slug);
        await toggle.focus();
        await page.keyboard.press('Enter');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        assert.equal(await toggle.locator('.icon-close').isVisible(), true, slug);
        assert.equal(await toggle.locator('.icon-open').isVisible(), false, slug);
      }
      const summary = page.locator('#primary-nav summary');
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#primary-nav .service-menu a').first().isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await summary.evaluate(el => document.activeElement === el), true);
      if (width <= 1100) {
        await page.keyboard.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await toggle.evaluate(el => document.activeElement === el), true);
      }
    }
    assert.deepEqual(errors, []);
  });
}

for (const mode of ['navigation script blocked', 'JavaScript disabled']) {
  test(`mobile navigation fallback with ${mode}`, async t => {
    const { context, page } = await fixture(browser, {width: 390, height: 844, touch: true,
      js: mode !== 'JavaScript disabled', blockNav: mode === 'navigation script blocked'});
    t.after(() => context.close());
    for (const slug of pages.filter(s => s !== 'thank-you')) {
      await page.goto(site + '/' + slug + '.html');
      assert.equal(await page.locator('.menu-toggle').isVisible(), false, slug);
      assert.equal(await page.locator('#primary-nav').isVisible(), true, slug);
      await page.locator('#primary-nav summary').tap();
      assert.equal(await page.locator('#primary-nav .service-menu a').first().isVisible(), true, slug);
    }
  });
}
