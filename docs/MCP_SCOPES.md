# MCP scopes (LAB-2995)

What an agent connected to LabOS over MCP may list and call. The rules are in `openspec/specs/mcp-scopes/spec.md`; this
page is the working map.

## Registry

`apps/web-api/src/mcp/mcp-scopes.registry.ts` is the reviewed allowlist. Every tool has one scope and one level (`read`
or `write`). A tool missing from it is never listed or callable (`whoami` aside), and a spec fails when a catalog tool
has no entry. Adding a tool to MCP means adding it there.

| Scope | Label | Tools | Write tools |
| --- | --- | --- | --- |
| `search` | Search | `search_members`, `search_teams`, `search_projects`, `search_events` | none |
| `forum` | Forum | `search_forum_threads`, `get_forum_thread` | none |
| `news` | News feed | `list_news` (feed `latest` = Home → Latest, `for_you` = one latest story per For You team, falls back to latest; `teamUid` = one team), `get_news_item` | `post_team_news` (team members / admins; duplicate link rejected), `upvote_team_news`, `remove_team_news_upvote` |
| `directory` | Members, teams and projects | `get_member`, `get_team`, `get_project`, `list_portfolio_teams` | `update_team` (text, name, year founded, size, locations, funding stage, industry tags; status for admins; no logo), `update_team_fund_profile` (lead or admin; non-leads are refused), `update_team_membership_sources` (directory admin only), `update_team_communities`, `update_team_roster`, `create_team`, `delete_team` (admin), `review_team_enrichment`, `create_project`, `delete_project`, team and project asks, hiring-lead match criteria and applicant review, `update_fundraising_profile`, `update_team_pitch_profile` |
| `events` | Events | `get_event` | `rsvp_event`, `cancel_event_rsvp`, `update_my_event_rsvp`, `submit_event`, `request_event_presence` |
| `investors` | Investors and warm intros | master-profile and warm-intro reads | `submit_warm_path_feedback`, `submit_warm_path_note`, `clear_warm_path_refer`, `update_master_profile`, `update_connection_edge`, `update_warm_path`, `regenerate_warm_intro`, investor list add and remove, pathfinder correction and crosswalk resolve, `review_sourced_founder` |
| `profile` | Your profile | `get_my_profile`, `list_my_experiences`, `get_my_job_alert`, `get_my_email_preferences`, `list_my_notifications`, `list_deals`, `list_my_office_hours_followups`, `list_my_job_applications`, `list_my_job_interests` | `update_my_profile` (bio, moreDetails, social handles including bluesky, officeHours, openToWork, jobSearchStatus, skills, name, currentCompany, teamOrProjectURL, plnFriend, plnStartDate, city, region, country; not email); `update_my_investor_profile`; `update_my_privacy`; `update_my_team_membership`; `update_my_project_contribution`; `update_my_self_role`; `delete_my_image`; `update_notification_settings`; join/leave team and project; experiences; follow; saved jobs; job alert; email preferences; Demo Day save; notifications; deals used/report (no redeem); `submit_deal`; `request_deal`; guide likes and comments; office hours request, close and broken-link report; Demo Day and pitch confidentiality, apply and express interest; jobs apply, interest and refer; support; roadmap create, edit, pin and unpin when the member has that permission |
| `ai_apps` | AI Apps | `list_my_ai_apps`, `list_ai_app_feedback` | `update_ai_app_feedback_status`; `submit_ai_app_feedback`; `redeploy_ai_app` (stored bundle + stored secrets), `rename_ai_app`, `update_ai_app_description`, `delete_ai_app`, `delete_ai_app_deployment`, `update_ai_app_access`, `update_ai_app_public_paths` (app creator or directory admin, `ai_apps.write`). No deploy keys |

Member RBAC still applies on top (investor DB tools need `investor_db.view` / `.edit`, forum tools `forum.read`).

## Levels

- **Per connection.** `McpAuthorization.scopeLevels` holds `{ [scope]: 'none' | 'read' | 'write' }`. A scope with no
  key is `read`. Consent stores `read` for every scope (or `none` where admins set `none`); `allowChanges` is ignored.
  Write is turned on later in Settings → MCP connections (`PATCH /v1/mcp/authorizations/:uid/scopes`).
- **Admin caps.** `McpScopeSetting` holds a maximum per scope for everyone; no row means not capped. Read and set with
  `GET` / `PUT /v1/admin/mcp/scopes` (`AdminAuthGuard`, body `{ scopes: { [scope]: level } }`). There is no admin UI yet.
- **Effective level** = the lower of the stored level, the admin cap, and what the scope's tools allow. Read on every
  MCP request, so a change applies to the next call without reconnecting. Lowering a cap does not rewrite stored levels.
- **AI-app sessions and member proofs** take `agentAccess` / `access` from the effective `ai_apps` level.

## What the agent sees

