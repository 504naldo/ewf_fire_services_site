# Enquiry measurement

The website keeps its existing native POST to FormSubmit, including provider CAPTCHA and the honeypot. `enquiry.js` never sends a second request, submits a form itself, prevents native submission, or replaces the provider with AJAX. With JavaScript or browser storage unavailable, the original form action and thank-you destination remain the fallback. Provider CAPTCHA requirements still apply.

## Signals, not confirmed leads

| Event | Meaning | Parameters |
| --- | --- | --- |
| `contact_click` | A visitor activated a phone or email link; it does not establish a connected call or sent email. | `contact_method` (`phone` or `email`), allowlisted `source_page`, optional allowlisted `service_type` |
| `enquiry_form_submit` | A browser-valid, empty-honeypot form is being handed to FormSubmit; it does not establish provider acceptance or delivery. | Allowlisted `service_type` and `source_page` |
| `enquiry_form_return` | The same browser tab reached the configured thank-you URL with a matching, recent, one-time submission marker. | Allowlisted `service_type` and `source_page` |

No `generate_lead` event is emitted. None of these events automatically becomes a GA4 key event. Do not treat the automatic GA4 `form_submit`, a thank-you page view, or these funnel signals as verified customer enquiries. FormSubmit can silently discard spam, and a browser return cannot verify inbox delivery or qualification. Confirmed leads require a trusted provider receipt/backend integration; qualified leads require a business review.

No form text, name, email address, phone number, company, property address, or message is copied into Analytics or browser storage by this script. Source paths and service values are restricted to fixed allowlists. Raw referrers and arbitrary query values are not sent as event parameters. The native form still sends customer-supplied fields to the existing FormSubmit endpoint for handling the enquiry.

## Return marker

On a valid native submit, the script stores a cryptographically random nonce, timestamp, safe service slug and safe source path in `sessionStorage`. The nonce is added to FormSubmit's `_next` URL as `enquiry_return`; no customer information is added to that URL. A matching marker is consumed once on `/thank-you` or `/thank-you.html`, only within 30 minutes. Missing, mismatched, malformed, expired or unavailable storage produces no return event. Rapid duplicate submit notifications within 1.5 seconds are ignored for measurement; the script does not alter the browser's actual submission behavior.

Load `<script src="/enquiry.js"></script>` synchronously in the head **before** the Google tag configuration on every page, especially the thank-you page. It removes the nonce from the URL before GA's automatic page view and queues a valid return event after DOM initialization. Do not add `async` or `defer` to this script unless this ordering is preserved by another mechanism.

This browser marker prevents accidental counting of direct thank-you visits and refreshes. It is not a signed receipt, security boundary, delivery confirmation, or bot-proof conversion signal. A failed browser history rewrite can leave a random nonce in the URL; it contains no customer information. Browser privacy restrictions, disabled scripts, blocked Analytics, an interrupted redirect or a different browser tab can undercount the funnel.

## Form and service links

The home form must retain `id="enquiry-form"`, a service select with `id="service"`, the native FormSubmit `action`, the existing `_next`, and a honeypot input named `_honey`. Include a hidden `source_page` input with a safe no-script default of `/`. The script replaces this with an allowlisted same-origin referring page, falling back to the current page. The customer can change the preselected service.

Supported `?service=` values are `fire-alarm`, `sprinkler`, `backflow`, `smoke-control`, `emergency-lighting`, `fire-extinguishers`, `multiple-services`, `troubleshooting`, and `not-sure`. Existing label-valued options remain supported, including `Fire Alarm`, `Sprinkler`, `Multiple Services`, `Emergency / Troubleshooting`, and `Not sure`. Page-style aliases such as `fire-alarm-systems` normalize to the same service slug.

For sprinkler enquiries, `?request=` accepts `annual-inspection`, `five-year-inspection`, `prv-service`, and `deficiency-follow-up`. The visible editable select must use `id="request-type"` and sit inside `id="request-type-field"`. It is shown and enabled only while Sprinkler is selected. This request subtype is submitted to the service team, not sent as an Analytics parameter. Unsupported query values are ignored.

## Deployment validation

1. Confirm all pages include the script before the Google tag configuration and that existing GA measurement ID `G-9ZJPP9CTGQ` is configured only once per page.
2. Verify service links preselect the intended service, keep it editable, and preserve a safe source path. Check all four sprinkler request links and switching away from Sprinkler. Test desktop and mobile navigation, keyboard controls, and the no-script form fallback.
3. Verify an invalid form and a filled honeypot produce no custom form events. Verify storage exceptions leave the original `_next` unchanged and do not stop native submission. Use local/browser stubs for these checks so no enquiry is sent.
4. In a controlled environment with a stubbed tag and provider, verify a valid handoff produces one submit signal, a matching fresh return produces one return signal, and refresh, direct thank-you visits, mismatches and expired markers produce none. Verify no customer-entered fields reach the event queue or session storage.
5. To validate production delivery, obtain authorization to send one clearly labelled test enquiry. Confirm the provider challenge, redirect, actual inbox receipt and GA DebugView/Realtime signals. Do not infer email delivery merely from the thank-you page. This implementation has not sent a production test enquiry.
6. Keep these events out of lead/conversion totals until their meaning is accepted. Record the deployment date when comparing periods. Verify internal traffic rules before activating an exclusion; exclusions cannot repair historical reports.

## Provider references

- [FormSubmit documentation](https://formsubmit.co/documentation): native `_next`, honeypot, CAPTCHA and webhook behavior.
- [FormSubmit help](https://formsubmit.co/help): custom query parameters in `_next` and delivery troubleshooting.
- [Google Analytics recommended events](https://support.google.com/analytics/answer/9267735?hl=en): `generate_lead` and later lead qualification events.

The current implementation changes no GA4 settings, internal traffic filters, key-event definitions, backend infrastructure, or provider account configuration.

## Canonical page locations (October 23 audit fix)

GitHub Pages serves the existing clean paths and `.html` aliases with HTTP 200.
The site cannot install arbitrary HTTP 301 rules through `.htaccess` or a
`_redirects` file on that host. `canonical.js` therefore normalizes the known
aliases in browser history and supplies a canonical `page_location` to the
existing single GA configuration. This is browser/measurement normalization,
not a server redirect. Canonical tags and internal links keep their clean URLs.

Load scripts in this order: `enquiry.js`, `canonical.js`, then the Google tag and
its configuration. Enquiry return markers must be consumed before URL cleanup.
The normalizer preserves service selections, sprinkler request types, campaign
parameters and anchors, and excludes `enquiry_return` from the GA location even
if history replacement is blocked. It never navigates to another origin,
reloads the page, submits the form or emits an extra page-view event. If the
normalizer fails to load, the existing GA configuration remains functional.

This affects new data only after deployment. For historical reports, group
`/index.html` and `/index` under `/`, and each known service `.html` alias under
its clean path. Compare by page path rather than mutable page title. Do not sum
active-user counts from alias rows: people can visit both versions and must be
deduplicated in GA4. Preserve the original date range and metric definitions.

To validate locally, run `node --test tests/*.test.cjs`. Browser checks should
confirm alias normalization before the initial GA page view, preserved query
prefill and hash navigation, and no duplicate events. A production GA4 check
still requires access to the property's Realtime/DebugView reports.
