# ai-search Specification

## Purpose

AI Search answers member and visitor questions from the directory tools through the Husky contextual-tools stream. This spec covers when the answer also uses the public web and how web sources are labeled.

## Requirements

### Requirement: Web search fills thin directory answers

AI Search (`POST /v1/husky/chat/contextual-tools`) SHALL give the answer model a `searchWeb` tool. The model SHALL call it only when the directory tools return nothing relevant or too little to answer the question, for any type of question. When the directory data answers the question, the answer SHALL use directory data only and no source SHALL have the type `web`.

#### Scenario: Thin directory data

- **GIVEN** the directory has only a short description for a team
- **WHEN** a member asks what that team builds
- **THEN** the model calls `searchWeb`
- **AND** the answer adds web facts with numbered citations

#### Scenario: Enough directory data

- **GIVEN** the directory has full data for the question, for example the open jobs of a team
- **WHEN** a member asks it
- **THEN** `searchWeb` is not called
- **AND** no source has the type `web`

#### Scenario: A question that is not about the directory

- **GIVEN** the directory tools return nothing relevant for "What is a zero-knowledge proof?"
- **WHEN** a member asks it
- **THEN** the model calls `searchWeb`
- **AND** the answer labels its facts as web information

### Requirement: Web pages are labeled web sources

Each web page that the answer cites SHALL become a source ref with `type: "web"` and an `externalUrl`, and with no `directoryLink`. The answer text SHALL put directory facts first and SHALL label web facts as web information. A cited URL that no tool returned SHALL keep the type `external`. While the web search runs, the stream SHALL show the step "Searching the web".

#### Scenario: An answer with both kinds of source

- **WHEN** an answer cites a team page and a web page
- **THEN** `sourceRefs` holds a `team` ref with a `directoryLink`
- **AND** a `web` ref with the page URL as `externalUrl` and no `directoryLink`

### Requirement: Web search failure gives a directory-only answer

When the web search fails, takes more than 20 seconds, or finds no page, the `searchWeb` tool SHALL return a short "web search not available" result and log the failure. The answer SHALL stream to the end from directory data only, with no error for the member. On an Anthropic or Opus setup the web search SHALL use Gemini search grounding.

#### Scenario: The web search times out

- **WHEN** the web call takes more than 20 seconds
- **THEN** the tool returns "web search not available"
- **AND** the answer streams to the end without a web source

### Requirement: The web query holds no member data

The `searchWeb` tool SHALL receive only the query text that the model writes. It SHALL NOT receive the auth context, the member email or other signed-in member data. The prompt SHALL tell the model not to put personal data or data from the Investor DB, warm intro or investor profile tools in the query.

#### Scenario: A signed-in member asks a question

- **WHEN** a signed-in member asks a question that needs the web
- **THEN** the web search call gets the model query only, with no member data
