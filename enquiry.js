(function () {
  'use strict';

  // This script records contact intent and the provider return, not verified leads.
  var STORAGE_KEY = 'ewf.enquiry.pending.v1';
  var RETURN_PARAM = 'enquiry_return';
  var RETURN_TTL = 30 * 60 * 1000;
  var services = {
    'fire-alarm': 'Fire Alarm',
    'sprinkler': 'Sprinkler',
    'backflow': 'Backflow',
    'smoke-control': 'Smoke Control',
    'emergency-lighting': 'Emergency Lighting',
    'fire-extinguishers': 'Fire Extinguishers',
    'multiple-services': 'Multiple Services',
    'troubleshooting': 'Emergency / Troubleshooting',
    'not-sure': 'Not sure'
  };
  var pageServices = {
    '/fire-alarm-systems': 'fire-alarm',
    '/sprinkler-systems': 'sprinkler',
    '/backflow-testing': 'backflow',
    '/smoke-control-systems': 'smoke-control',
    '/emergency-lighting': 'emergency-lighting',
    '/fire-extinguishers': 'fire-extinguishers'
  };
  var allowedPaths = ['/', '/privacy-policy', '/thank-you'].concat(Object.keys(pageServices));
  var requestTypes = ['annual-inspection', 'five-year-inspection', 'prv-service', 'deficiency-follow-up'];

  function safePath(path) {
    if (typeof path !== 'string') return null;
    var normalized = path.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    if (normalized === '/index') normalized = '/';
    return allowedPaths.indexOf(normalized) !== -1 ? normalized : null;
  }

  function serviceSlug(value) {
    if (typeof value !== 'string') return null;
    var normalized = value.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(services, normalized)) return normalized;
    var pageAlias = pageServices['/' + normalized];
    if (pageAlias) return pageAlias;
    return Object.keys(services).find(function (slug) {
      return services[slug].toLowerCase() === normalized;
    }) || null;
  }

  function event(name, parameters) {
    // Use the existing Google tag queue, including when gtag.js is still loading.
    if (typeof window.gtag === 'function') window.gtag('event', name, parameters);
  }

  function nonce() {
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function captureReturn() {
    var url = new URL(window.location.href);
    var token = url.searchParams.get(RETURN_PARAM);
    if (url.searchParams.has(RETURN_PARAM)) {
      url.searchParams.delete(RETURN_PARAM);
      try {
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      } catch (error) {
        // A browser restriction must not interfere with the confirmation page.
      }
    }
    if (safePath(url.pathname) !== '/thank-you' || !/^[a-f0-9]{32}$/.test(token || '')) return null;
    try {
      var pending = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY));
      if (!pending || pending.token !== token) return null;
      // Consume a matching marker before any event, so reload/back cannot count twice.
      window.sessionStorage.removeItem(STORAGE_KEY);
      var age = Date.now() - pending.createdAt;
      if (typeof pending.createdAt !== 'number' || !Number.isFinite(age) || age < 0 || age > RETURN_TTL) return null;
      var service = serviceSlug(pending.service);
      var source = safePath(pending.sourcePage);
      if (!service || !source) return null;
      return { service_type: service, source_page: source };
    } catch (error) {
      return null;
    }
  }

  // Loaded synchronously before GA: remove the nonce before the automatic page view.
  var returnedEnquiry = captureReturn();

  function initialize() {
    var currentPage = safePath(window.location.pathname);
    if (returnedEnquiry) event('enquiry_form_return', returnedEnquiry);

    document.addEventListener('click', function (click) {
      var link = click.target instanceof Element ? click.target.closest('a[href]') : null;
      if (!link || !currentPage) return;
      var href = link.getAttribute('href') || '';
      var method = /^tel:/i.test(href) ? 'phone' : (/^mailto:/i.test(href) ? 'email' : null);
      if (!method) return;
      var parameters = { contact_method: method, source_page: currentPage };
      if (pageServices[currentPage]) parameters.service_type = pageServices[currentPage];
      event('contact_click', parameters);
    });

    var form = document.getElementById('enquiry-form');
    if (!form) return;
    var serviceSelect = document.getElementById('service');
    var requestSelect = document.getElementById('request-type');
    var requestField = document.getElementById('request-type-field');
    var sourceInput = form.querySelector('input[name="source_page"]');
    var nextInput = form.querySelector('input[name="_next"]');
    var honey = form.querySelector('input[name="_honey"]');
    var originalNext = nextInput ? nextInput.value : '';
    var sourcePage = currentPage || '/';
    try {
      var referringPage = new URL(document.referrer);
      if (referringPage.origin === window.location.origin) {
        sourcePage = safePath(referringPage.pathname) || sourcePage;
      }
    } catch (error) {
      // Empty/external/unrecognized referrers fall back to this page's safe path.
    }
    if (sourceInput) sourceInput.value = sourcePage;

    var query = new URL(window.location.href).searchParams;
    var selectedService = serviceSlug(query.get('service'));
    if (serviceSelect && !serviceSelect.value && selectedService) {
      var matchingOption = Array.prototype.find.call(serviceSelect.options, function (option) {
        return serviceSlug(option.value) === selectedService;
      });
      if (matchingOption) serviceSelect.value = matchingOption.value;
    }
    if (requestSelect && requestTypes.indexOf(query.get('request')) !== -1) {
      requestSelect.value = query.get('request');
    }

    function updateRequestField() {
      var isSprinkler = serviceSelect && serviceSlug(serviceSelect.value) === 'sprinkler';
      if (requestField) requestField.hidden = !isSprinkler;
      if (requestSelect) requestSelect.disabled = !isSprinkler;
    }
    updateRequestField();
    if (serviceSelect) serviceSelect.addEventListener('change', updateRequestField);

    var lastSubmitAt = null;
    form.addEventListener('submit', function (submission) {
      if (submission.defaultPrevented || !form.checkValidity()) return;
      if (honey && honey.value) {
        if (nextInput) nextInput.value = originalNext;
        try { window.sessionStorage.removeItem(STORAGE_KEY); } catch (error) { /* Native POST remains unchanged. */ }
        return;
      }
      // Do not trigger another POST, intercept CAPTCHA, or change native navigation.
      // Ignore rapid duplicate submit notifications in the measurement only.
      var now = Date.now();
      if (lastSubmitAt !== null && now - lastSubmitAt < 1500) return;
      lastSubmitAt = now;
      var service = serviceSelect && serviceSlug(serviceSelect.value);
      if (!service) return;
      var source = sourceInput ? safePath(sourceInput.value) : sourcePage;
      source = source || sourcePage;
      if (nextInput) nextInput.value = originalNext;
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
        if (nextInput) {
          var destination = new URL(originalNext);
          var token = nonce();
          var pending = { token: token, createdAt: now, service: service, sourcePage: source };
          window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
          destination.searchParams.set(RETURN_PARAM, token);
          nextInput.value = destination.href;
        }
      } catch (error) {
        if (nextInput) nextInput.value = originalNext;
      }
      event('enquiry_form_submit', { service_type: service, source_page: source });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
