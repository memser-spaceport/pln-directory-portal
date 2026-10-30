## 1. Per-tool events

- [x] 1.1 Add one property builder per tool and `trackMcpToolCalled` in `mcp-analytics.ts`; a spec fails when a registry tool has no builder
- [x] 1.2 Send the per-tool event from the MCP controller on ok, error and refused calls
- [x] 1.3 List each event with its trigger in `docs/MCP_SCOPES.md`

## 2. Checks

- [x] 2.1 Run the web-api lint and tests (`yarn nx run web-api:lint`, `yarn nx run web-api:test`)
- [x] 2.2 Run `openspec validate lab-3050-posthog-event-for-each-mcp-tool-call --strict`
