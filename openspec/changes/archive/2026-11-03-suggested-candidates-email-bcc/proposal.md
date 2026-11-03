## Why

Team leads receive the suggested-candidates email. LabOS needs a copy of each send, taken from `LABOS_EMAIL`, without the lead seeing that address.

## What Changes

- Each suggested-candidates email BCCs `LABOS_EMAIL` when that variable is set.
- The BCC address is an SES destination only. It is not a message header.
- When `LABOS_EMAIL` is empty or unset, the email has no BCC.

## Capabilities

### New Capabilities
- `suggested-candidates-email`: the weekly suggested-candidates email to team leads.

## Impact

The suggested-candidates email sent after a job-match run. `sendHtmlEmail` accepts an optional `bcc` list.
