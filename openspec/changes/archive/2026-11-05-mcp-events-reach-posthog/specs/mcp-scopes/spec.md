## MODIFIED Requirements

### Requirement: Each MCP tool call sends its own event
Each MCP tool call SHALL send a PostHog event named `mcp-<tool name with dashes>-called`, with `result` `ok`, `error` (plus `errorKind`) or `refused` (plus `reason`), and `toolName`, `memberUid`, `authorizationUid`, `clientName`, `scope` and `operation`. Search and list tools SHALL add the query text, at most 200 characters, and filters. Write tools SHALL send only ids, field names and counts. `mcp-tool-invoked` SHALL still be sent. When `ANALYTICS_PROVIDER` is not `posthog`, the same MCP events SHALL still be sent to PostHog if `POSTHOG_API_KEY` and `POSTHOG_HOST` are set.

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

#### Scenario: Database provider still reaches PostHog
- **GIVEN** `ANALYTICS_PROVIDER` is `db` and PostHog is configured
- **WHEN** an agent calls `search_members`
- **THEN** PostHog gets `mcp-search-members-called` and `mcp-tool-invoked`