| Situation | `tools/list` | A call |
| --- | --- | --- |
| Effective level covers the tool | listed | runs |
| Write tool, connection at `read`, member may raise to `write` | listed, description starts `[Needs write access: …]` | `isError`: "This needs write access to <Label> for this connection. Ask the member to allow it in LabOS: <WEB_UI_BASE_URL>/settings/mcp?request=<uid>" |
| Connection set the scope to `none` | hidden | same refusal, "read access" (or "write access" for a write tool) |
| Admin cap below the tool's level | hidden | `isError`: "<Label> is turned off by LabOS admins." (write tools: "Changes in <Label> are turned off…"), no link |
| Scope settings can't be read | only `whoami` | `isError`: "LabOS couldn't check this connection's permissions. Try again later." |

A hidden tool is registered on the per-request server only when the request's JSON-RPC body names it in `tools/call`,
so it never appears in `tools/list`. Every refusal except the last sends PostHog `mcp-tool-refused` (`toolName`,
`scope`, `reason`: `needs_write`, `scope_none`, `admin_off`). Level saves send `mcp-scope-levels-updated`; admin changes
`mcp-admin-scope-updated`.

## Analytics: one event per tool (LAB-3050)

Every MCP tool call sends a server-side PostHog event named `mcp-<tool name with dashes>-called`
(`apps/web-api/src/mcp/mcp-analytics.ts`): when the tool runs (`result: ok`), when it throws (`result: error`, with
`errorKind`, the exception class name), and when it is refused (`result: refused`, with `reason`: `needs_write`,
`scope_none`, `admin_off`, `rate_limited` or `unavailable`). `mcp-tool-invoked` and `mcp-tool-refused` are still sent
as before, beside it.

