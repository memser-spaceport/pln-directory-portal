# Investors CSV — header & value aliases

Source of truth: `pln-directory-portal/apps/back-office/utils/investor-csv.ts`

Headers are normalized before matching: lowercased, trimmed, and spaces / `-` / `.` replaced with `_`.

## Column header aliases

| Field | Accepted headers |
| --- | --- |
| `email` | `email`, `e-mail`, `email_address` |
| `name` | `name`, `full_name`, `investor_name`, `participant_name` |
| `organization` | `organization_fund_name`, `organization/fund_name`, `organization_/_fund_name`, `organisation_/_fund_name`, `organisation/fund_name`, `organisation_fund_name`, `org_fund_name`, `org/fund_name`, `org_/_fund_name`, `organization`, `organization_name`, `org`, `org_name`, `team`, `team_name`, `fund`, `fund_name`, `company` |
| `organization_email` | `organization_email`, `organization_fund_email`, `organization/fund_email`, `organization_/_fund_email`, `org_fund_email`, `org/fund_email`, `org_/_fund_email`, `fund_email`, `fundemail`, `org_email`, `team_email`, `contact_email`, `organizationemail` |
| `twitter_handler` (X) | `x`, `x_handle`, `twitter`, `twitter_handle`, `x_username`, `twitter_handler` |
| `linkedin_handler` | `linkedin`, `linkedin_handle`, `linkedin_handler`, `linkedin_url`, `linkedin_profile` |
| `telegram_handler` | `telegram_handler`, `telegram`, `telegram_handle`, `tg` |
| `role` | `role`, `organization_role`, `fund_role`, `organization/fund_role`, `team_role` |
| `investment_type` | `type`, `investment_type`, `invest_type`, `investor_type`, `how_do_you_invest` |
| `typical_check_size` | `typical_check_size`, `check_size` |
| `invest_in_startup_stages` | `investment_stages`, `invest_in_startup_stages` |
| `sec_rules_accepted` | `sec_rules_accepted`, `t&c`, `t_&_c`, `terms_and_conditions`, `terms_&_conditions`, `terms&conditions` |
| `team_lead` | `make_team_lead`, `is_team_lead`, `team_lead`, `lead`, `add_as_team_lead`, `team_lead_flag` |

## Cell value aliases

### `investment_type`

| Maps to | Accepted values |
| --- | --- |
| `ANGEL` | `angel`, `i angel invest`, `angel invest` |
| `FUND` | `fund`, `i invest through fund(s)`, `i invest thru fund(s)` |
| `ANGEL_AND_FUND` | `angel_and_fund`, `angel and fund`, `angel+fund`, `i angel invest + invest through fund(s)`, `i angel invest + i invest thru fund(s)` |

Matching is case-insensitive. Any other value is ignored (`null`).

### `sec_rules_accepted` / `t&c` and `team_lead` (booleans)

| Result | Accepted values |
| --- | --- |
| `true` | `true`, `1`, `yes`, `y` |
| `false` | empty or anything else |

Notes:

- Empty `team_lead` defaults to `true`.
- If `organization` is set, the participant is treated as a team lead unless `team_lead` is explicitly false.

### `typical_check_size`

| Rule | Detail |
| --- | --- |
| Aliases | none |
| Format | plain number only (`parseFloat`) |
| Examples that work | `500000`, `100000.5` |
| Examples that fail | `unknown`, `$1–2M`, `€500k–€4m`, `$50k-$200k` |

### `investment_stages`

| Rule | Detail |
| --- | --- |
| Aliases | none |
| Format | comma-separated list |
| Examples | `Pre-seed,Seed`, `Seed, Series A` |
| Not supported as separators | `\|` (pipe), `/` |

### Social handles

| Field | Accepted formats |
| --- | --- |
| X / Twitter | bare handle, `@handle`, or `x.com/...` |
| LinkedIn | bare handle or `linkedin.com/in/...` |
| Telegram | bare handle, `@handle`, or `t.me/...` |

## Template headers

Downloadable template column order:

`email`, `name`, `organization_name`, `organization_email`, `x_handle`, `linkedin_handle`, `telegram_handler`, `role`, `investment_type`, `typical_check_size`, `investment_stages`, `t&c`, `team_lead`
