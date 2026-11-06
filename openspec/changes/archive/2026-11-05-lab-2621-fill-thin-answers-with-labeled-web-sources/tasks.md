## 1. Backend

- [x] 1.1 Add the `searchWeb` tool (`husky/tools/web-search.tool.ts`) and register it in `HuskyAiToolsService`; verify with `web-search.tool.spec.ts` and `husky-ai-tools.service.spec.ts`
- [x] 1.2 Map `[WebLink]` pages to `type: "web"` source refs and add `web` to `HuskySourceRefSchema`; verify with `source-refs.spec.ts`
- [x] 1.3 Show the "Searching the web" step; verify with `husky-ai.service.spec.ts`
- [x] 1.4 Change the contextual-tools, continuation and structured prompts; verify with `ai-prompts.spec.ts`

## 2. Checks

- [x] 2.1 Run `yarn typecheck:api`, `yarn nx run web-api:lint`, `yarn nx run web-api:test` and `yarn build web-api`
