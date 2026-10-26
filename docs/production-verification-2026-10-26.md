# Production verification — October 26, 2026

## Release identity

The main branch was `8e547b026249110438baa7932e365d58f73f7618` (PR #20) when checked. All nine deployed HTML documents and five shared JS/CSS files returned HTTP 200 and matched that commit byte for byte. Their Last-Modified header was October 23, 2026, 21:52:20 UTC. The checked assets were `canonical.js`, `enquiry.js`, `nav.js`, `navigation.css` and `style.css`.

The live www host redirected to `https://ewfservices.ca/`. `/index` and `/thank-you` also returned HTTP 200. Browser navigation to `/index.html` and `/backflow-testing.html` normalized to the clean paths. This is not a server-side alias redirect.

## Independently observed in production

- A visit to `/index.html?utm_source=ewf_verification&utm_medium=qa&utm_campaign=release_20261023#contact` normalized to `/` while retaining the query and anchor.
- In the authenticated EWF GA4 property, the web stream used the deployed measurement ID `G-9ZJPP9CTGQ` and reported active collection.
- GA4 Realtime received the controlled three-page sequence (home, sprinkler service, home with PRV enquiry prefill). Each of the three exact page locations appeared once in the `page_view` parameter drilldown. The first page location contained the QA campaign parameters and the clean `/` path. This independently verifies receipt and page-location normalization for that sequence, not every event or acquisition report.
- Sprinkler → PRV testing or service selected Sprinkler and `prv-service`. Changing to Backflow hid the sprinkler subtype.
- Empty required fields blocked form navigation and focused the missing service field.
- The backflow page's keyboard skip link focused the main landmark and left the main heading visible.
- The form uses POST to `https://formsubmit.co/office@ewandf.ca`, with the configured subject, honeypot, and `https://ewfservices.ca/thank-you.html` destination. A read-only visit to the provider endpoint displayed its expected “Form should POST” response. It does not establish activation or delivery.

## Comparison with earlier findings

| Earlier issue | Evidence/status |
| --- | --- |
| Service CTAs lead to an unselected form | Service-aware URLs and editable prefill are deployed; the sprinkler/PRV path was exercised live. |
| Mobile navigation unavailable when its script fails | The corrected JS/CSS matches production; existing initialization/fallback regression tests pass. |
| Missing keyboard landmarks/skip links | Deployed across all nine pages; backflow keyboard focus checked live. |
| No consistent mobile contact controls | Shared contact-bar markup and responsive CSS are deployed on home/service pages. |
| Contact card precedes the enquiry on narrow screens | Current form is first in source order and the small-screen contact grid has one column. |
| Missing backflow landing page and practical quote information | Deployed backflow page, navigation, service preparation and access/timing guidance verified. |
| Page aliases split new measurements | Canonical initial page location observed in GA4 Realtime. Historical data is unchanged. |
| No distinction between intent and confirmed leads | Code distinguishes click, submit and provider-return signals; it emits no `generate_lead`. Delivery/qualification are still separate. |

## Correction prepared after verification

A browser reporting `navigator.onLine === false` previously proceeded toward the provider and recorded a handoff attempt without an in-page recovery message. Two new regression cases failed against that implementation.

The correction keeps a valid offline submission on the form, shows and focuses an accessible warning, leaves field values in place, and emits neither a handoff event nor a new return marker. Reconnection clears the warning without submitting. Online/unknown connection states retain the native POST, CAPTCHA and provider destination. Static phone/email recovery guidance also remains available without JavaScript.

This only handles an explicitly offline browser. An online status cannot establish Internet/provider availability, and native cross-origin POST does not let this static site inspect the provider response. Provider 4xx/5xx errors, rejection, CAPTCHA abandonment and email delivery still require provider/inbox checks. No new backend or AJAX delivery route was introduced.

## Validation and limits

- Original baseline: 21 Node tests passed.
- Corrected branch: 24 Node tests passed (`node --test tests/*.test.cjs`).
- `git diff --check` passed.
- Checks cover alias normalization, query preservation, navigation fallback/control behavior, service prefill, source allowlists, invalid/honeypot submissions, blocked storage/crypto, duplicate counting, return-marker expiry/replay, contact-event metadata, offline recovery and online retry.
- These tests use DOM/storage doubles. The previous PR's 155 Chromium assertions are historical evidence; that full viewport/browser matrix was **not** rerun in this session. New warning layout and touch-device behavior need browser/device QA before release.
- No real production enquiry was submitted. Provider account activation, CAPTCHA completion, accepted submission, inbox receipt and delivered-message content remain unverified. No matching receipt was available through the connected email search.
- No custom submit/return signal was induced in production. Their implementation passes local tests; actual GA4 receipt for those signals remains unverified.
- Campaign parameters reached GA4 in `page_location`; processed session source/medium/campaign attribution was not independently established.
- The small controlled QA sequence is not customer traffic or evidence of conversion improvement. The earlier engagement decline cannot be causally explained or declared resolved by these checks.

## Remaining completion steps

1. Review/merge the correction through the existing release process, then check the new warning on narrow and desktop layouts.
2. With explicit authorization, send one labelled non-customer test enquiry through the native form. Complete any provider challenge, record the final return, and verify the exact email in the office inbox, including service and source metadata. Do not bypass CAPTCHA or infer delivery from a thank-you view.
3. Match the test's submit/return events in GA4 Realtime/DebugView and confirm processed campaign attribution after reporting catches up. Separate QA traffic from business outcome analysis.
