## 1. Contract

- [x] 1.1 Add the request schema and error codes in `libs/contracts/src/schema/labos-agent.ts`.

## 2. AI search extension

- [x] 2.1 Add the optional `ContextualToolsOptions` argument to `createContextualToolsResponse` (prompt context, extra tools, extra response fields, `persistHistory`).
- [x] 2.2 Test that AI search callers see no change and that the options apply.

## 3. Module

- [x] 3.1 Add `LabosAgentAccessService.isEnabled` with the temporary D1 rule.
- [x] 3.2 Add `LabosAgentService` (gate, story lookup, MCP news tools as agent tools) and `LabosAgentController` (validation, stream).
- [x] 3.3 Register `LabosAgentModule` in `AppModule`.
- [x] 3.4 Tests: validation, guard, 403 on production, access both ways, 404 unknown story, happy path.
