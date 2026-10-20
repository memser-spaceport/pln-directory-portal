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

The function finds the email type in three steps:

1. **Tag.** If the SES message tag `email-type` holds a pl-notification-service template name, it maps that name through `TEMPLATE_PREFIXES`. If the tag already holds a prefix such as `digest-email`, it uses the tag as is.
2. **Sender.** A sender used by one email type only, listed in `SOURCE_PREFIXES`. For now that is `labos@plnetwork.io`, which is SPV Spotlight.
3. **Subject.** Otherwise it tries the patterns in `SUBJECT_RULES`.

Emails that no step recognises are handled by `UNMATCHED_EMAILS`. By default they are skipped and their subject is logged.

The rest of the event:

- `distinct_id` is the first `To` address, lowercased.
- `uuid` is the SNS MessageId, so an SNS retry does not create a duplicate.
- Dev and prod share the SES account and the topic, so each email is attributed to an environment. The SES tag `ses:caller-identity` names the IAM role that sent it:
  - prod: `<service>-prod-irsa`, `prod_noderole`;
  - not prod: `<service>-dev-irsa`, `-uat-irsa`, `preprod_dev_noderole` (feature envs).

  The dev sender addresses in `DEV_SOURCES` are the fallback. A function takes only the emails of its `TARGET_ENV` and skips the rest with `other-env`.

Every record writes one JSON log line with these fields:

- `sesEventType`, `emailType`, `matchedBy`, `tag`
- `source`, `caller` (the `ses:caller-identity` tag), `env`, `targetEnv`
- `skip`, with the skip reason

The line has no recipient address.

## Functions

Two functions, one per environment, are subscribed to `sns-track`:

| Function | `TARGET_ENV` | `POSTHOG_SSM_PREFIX` | PostHog project |
| -- | -- | -- | -- |
| `ses-events-to-posthog` | `prod` | `/prod/directory-service` | prod |
| `ses-events-to-posthog-dev` | `dev` | `/dev/directory-service` | dev |

## Environment variables

See `.env.example`.

- `TARGET_ENV`: `prod` (default) or `dev`, which also covers UAT and feature envs.
- `POSTHOG_SSM_PREFIX`: the host and the key are read from SSM `<prefix>/POSTHOG_HOST` and `<prefix>/POSTHOG_API_KEY`, the same parameters directory-service uses. They are cached for five minutes.
- `POSTHOG_HOST`, `POSTHOG_API_KEY`: optional; when set, they win over SSM.
- `DRY_RUN`: anything except `false` only logs.
- `UNMATCHED_EMAILS`: `skip` (default) or `generic`, which sends unrecognised emails as `other-email-*`.
- `DEV_SOURCES`: comma-separated dev sender addresses. When unset, it defaults to the dev `SES_SOURCE_EMAIL` values.

## Deployment (manual, like lambda-opensearch-sync)

```bash
yarn test   # or: node --test
zip -FS lambda-ses-posthog.zip index.mjs package.json
```

1. Create the function (Node.js 22.x, arm64, 128 MB, timeout 10 s). It has no dependencies, because the runtime ships AWS SDK v3, and it needs no VPC.
2. Upload `lambda-ses-posthog.zip` and set the handler to `index.handler`.
3. The execution role needs `ssm:GetParameters` on `<prefix>/POSTHOG_*` and `kms:Decrypt` on the `aws/ssm` key through SSM, plus CloudWatch Logs.
4. Set the environment variables. Start with `DRY_RUN=true`.
5. SNS → topic `sns-track` → Create subscription → protocol `AWS Lambda` → this function.

Rollout:

1. **Dev.** `ses-events-to-posthog-dev` with `DRY_RUN=false`; check the events in the dev PostHog project.
2. **Prod dry run.** `ses-events-to-posthog` with `DRY_RUN=true`; read the logs (queries below).
3. **Prod.** Set `DRY_RUN=false` on `ses-events-to-posthog`.

To turn a function off, delete its SNS subscription.

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
fields source, caller, env
| stats count() by source, caller, env
```
