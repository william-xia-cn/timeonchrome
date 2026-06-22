# CWS Privacy Policy Remediation - Purple Nickel

## Rejection Summary

- Product: TimeOnChrome
- Product ID: `mkggamgaeemnlmlflpekacbknochbmom`
- Violation reference ID: `Purple Nickel`
- Transfer ID: `FZSL`
- CWS issue: Privacy policy does not contain required information.

## Root Cause

The prior `privacy.html` was too short for the current Chrome Web Store review standard. It mentioned browsing activity, settings, local storage, optional cloud sync, and generic sharing limits, but it did not comprehensively and prominently describe:

- a prominent user-data disclosure before feature details;
- when data collection starts and how user consent is obtained;
- how TimeOnChrome collects user data;
- how TimeOnChrome uses and processes user data;
- where local and cloud data are stored;
- all parties user data may be shared with;
- how data is retained, deleted, or stopped;
- diagnostic logs, device metadata, account/session data, media usage, and classification requests;
- the `identity.email` permission and its no-OAuth/no-raw-identity storage boundary;
- incognito sanitization behavior;
- the Chrome Web Store Limited Use statement.

It also contained stale permission wording for `management`, which is not requested by the current manifest.

## Remediation

`extension/privacy.html` has been rewritten to include:

- a top-level `Prominent Disclosure` section covering browsing usage metadata, configured site targets, website classification requests, device sync status, media metadata, diagnostic logs, and optional cloud account/session data;
- a `User Consent And When Collection Starts` section explaining local collection after install/enable, cloud upload only after parent sign-in and device binding, and how users can stop collection;
- data categories collected or processed;
- data not collected;
- processing purposes;
- local storage and optional Cloudflare-hosted cloud storage;
- sharing parties and restrictions;
- retention and deletion controls;
- human access limits;
- incognito handling;
- security handling;
- exact current Chrome permission disclosures;
- user controls;
- Chrome Web Store Limited Use statement.

The v1.7.6 CWS listing copy and reviewer notes have also been updated to surface the same privacy disclosure in the store metadata, not only in the external privacy policy.

## CWS Dashboard Actions

Before resubmission:

- update the Chrome Web Store Developer Dashboard privacy policy URL to point to a public, accessible copy of the revised privacy policy;
- ensure the listing description includes the prominent data-use disclosure near the top;
- ensure the privacy/data-use page categories remain consistent with the current manifest and policy: personally identifiable information, authentication information, web history/network records, and user activity;
- keep `website content` unchecked unless the product starts collecting page body content, form inputs, private messages, comments, images, audio/video content, or other webpage contents;
- keep `identity` / `identity.email` permission justifications aligned with the policy: weak macOS / Windows device recovery via `chrome.identity.getProfileUserInfo()`, no OAuth, no `getAuthToken()`, no raw identity storage, server-side HMAC hash only.

The policy URL must not be a `chrome-extension://` URL. It should be hosted on a public project page, repository page, or other stable website controlled by the developer.

## Reviewer Note

Suggested reviewer note:

```text
The privacy policy and Chrome Web Store listing have been updated for Purple Nickel. They now include a prominent disclosure of user data handled by TimeOnChrome, explain when local collection starts and when cloud upload begins, and describe collection, processing, storage, sharing, retention, deletion, user controls, incognito sanitization, diagnostics, Cloudflare-hosted optional cloud sync, current Chrome permissions, and the Chrome Web Store Limited Use statement. The identity / identity.email permissions are disclosed as weak macOS / Windows device-binding recovery using chrome.identity.getProfileUserInfo(); TimeOnChrome does not use Google OAuth, does not call getAuthToken(), and does not store raw Chrome identity values.
```

## Remaining Requirement

The source privacy page is fixed, but Chrome Web Store compliance also depends on:

- the dashboard privacy policy URL pointing to the updated public copy;
- the public URL returning HTTP 200 and the latest policy content;
- the CWS listing and privacy/data-use fields matching the public policy;
- stopping at the final submit confirmation until the Product Owner confirms resubmission.

## v1.7.7 Follow-up After Second Purple Nickel Rejection

The metadata-only v1.7.6 resubmission was rejected again. The concrete packaging gap found afterward was that `dist/cws-v1.7.6-20260609-182055/timeonchrome-v1.7.6-cws.zip` still contained the old `privacy.html`; the public policy and dashboard metadata had been updated later, but the submitted package did not contain the same policy text.

The v1.7.7 remediation therefore uses a new package upload instead of metadata-only resubmission:

- `extension/privacy.html` is Chinese-first and includes prominent disclosure in the first screen.
- The policy explicitly covers collection, processing, storage, sharing, retention/deletion controls, cloud sync start conditions, user stop controls, and `identity.email` no-OAuth/no-raw-identity boundaries.
- The CWS ZIP contains the updated `privacy.html`.
- The listing copy, reviewer notes, CWS privacy fields, and public privacy policy URL must be kept consistent with the package policy.