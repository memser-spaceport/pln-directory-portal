# AWS Lambda - SES events to PostHog

Product tracks member emails in PostHog: every email type gets `<type>-sent`, `<type>-opened` and `<type>-clicked` events with `subject`, `from_email` and `to_email` (LAB-2918).

SES already publishes these events. The identities `plnetwork.io` and `protocol.ai` use the default configuration set `Tracking`. Its event destination sends every event to the SNS topic `sns-track` (us-west-1). The SES Dashboard (EC2 `ses-dashboard`) and the `ses-notifications-handler` lambda (MySQL `sesdashboard.sns_event`) read the same topic. This function is one more subscriber to it, and it does not touch the other two.

## What it sends

| SES event | PostHog event |
| -- | -- |
| Send | `<type>-sent` |
| Open | `<type>-opened` |
| Click | `<type>-clicked` (plus `link`) |

Every other SES event (Delivery, Bounce, Complaint and the rest) is skipped.

The function finds the email type in two steps:

1. **Tag.** If the SES message tag `email-type` holds a pl-notification-service template name, it maps that name through `TEMPLATE_PREFIXES`. If the tag already holds a prefix such as `digest-email`, it uses the tag as is.
2. **Subject.** Otherwise it tries the patterns in `SUBJECT_RULES`.

Emails that neither step recognises are handled by `UNMATCHED_EMAILS`. By default they are skipped and their subject is logged.

The rest of the event:

- `distinct_id` is the first `To` address, lowercased.
- `uuid` is the SNS MessageId, so an SNS retry does not create a duplicate.
- Emails from the dev senders in `EXCLUDED_SOURCES` are skipped, because dev and prod share the SES account.

Every record writes one JSON log line with these fields:

- `sesEventType`, `emailType`, `matchedBy`
- `source`, `caller` (the `ses:caller-identity` tag)
- `skip`, with the skip reason

The line has no recipient address.

## Environment variables

See `.env.example`.

- `DRY_RUN`: anything except `false` only logs.
- `POSTHOG_HOST`, `POSTHOG_API_KEY`: the project to send to.
- `UNMATCHED_EMAILS`: `skip` (default) or `generic`, which sends unrecognised emails as `other-email-*`.
- `EXCLUDED_SOURCES`: comma-separated sender addresses to ignore. When unset, it defaults to the dev senders.

## Deployment (manual, like lambda-opensearch-sync)

```bash
yarn test   # or: node --test
zip -FS lambda-ses-posthog.zip index.mjs package.json
```

1. Create the function `ses-events-to-posthog` (Node.js 22.x, arm64, 128 MB, timeout 10 s). It has no dependencies and needs no VPC.
2. Upload `lambda-ses-posthog.zip` and set the handler to `index.handler`.
3. Set the environment variables. Start with `DRY_RUN=true`.
4. SNS → topic `sns-track` → Create subscription → protocol `AWS Lambda` → this function.

Rollout:

1. **Dry run.** Run for a day with `DRY_RUN=true` and read the logs (queries below).
2. **Dev project.** Set `DRY_RUN=false` with the dev PostHog project key and check the events.
3. **Prod project.** Switch to the prod key.

To turn it off, delete the SNS subscription.

### CloudWatch Logs Insights

```
fields @timestamp, @message
| filter ispresent(sesEventType)
| stats count() by skip, emailType, matchedBy
```

```
fields subject
| filter skip = "unmatched"
| stats count() by subject
| sort count() desc
```

```
fields source, caller
| stats count() by source, caller
```
