## Why

AI Search answers only from the directory tools, and the prompt forbids answers from general knowledge. Directory data for teams, members and projects is often thin, so many answers say that the directory has no information. Ticket: [LAB-2621](https://linear.app/protocollabs/issue/LAB-2621/ai-search-fill-thin-answers-with-labeled-web-sources).

## What Changes

- A new `searchWeb` tool in the Husky tool set. The model calls it only when the directory data is not enough, for any type of question.
- Web pages that the answer cites become source refs with the new type `web` (`externalUrl`, no `directoryLink`).
- The prompts tell the model to keep directory facts first and to label web facts as web information.
- A failed or slow web search gives a directory-only answer, with no error.

Out of scope: new endpoints, guards, environment variables, dependency upgrades and migrations; other Husky endpoints (threads, generation, bios).

## Capabilities

### New Capabilities

- `ai-search`: when AI Search uses the public web and how it labels web sources.

## Impact

- `POST /v1/husky/chat/contextual-tools`: answers can cite web pages; `sourceRefs[].type` has the new value `web`; the stream shows the step "Searching the web".
- The frontend (pln-directory-portal-v2) shows web sources in their own group.
