# CWS Privacy Policy Remediation - Purple Nickel

## Rejection Summary

- Product: TimeOnChrome
- Product ID: `mkggamgaeemnlmlflpekacbknochbmom`
- Violation reference ID: `Purple Nickel`
- Transfer ID: `FZSL`
- CWS issue: Privacy policy does not contain required information.

## Root Cause

The prior `privacy.html` was too short for the current Chrome Web Store review standard. It mentioned browsing activity, settings, local storage, optional cloud sync, and generic sharing limits, but it did not comprehensively describe:

- how TimeOnChrome collects user data;
- how TimeOnChrome uses and processes user data;
- where local and cloud data are stored;
- all parties user data may be shared with;
- diagnostic logs, device metadata, account/session data, media usage, and classification requests;
- incognito sanitization behavior;
- the Chrome Web Store Limited Use statement.

It also contained stale permission wording for `management`, which is not requested by the current manifest.

## Remediation

`extension/privacy.html` has been rewritten to include:

- data categories collected or processed;
- data not collected;
- processing purposes;
- local storage and optional Cloudflare-hosted cloud storage;
- sharing parties and restrictions;
- human access limits;
- incognito handling;
- security handling;
- exact current Chrome permission disclosures;
- user controls;
- Chrome Web Store Limited Use statement.

## CWS Dashboard Action

Before resubmission, update the Chrome Web Store Developer Dashboard privacy policy URL to point to a public, accessible copy of the revised privacy policy.

The policy URL must not be a `chrome-extension://` URL. It should be hosted on a public project page, repository page, or other stable website controlled by the developer.

## Reviewer Note

Suggested reviewer note:

```text
The privacy policy has been updated to comprehensively describe TimeOnChrome's user data collection, processing, storage, and sharing practices. It now covers browsing/usage metadata, website classification requests, configuration data, device/profile data, media usage metadata, diagnostic logs, authentication/session data, incognito sanitization, Cloudflare-hosted optional cloud sync, current Chrome permissions, user controls, and the Chrome Web Store Limited Use statement. The stale management permission reference was removed.
```

## Remaining Requirement

The source privacy page is fixed, but Chrome Web Store compliance also depends on the dashboard privacy policy URL pointing to the updated public copy.
