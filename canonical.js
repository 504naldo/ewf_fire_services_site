(function () {
  'use strict';

  // GitHub Pages serves both .html and clean URLs. Normalize the browser URL
  // before Analytics initializes, without a second request or duplicate view.
  var aliases = {
    '/index.html': '/',
    '/index': '/',
    '/fire-alarm-systems.html': '/fire-alarm-systems',
    '/sprinkler-systems.html': '/sprinkler-systems',
    '/backflow-testing.html': '/backflow-testing',
    '/smoke-control-systems.html': '/smoke-control-systems',
    '/emergency-lighting.html': '/emergency-lighting',
    '/fire-extinguishers.html': '/fire-extinguishers',
    '/privacy-policy.html': '/privacy-policy',
    '/thank-you.html': '/thank-you'
  };
  var url = new URL(window.location.href);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (Object.prototype.hasOwnProperty.call(aliases, url.pathname)) {
    url.pathname = aliases[url.pathname];
  }
  // enquiry.js has already consumed the return marker. Keep it out of GA even
  // when browser restrictions prevented that script from cleaning the URL.
  url.searchParams.delete('enquiry_return');
  window.ewfAnalyticsPage = { page_location: url.href };
  if (url.href === window.location.href) return;
  try {
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch (error) {
    // GA still receives the normalized location; navigation and forms work.
  }
})();