Every per-tool event has `toolName`, `memberUid`, `authorizationUid` (the connection), `clientName`, `scope` (from the
registry; `unscoped` for `whoami`), `operation` (`read` or `write`) and `result`. A refused event has no other
property. Search and list tools add their query text as `query`, trimmed to 200 characters (investor DB searches
excepted: their text is a person's name or email). Write tools send item ids, field names and counts, never values:
no message text, body, note, email, Telegram or LinkedIn value reaches an event. `MCP_TOOL_PROPERTY_BUILDERS` has
one entry per tool; a spec fails when a registry tool has none, so a new tool needs one.

| Event | Sent when | Properties beside the common ones (ok and error) |
| --- | --- | --- |
| `mcp-whoami-called` | an agent calls `whoami` | none |
| `mcp-search-members-called` | an agent calls `search_members` | `query`, `limit`, `resultCount` |
| `mcp-search-teams-called` | an agent calls `search_teams` | `query`, `limit`, `resultCount` |
| `mcp-search-projects-called` | an agent calls `search_projects` | `query`, `limit`, `resultCount` |
| `mcp-search-events-called` | an agent calls `search_events` | `query`, `limit`, `resultCount` |
| `mcp-search-forum-threads-called` | an agent calls `search_forum_threads` | `query`, `limit`, `resultCount` |
| `mcp-get-forum-thread-called` | an agent calls `get_forum_thread` | `uid` |
| `mcp-list-news-called` | an agent calls `list_news` | `query`, `feed`, `teamUid`, `limit`, `page`, `resultCount`, `hasMore` |
| `mcp-get-news-item-called` | an agent calls `get_news_item` | `uid` |
| `mcp-post-team-news-called` | an agent calls `post_team_news` | `teamUid`, `newsUid`, `hasBody` |
| `mcp-get-member-called` | an agent calls `get_member` | `uid` |
| `mcp-get-team-called` | an agent calls `get_team` | `uid` |
| `mcp-get-project-called` | an agent calls `get_project` | `uid` |
| `mcp-list-portfolio-teams-called` | an agent calls `list_portfolio_teams` | `query`, `hasQuery`, `island`, `limit`, `offset`, `resultCount`, `total` |
| `mcp-update-team-called` | an agent calls `update_team` | `teamUid`, `fields`, `fieldCount` |
| `mcp-update-project-called` | an agent calls `update_project` | `projectUid`, `fields`, `fieldCount` |
| `mcp-get-event-called` | an agent calls `get_event` | `uid` |
| `mcp-rsvp-event-called` | an agent calls `rsvp_event` | `eventUid`, `teamUid`, `alreadyGoing` |
| `mcp-cancel-event-rsvp-called` | an agent calls `cancel_event_rsvp` | `eventUid`, `wasGoing` |
| `mcp-search-master-profiles-called` | an agent calls `search_master_profiles` | `type`, `limit`, `offset`, `resultCount` (no name or email) |
| `mcp-get-master-profile-called` | an agent calls `get_master_profile` | `uid` |
| `mcp-search-warm-intro-investors-called` | an agent calls `search_warm_intro_investors` | `limit`, `offset`, `resultCount`, `total` (no search text) |
| `mcp-get-warm-intro-investor-called` | an agent calls `get_warm_intro_investor` | `profileUid`, `pathCount` |
| `mcp-get-warm-path-feedback-called` | an agent calls `get_warm_path_feedback` | `warmPathUid`, `connectorProfileUid`, `hasNote` |
| `mcp-get-warm-path-note-called` | an agent calls `get_warm_path_note` | `warmPathUid`, `connectorProfileUid`, `hasNote` |
| `mcp-submit-warm-path-feedback-called` | an agent calls `submit_warm_path_feedback` | `warmPathUid`, `connectorProfileUid`, `isClear` |
| `mcp-submit-warm-path-note-called` | an agent calls `submit_warm_path_note` | `warmPathUid`, `connectorProfileUid`, `isClear` |
| `mcp-update-master-profile-called` | an agent calls `update_master_profile` | `uid`, `fieldCount` |
| `mcp-update-connection-edge-called` | an agent calls `update_connection_edge` | `uid`, `fieldCount` |
| `mcp-update-warm-path-called` | an agent calls `update_warm_path` | `uid`, `fieldCount` |
| `mcp-get-my-profile-called` | an agent calls `get_my_profile` | none |
| `mcp-update-my-profile-called` | an agent calls `update_my_profile` | `fields`, `fieldCount` |
| `mcp-join-team-called` | an agent calls `join_team` | `teamUid`, `mainTeam`, `hasRole` |
| `mcp-leave-team-called` | an agent calls `leave_team` | `teamUid` |
| `mcp-join-project-called` | an agent calls `join_project` | `projectUid`, `fields`, `fieldCount` |
| `mcp-leave-project-called` | an agent calls `leave_project` | `projectUid` |
| `mcp-list-my-experiences-called` | an agent calls `list_my_experiences` | `resultCount` |
| `mcp-add-experience-called` | an agent calls `add_experience` | `experienceUid`, `fields`, `fieldCount` |
| `mcp-update-experience-called` | an agent calls `update_experience` | `experienceUid`, `fields`, `fieldCount` |
| `mcp-delete-experience-called` | an agent calls `delete_experience` | `experienceUid` |
| `mcp-follow-team-called` | an agent calls `follow_team` | `teamUid` |
| `mcp-unfollow-team-called` | an agent calls `unfollow_team` | `teamUid` |
| `mcp-save-job-called` | an agent calls `save_job` | `jobUid` |
| `mcp-unsave-job-called` | an agent calls `unsave_job` | `jobUid` |
| `mcp-get-my-job-alert-called` | an agent calls `get_my_job_alert` | none |
| `mcp-set-job-alert-called` | an agent calls `set_job_alert` | `fields`, `fieldCount` |
| `mcp-delete-job-alert-called` | an agent calls `delete_job_alert` | none |
| `mcp-get-my-email-preferences-called` | an agent calls `get_my_email_preferences` | none |
| `mcp-update-email-preferences-called` | an agent calls `update_email_preferences` | `fields`, `fieldCount` |
| `mcp-save-demo-day-team-called` | an agent calls `save_demo_day_team` | `demoDay`, `teamUid` |
| `mcp-unsave-demo-day-team-called` | an agent calls `unsave_demo_day_team` | `demoDay`, `teamUid` |
| `mcp-list-my-ai-apps-called` | an agent calls `list_my_ai_apps` | `resultCount` |
| `mcp-list-ai-app-feedback-called` | an agent calls `list_ai_app_feedback` | `appUid`, `status`, `limit`, `offset`, `resultCount`, `total` |
| `mcp-update-ai-app-feedback-status-called` | an agent calls `update_ai_app_feedback_status` | `appUid`, `feedbackUid`, `status`, `hasNote` |

## Access requests

Each member-fixable refusal (`needs_write`, `scope_none`) creates an `McpAccessRequest` or reuses the open one for the
same connection and scope from the last 24 hours (a write refusal raises a read request to write). The refusal links to
`/settings/mcp?request=<uid>`. If the request can't be stored, the refusal still goes out with the plain link.
`admin_off` refusals get no request.

- `GET /v1/mcp/access-requests/:uid` (member guards, `mcp.connect`) returns
  `{ uid, authorizationUid, scope, level, toolName, status, createdAt }` to the connection's member only; anyone else
  gets 404. `status` is `open`, `resolved`, or `expired` (unresolved for 7 days).
- `PATCH /v1/mcp/authorizations/:uid/scopes` with `requestUid` resolves the request when the save reaches the
  requested level on that same connection. `mcp-scope-levels-updated` carries `viaRequest` and `requestResolved`.
- The table is also the "Blocked by permissions" record for the activity drawer (LAB-2938).

## Write limit

Every write tool allows 10 calls per member per tool per hour (`McpWriteLimitService`, a fixed-window counter in the
shared cache). Over the limit the call is refused with "LabOS limits agents to 10 <tool> calls an hour. Try again
later." and `mcp-tool-refused` reason `rate_limited`; no access request is created. If the cache is unavailable the
call is allowed.
