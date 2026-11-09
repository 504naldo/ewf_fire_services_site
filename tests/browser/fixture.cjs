'use strict';

const path = require('node:path');
const { EventEmitter, once } = require('node:events');
const fs = require('node:fs/promises');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '../..');
const site = 'https://ewfservices.ca';
const provider = 'https://formsubmit.co/office@ewandf.ca';
const marker = 'ewf.enquiry.pending.v1';

async function launch() {
  // An unreachable loopback proxy also blocks speculative network traffic.
  const proxy = { server: 'http://127.0.0.1:9' };
  if (process.env.QA_BROWSER === 'webkit') return webkit.launch({ proxy });
  return chromium.launch({
    proxy,
    executablePath: process.env.CHROME_BIN || undefined,
    // All sites and provider responses are fixtures. Prevent even speculative DNS.
    args: ['--host-resolver-rules=MAP * ~NOTFOUND']
  });
}

async function fixture(browser, options = {}) {
  const { width = 1440, height = 900, touch = false, js = true, blockNav = false } = options;
  const context = await browser.newContext({
    viewport: { width, height }, isMobile: touch, hasTouch: touch,
    javaScriptEnabled: js, serviceWorkers: 'block', reducedMotion: 'reduce'
  });
  const posts = [];
  const requests = new EventEmitter();
  const errors = [];
  const submissions = [];
  await context.exposeBinding('recordSubmitState', (_, state) => submissions.push(state));
  await context.addInitScript(key => {
    // At window bubbling time, the form's own listener has already run.
    window.addEventListener('submit', e => {
      let pending = null;
      try { pending = JSON.parse(sessionStorage.getItem(key)); } catch { /* storage-blocked fixture */ }
      const events = window.dataLayer.filter(call => call[0] === 'event')
        .map(call => [call[1], call[2]]);
      window.recordSubmitState({ prevented: e.defaultPrevented, pending, events });
    });
  }, marker);
  await context.route('**/*', async route => {
    const request = route.request();
    if (request.url() === provider && request.method() === 'POST') {
      posts.push({ route, fields: new URLSearchParams(request.postData()) });
      requests.emit('post');
      // The case controls when the native navigation finishes.
      return;
    }
    const url = new URL(request.url());
    if (url.origin !== site || request.method() !== 'GET') return route.abort();
    if (blockNav && url.pathname === '/nav.js') return route.abort();
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!path.extname(file)) file += '.html';
    const filename = path.join(root, file);
    if (!filename.startsWith(root + path.sep)) return route.abort();
    try {
      await fs.access(filename);
    } catch {
      return route.fulfill({ status: 404, body: 'Fixture missing' });
    }
    return route.fulfill({ path: filename });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', e => errors.push(e.message));
  return { context, page, posts, errors, submissions, nextPost: () => once(requests, 'post', {signal: AbortSignal.timeout(6000)}) };
}

async function fill(page) {
  await page.locator('#service').selectOption('Sprinkler');
  await page.locator('#property-type').selectOption('Commercial');
  await page.locator('#request-type').selectOption('prv-service');
  await page.locator('#property-address').fill('Fixture address');
  await page.locator('#contact-name').fill('Fixture Contact');
  await page.locator('#company').fill('Fixture Company');
  await page.locator('#contact-email').fill('fixture@example.invalid');
  await page.locator('#contact-phone').fill('6045550100');
  await page.locator('#contact-message').fill('Fixture details');
}

function events(page) {
  return page.evaluate(() => window.dataLayer.filter(call => call[0] === 'event')
    .map(call => [call[1], call[2]]));
}

module.exports = { launch, fixture, fill, events, site, provider, marker };
