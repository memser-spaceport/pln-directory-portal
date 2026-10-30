## MODIFIED Requirements

### Requirement: Refusals explain themselves and link to the fix
A call refused for a member-fixable reason (`needs_write` or `scope_none`) SHALL return `isError` with text naming the scope and level needed, plus a link `<WEB_UI_BASE_URL>/settings/mcp?request=<id>`. A call refused because of the admin maximum SHALL say the feature is turned off by LabOS admins and SHALL have no link. Every refusal SHALL emit PostHog `mcp-tool-refused` with `toolName`, `scope`, `reason` (`needs_write`, `scope_none`, `admin_off`) and `authorizationUid`. Every refusal SHALL also send the tool's per-tool event with `result: refused` and the `reason`. The agent SHALL NOT be able to change levels through MCP.

#### Scenario: Needs-write refusal
- **WHEN** a read-level connection calls `submit_warm_path_note`
- **THEN** the result is an error that says it needs write on "Investors and warm intros" and contains a `/settings/mcp?request=` link, and nothing is written
- **AND** PostHog gets `mcp-tool-refused` and `mcp-submit-warm-path-note-called` with `result: refused` and `reason: needs_write`

## ADDED Requirements

### Requirement: Each MCP tool call sends its own event
Each MCP tool call SHALL send a PostHog event named `mcp-<tool name with dashes>-called`, with `result` `ok`, `error` (plus `errorKind`) or `refused` (plus `reason`), and `toolName`, `memberUid`, `authorizationUid`, `clientName`, `scope` and `operation`. Search and list tools SHALL add the query text, at most 200 characters, and filters. Write tools SHALL send only ids, field names and counts. `mcp-tool-invoked` SHALL still be sent.

#### Scenario: Search call
- **GIVEN** a connected agent
- **WHEN** it calls `search_members` with a query
- **THEN** PostHog gets `mcp-search-members-called` with `result: ok`, the query and `resultCount`

#### Scenario: Write call sends no text
- **WHEN** an agent calls `post_team_news` with a title and body
- **THEN** `mcp-post-team-news-called` has the team uid and the news uid, and no title or body text

#### Scenario: Tool throws
- **WHEN** a tool call throws
- **THEN** its per-tool event has `result: error` and `errorKind`, and no error message

#### Scenario: Every tool has an event
- **WHEN** a tool is in the registry, or is `whoami`
- **THEN** it has one per-tool event name and one property builder
