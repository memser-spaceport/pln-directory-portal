## Why

LAB-2919 (https://linear.app/protocollabs/issue/LAB-2919): the support Telegram channel shows the raw feedback screenshot without the member's drawings, and the alert does not say which page the member was on, although both senders send `metadata.page`.

## What Changes

- An image with a hosted `data-flat-src` shows that URL in the Telegram alert instead of `src`; the `src` reader no longer matches the `src` inside `data-flat-src`.
- The alert has a `Page: <url>` line after the message when `metadata.page` is an http or https URL.
- Out of scope: pl-notification-service (sending a Telegram photo); the saved request, the email and `ContactSupportRequestDto` do not change.

## Capabilities

### New Capabilities
- `contact-support`: support requests, their email and their Telegram alert (the module had no spec before this change).

## Impact

The support Telegram channel alert for every contact-support request, including LabOS feedback from the feedback drawer and the help-menu support form.
