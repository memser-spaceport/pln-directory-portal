import { Injectable, Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  AI_APP_TOKEN_HEADER,
  AI_APPS_APP_DOMAIN,
  AI_APPS_APP_SETTINGS_ENDPOINT,
  AI_APPS_CONNECT_ENDPOINT,
  AI_APPS_DEPLOY_ENDPOINT,
  AI_APPS_DRAFT_ENDPOINT,
  AI_APPS_ME_ENDPOINT,
  AI_APPS_METADATA_ENDPOINT,
  AI_APPS_STARTER_KIT_VERSION,
} from './ai-apps.constants';

/** Curated PL Design System folder, shipped as files inside the starter kit. */
const DESIGN_SYSTEM_DIR = 'pl-design-system';

/**
 * Builds the "AI Apps" starter kit ZIP a member downloads and unpacks into their
 * AI coding tool (Claude Code, Cursor, …). It carries deploy instructions for the
 * agent, a minimal runnable app scaffold, and the curated PL Design System (React
 * components + design tokens + usage guidelines) — but no deploy token and no PLN
 * private API info. At deploy time the agent runs the LabOS connect flow to obtain
 * a short-lived deploy token.
 */
@Injectable()
export class AiAppsStarterKitService {
  private readonly logger = new Logger(AiAppsStarterKitService.name);

  buildZip(): Buffer {
    const zip = new AdmZip();
    const add = (path: string, content: string) => zip.addFile(path, Buffer.from(content, 'utf8'));

    add('README.md', this.readme());
    add('CLAUDE.md', this.agentInstructions());
    add('AGENTS.md', this.agentInstructions());
    add('.claude/skills/deploy-to-labs/SKILL.md', this.deploySkill());
    add('.claude/skills/app-metadata/SKILL.md', this.metadataSkill());
    add('.claude/skills/pl-design-system/SKILL.md', this.designSystemSkill());
    add('.claude/skills/pln-member-context/SKILL.md', this.memberContextSkill());
    add('pln-app.config.json', this.configJson());
    add('styles/pln-theme.css', this.themeCss());
    add('styles/FONTS.md', this.fontsDoc());
    add('app/server.js', this.appServer());
    add('app/package.json', this.appPackageJson());
    add('app/Dockerfile', this.appDockerfile());
    add('app/.dockerignore', 'node_modules\nnpm-debug.log\n');

    this.addDesignSystem(zip);

    return zip.toBuffer();
  }

  /**
   * Locate the curated design-system folder. In a built app it sits next to the
   * compiled code (`dist/apps/web-api/ai-apps/assets/pl-design-system`, see
   * `apps/web-api/project.json` assets); the source path is the fallback for
   * unbundled runs (tests / ts-node).
   */
  private designSystemDirPath(): string {
    const candidates = [
      join(__dirname, 'ai-apps', 'assets', DESIGN_SYSTEM_DIR),
      join(process.cwd(), 'apps', 'web-api', 'src', 'ai-apps', 'assets', DESIGN_SYSTEM_DIR),
    ];
    return candidates.find((p) => existsSync(p)) ?? candidates[0];
  }

  /**
   * Embed the curated design-system tree as normal files under `pl-design-system/`
   * in the kit (no nested zip). Missing asset must never break the kit download.
   */
  private addDesignSystem(zip: AdmZip): void {
    const root = this.designSystemDirPath();
    if (!existsSync(root)) {
      this.logger.warn(`PL Design System folder not found at ${root}; shipping starter kit without it.`);
      return;
    }
    this.addDirectoryToZip(zip, root, DESIGN_SYSTEM_DIR);
  }

  private addDirectoryToZip(zip: AdmZip, absDir: string, zipPrefix: string): void {
    for (const name of readdirSync(absDir)) {
      if (name === '.DS_Store') continue;
      const abs = join(absDir, name);
      const entry = join(zipPrefix, name);
      if (statSync(abs).isDirectory()) {
        this.addDirectoryToZip(zip, abs, entry);
      } else {
        zip.addFile(entry.replace(/\\/g, '/'), readFileSync(abs));
      }
    }
  }

  private readme(): string {
    return `# PLN AI Apps — Starter Kit v${AI_APPS_STARTER_KIT_VERSION}

Welcome! This kit lets you vibe-code an app with your AI assistant and deploy it
to the Protocol Labs Network sandbox with a single instruction.

## What's inside
- \`CLAUDE.md\` / \`AGENTS.md\` — instructions your AI agent reads automatically.
- \`.claude/skills/deploy-to-labs/\` — the deploy skill your agent uses.
- \`.claude/skills/app-metadata/\` — how your agent names/describes your app and
  adds an optional one-pager PRD (always with your approval).
- \`.claude/skills/pl-design-system/\` — how to build on-brand UI with the PL Design System.
- \`.claude/skills/pln-member-context/\` — how your app can know which PLN member is using it.
- \`pln-app.config.json\` — the LabOS connect + deploy endpoints (no secrets).
- \`pl-design-system/\` — the **PL Design System**: ready-made React components
  (Button, MemberCard, TeamCard, Table, Tabs, Badge, PageHeader, SearchInput,
  Pagination, …), SCSS design tokens, the Inter font, and \`USAGE.md\` /
  \`guidelines.md\`. Your agent uses these instead of hand-building UI.
- \`styles/\` — a tiny CSS-variable fallback (\`pln-theme.css\`) for plain-HTML apps
  that don't use React, plus font guidance.
- \`app/\` — a minimal runnable Node app to start from (its \`server.js\`,
  \`package.json\`, and \`Dockerfile\` are placeholders you can replace).

## How to use
1. Unzip this folder and open it in Claude Code (or your AI tool of choice).
2. Add your app to the \`app/\` folder:
   - **New app:** tell your agent what to build (e.g. "build a leaderboard page
     using the PLN styles"). It works in \`app/\`.
   - **Existing app:** copy your project's files into \`app/\`, then say "migrate this
     existing app and deploy it to LabOS". Your agent takes care of whatever setup is
     needed to run it there.
3. When you're happy, say "deploy this app". Before the first deploy your agent
   suggests a name and short description for your app — approve them or ask for
   changes. The first time you deploy, your agent will also give you a LabOS
   link to open and approve — sign in and click **Approve** to authorize the
   deploy. Your agent then ships the app to the PLN sandbox; the first deploy
   can take a minute or two.
4. Your app appears on the PL Infra → AI Apps dashboard, where you can open it. 
   After the first deploy your agent offers an optional **one-pager PRD** — a
   short product brief (why the app exists and what it does) shown with your
   app; say yes and approve the draft, or skip it. You can rename your app,
   edit its description, or change the PRD anytime — just ask your agent; no
   redeploy needed.

## Apps that need an API key or password (secrets)
Some apps need a secret to work — for example an app that talks to ChatGPT/OpenAI,
sends emails, or connects to a database needs an **API key** or password for that
service. If yours does, the flow is slightly different, and your agent handles it
for you:

1. Build your app as usual — just tell your agent what you want (e.g. "an app that
   summarizes news with ChatGPT"). It knows the app will need a key.
2. **Never paste your API key into the chat** (and don't put it in any file). If
   you do it by accident, your agent will ask you to use the secure page instead.
3. When it's time to deploy, your agent registers the app as a **draft** and gives
   you a LabOS link. Open it, enter your key(s) in the form there, and click
   **Deploy** — that page is the only place your secrets should ever go.
4. Updating a key later? On the PL Infra → AI Apps dashboard, open the **⋯ menu**
   on your app's card (it's also on the app's own page) and choose **Deployment
   settings** — click **Replace** on the value you want to change, enter the new
   one, and click **Redeploy**.

Secrets never go into the code, the chat, or the uploaded ZIP — they are stored
securely on the sandbox and injected into your app when it runs.

## Personalized apps (who's using it)
Your app can know which PLN member opened it. When a signed-in member with AI
Apps access uses your app, it can fetch their public directory profile — name,
photo, teams, role, skills — to greet them, tag their feedback, or tailor what
it shows. Just ask your agent, e.g. *"greet me by name and show my team when I
open the app"*. Visitors who aren't signed in (or lack access) simply get the
non-personalized version — your app keeps working for them.

## Embedding in the dashboard
Your app is shown inside the AI Apps dashboard. Apps built with this kit display
correctly out of the box, and your agent checks this for you on every deploy — so you
don't need to do anything special. (The technical rule lives in \`AGENTS.md\` for your
agent's reference.)

## How deploy authorization works
This kit contains **no token**. When your agent deploys, it asks LabOS for a
short-lived deploy credential: you open a LabOS link, sign in, and approve. The
credential is tied to your account, expires after about an hour, and is never
written to disk — so this folder is safe to commit or share (it grants nothing on
its own). Each new deploy session just asks you to approve again.
`;
  }

  private agentInstructions(): string {
    return `# AI Agent Instructions — PLN AI Apps

You are helping a Protocol Labs Network member build and deploy a small web app
to the PLN sandbox. Follow these rules.

**Skills note (non-Claude tools):** detailed how-to guides live as plain
markdown under \`.claude/skills/<name>/SKILL.md\`. Claude Code discovers them
automatically; if you are a different agent (Codex, Cursor, etc.), just READ
the referenced file whenever these instructions say to "load a skill" — they
are ordinary docs, not Claude-specific magic.

## Building the app
- All application code lives in the \`app/\` directory.
- \`app/\` must stay independently runnable: \`npm install && npm start\` serves it
  on the port given by the \`PORT\` env var (default 3000), bound to \`0.0.0.0\` (not
  \`localhost\` — the container must accept connections from outside it).
- The app must expose a \`GET /health\` endpoint returning HTTP 200, and a usable
  \`GET /\` (the dashboard loads the app at its root — a bare \`/\` that 404s looks
  broken in the iframe; a redirect to your main page is fine).
- Keep dependencies minimal. The sandbox builds from the \`app/Dockerfile\`.

## Use the PL Design System — do NOT hand-roll UI
This kit ships the **PL Design System** as the ready-to-use \`pl-design-system/\`
folder. Before any UI work, load the **pl-design-system** skill
(\`.claude/skills/pl-design-system/SKILL.md\`) and follow
\`pl-design-system/USAGE.md\` + \`pl-design-system/guidelines.md\`.

- **Reuse** React components from \`pl-design-system/components/\` — do not recreate
  buttons, cards, inputs, badges, tables, tabs, dropdowns, or sidebars.
- **Use tokens only** from \`pl-design-system/tokens/\` (e.g.
  \`var(--background-brand-default)\`, \`var(--spacing-md)\`). Never hardcode hex or
  pixel font sizes.
- For UI work, scaffold a **Next.js 14** app in \`app/\`, copy \`pl-design-system/\`
  into \`app/\` so it ships on deploy, and consume it per \`USAGE.md\`. For a
  non-React/plain-HTML app, \`styles/pln-theme.css\` is a minimal fallback — the
  React components are strongly preferred.
- **Must be iframe-embeddable from \`*.plnetwork.io\`.** The app is shown inside the
  PL Infra → AI Apps dashboard via an \`<iframe>\` served from a sibling
  \`*.plnetwork.io\` subdomain. A different subdomain is a *different origin*, so any
  framing guard that defaults to "same-origin only" will break the embed with
  \`refused to connect\`. Therefore:
  - **Do NOT send \`X-Frame-Options\`.** It only understands \`DENY\`/\`SAMEORIGIN\` —
    it cannot allow a sibling subdomain, and if present browsers honor it and block
    the frame. (Note: \`helmet()\` sends \`X-Frame-Options: SAMEORIGIN\` by default —
    pass \`frameguard: false\` to turn it off.)
  - If you set a \`Content-Security-Policy\`, its \`frame-ancestors\` MUST include
    \`'self' https://plnetwork.io https://*.plnetwork.io\`. Never use
    \`frame-ancestors 'none'\`.
  - The default scaffold sends neither header, so it already embeds fine — this
    only matters once you add \`helmet\`, a CSP, or other security headers.

## Signed-in member context (personalization)
The app can identify the PLN member using it. Load the **pln-member-context**
skill (\`.claude/skills/pln-member-context/SKILL.md\`) before writing any code
that needs the current user. In short: the LabOS session cookie (\`authToken\`,
shared across the PLN apps domain) reaches the app's own origin, so browser
code reads it from \`document.cookie\` (URL-decode + strip quotes) and calls the
\`memberContextEndpoint\` from \`pln-app.config.json\` with
\`Authorization: Bearer <token>\` — use the exact snippet from the skill, and do
NOT rely on \`credentials: 'include'\` alone (the cookie may not reach the API
host). The response carries the member's public profile (uid, name, image,
teams + roles, skills — deliberately no email or other contact info). Bake the
endpoint URL into the app's frontend as a constant — the config file itself is
not shipped inside \`app/\`.
- Handle the signed-out case gracefully (401/403/local dev): show a friendly
  note and keep the app usable without identity. Never hard-fail on it.
- Personalization only: never gate sensitive/destructive actions on it, never
  store or log tokens, and never forward member data to third parties.

## Migrating an existing app
When the member already has an app and wants it on LabOS, you are *adapting their
code*, not authoring into the scaffold. The scaffold's \`app/server.js\`,
\`app/package.json\`, and \`app/Dockerfile\` are placeholders — replace them. The deploy
contract (PORT / 0.0.0.0 / \`/health\` / iframe-embeddable, above) is all that matters,
not the scaffold's shape or language.

1. **Put the app in \`app/\` and make it self-contained.** Copy their project into
   \`app/\`, overwriting the placeholders. Remove references to anything outside \`app/\`
   (monorepo \`tsconfig\` \`extends\`, workspace/sibling packages, parent lockfiles) and
   include the app's own lockfile — only \`app/\` is shipped.
2. **Write a \`Dockerfile\` that fits the app.** The scaffold's assumes a single-file
   Node app with no build. If the app compiles (TypeScript, Go, a bundler, …), write
   an appropriate (e.g. multi-stage) Dockerfile. Only hard requirement: the image
   starts a server that listens on \`$PORT\`, binds \`0.0.0.0\`, and answers \`GET /health\`.
3. **Runtime config comes from the secrets flow, not the ZIP.** If the app needs
   API keys or other secrets at runtime, use the draft flow ("Apps that need
   secrets" below): declare the env var NAMES and let the member provide the
   values in LabOS. Anything that isn't secret should ship sensible defaults.
4. **Never ship secrets.** Keep real \`.env\` files, tokens, keys, and data dirs OUT of
   the uploaded zip: add them to \`.dockerignore\` and confirm they're absent before
   deploying. The zip is built and stored server-side. Secret VALUES are entered by
   the member in LabOS — never ask the member to paste them into the chat or a file.
5. **Verify before deploying:** \`cd app && npm install && npm start\` (or the app's
   equivalent), then confirm \`GET /health\` is 200 and \`GET /\` renders.

## Apps that need secrets (API keys, tokens, …)
The member is usually **not a developer** — they will never say "environment
variable" or "secret". It is YOUR job to recognize when the app needs one and to
route the deploy through the **draft flow** instead of deploying directly.

**Recognize the need yourself.** The app needs the draft flow whenever it (will)
talk to any external service that requires a credential — an AI/LLM API (OpenAI,
Anthropic, …), email/SMS sending, a database, a paid data API, a webhook with a
signing secret, and so on. If the member asks for a feature like "summarize with
ChatGPT" or "send me an email", that IS a secrets app: wire the code to read the
credential from an env var (e.g. \`process.env.OPENAI_API_KEY\`), pick a clear
UPPER_SNAKE_CASE name, and plan for the draft flow. Before any deploy, double-check
the code for \`process.env.*\` reads (or the language's equivalent) you may have
added along the way.

**Explain it in plain words.** Tell the member something like: *"This app needs
your OpenAI API key to work. I never handle keys directly — I'll register the app
and give you a secure LabOS link where you paste the key and click Deploy."*
Don't use the words "env var", "draft registration", or "runtime injection" with
the member.

**If the member pastes a secret into the chat**, do not use it, do not echo it
back, and do not write it anywhere. Tell them the chat isn't a safe place for
keys, ask them to revoke/rotate it if it's sensitive, and point them to the LabOS
page from step 3 below — that form is the only place values should be entered.

The flow (full steps in the deploy skill):
1. Get a deploy token via the connect flow as usual.
2. POST the app ZIP to the \`draftEndpoint\` from \`pln-app.config.json\` with a
   \`requiredEnvVars\` field listing the env var NAMES the app needs. This
   registers the app as a **draft** — nothing runs yet.
3. **Immediately give the member the \`appPageUrl\` from the response — don't
   wait to be asked.** A draft deploys nothing until they act, so without the
   link they think the deploy is stuck. (This LabOS link is meant to be shared —
   the deployment-URL privacy rule doesn't apply to it.) They open it in LabOS,
   enter the secret values, and click **Deploy** there. The deploy then runs
   with the stored secrets.
4. To ship a code update later, register the draft again (same \`appId\`, fresh
   \`deploymentId\`) — already-stored secret values stay valid; the member just
   clicks Deploy again in LabOS.
5. To change a key later, the member doesn't need you at all: on the PL Infra →
   AI Apps dashboard they open the **⋯ menu** on the app's card and choose
   **Deployment settings**, click **Replace** on the value, enter the new one,
   and click **Redeploy**. If they ask you for a direct link, build it from
   \`appSettingsUrl\` in \`pln-app.config.json\` (replace \`{appUid}\` with the saved
   \`appUid\`) — it opens that modal for them.

Never ask the member for secret values in the chat, and never write them to any
file — LabOS is the only place they should be entered.

## App name, description & one-pager PRD (display metadata)
Every app has member-facing display metadata on the AI Apps dashboard: a
**name**, a short **description**, and an optional **one-pager PRD**. The rules
live in the **app-metadata** skill (\`.claude/skills/app-metadata/SKILL.md\`) —
load it whenever metadata comes up. In short:
- **Before the first deploy**: propose a human-friendly name + 1–2 sentence
  description drawn from what the app does, present them to the member, and
  **wait for explicit approval** (revise until they approve). Save the approved
  values to \`appName\`/\`appDescription\` in \`pln-app.config.json\` and use them in
  the deploy form.
- **After the first successful deploy**: ask once whether the member wants a
  one-pager PRD. If yes, generate a concise Markdown one-page brief (see the
  app-metadata skill), get their approval, and save it via the
  \`metadataEndpoint\` — **no new ZIP and no redeploy**. If they decline, carry
  on without one.
- **On redeploys**: reuse the saved \`appName\`/\`appDescription\` verbatim and do
  NOT re-run the propose-and-approve flow (the deploy form overwrites stored
  metadata, so fresh drafts would revert what the member approved). Only
  re-propose when the member explicitly asks to change something.
- **When the member asks to rename / edit the description / change the PRD** of
  an existing app: same propose → approve → save flow, via \`metadataEndpoint\` —
  metadata changes never require a redeploy.

## Deploying the app
When the member asks you to deploy, use the **deploy-to-labs** skill in
\`.claude/skills/deploy-to-labs/SKILL.md\`. If the app needs runtime secrets,
follow "Apps that need secrets" above instead of deploying directly. In short:
1. Read \`pln-app.config.json\` for the \`connectEndpoint\`, \`deployEndpoint\`,
   \`metadataEndpoint\`, and (if present) saved \`appId\`, \`appUid\`, \`appName\`, and
   \`appDescription\`.
2. **Settle the display metadata** ("App name, description & one-pager PRD"
   above): first deploy → propose name/description and get the member's
   approval; redeploy → reuse the saved values without re-asking.
3. **Get a deploy token via LabOS (the connect flow).** There is no token in the
   kit. POST to \`connectEndpoint\` to start a connect session, give the member the
   returned \`connectUrl\` + confirmation \`userCode\` to open and approve in LabOS,
   then poll until you receive a short-lived \`deployToken\`. Full steps are in the
   deploy skill. Keep the token **in memory only** — never write it to
   \`pln-app.config.json\` or any file.
4. Choose a stable, lowercase \`appId\` (e.g. \`my-leaderboard\`) and a fresh
   \`deploymentId\` for each deploy.
5. Zip the **contents** of \`app/\` (so the \`Dockerfile\` sits at the root of the ZIP),
   excluding \`node_modules\`, build output, and any secrets/\`.env\`/data dirs, then
   upload that ZIP to \`deployEndpoint\` as multipart/form-data with the
   \`deployToken\` in the \`${AI_APP_TOKEN_HEADER}\` header. The PLN backend stores it
   and runs the build — you do not need any cloud credentials.
6. Save the \`uid\` from the response as \`appUid\` in \`pln-app.config.json\`, then
   tell the member the deploy succeeded and that they can open their app from the
   PL Infra → AI Apps dashboard. **Do NOT reveal the deployment URL, host, or port**
   (see "Keep the deployment URL private" in the deploy skill). That privacy rule
   covers only the app's own \`<appId>\` address — LabOS links (\`connectUrl\`,
   \`appPageUrl\`) must always be shared with the member.

## Deploy token
There is **no long-lived token** in this kit. You obtain a short-lived deploy
token at deploy time through the LabOS connect flow (see the deploy skill), and
send it in the \`${AI_APP_TOKEN_HEADER}\` header. The token expires after about an
hour and is tied to the member who approved the connect link. Never print it in
logs, write it to a file, or commit it; if a deploy returns 401 (expired), just
run the connect flow again to get a fresh one.

Do not ask for or use any internal PLN APIs — only the connect, deploy, and
member-context endpoints in the config are available to you.
`;
  }

  private metadataSkill(): string {
    return `---
name: app-metadata
description: Set or change the app's display name, short description, and optional one-pager PRD shown on the AI Apps dashboard. Use before the FIRST deploy (no approved name saved yet) and whenever the member asks to rename the app, edit its description, or add/update/remove its PRD. Metadata saves go through their own endpoint — no ZIP upload and no redeploy.
---

# App name, description & one-pager PRD

The AI Apps dashboard shows each app's **name**, a short **description**, and —
optionally — a **one-pager PRD** (a short product brief: why the app exists and
what it is meant to do). These are member-facing: YOU draft them, the MEMBER
approves them, and only then do you save them. Saving metadata never rebuilds
or redeploys the app.

## When to run this flow

- **Before the first deploy** (no \`appName\` saved in \`pln-app.config.json\` yet):
  do "Propose & approve" below, use the approved values in the deploy form, and
  offer the one-pager PRD once the deploy succeeds.
- **The member asks to change** the name, description, or PRD of an existing
  app: same propose → approve → save flow, via the metadata endpoint.
- **NOT on ordinary redeploys.** Reuse the approved \`appName\` /
  \`appDescription\` from \`pln-app.config.json\` **verbatim** in the deploy form
  and don't re-ask. A deploy overwrites the stored name/description with
  whatever the form sends, so sending fresh drafts silently reverts metadata the
  member already approved. The PRD is never touched by deploys — nothing to
  re-send.

## Propose & approve (name + description)

1. Draft from what the app actually does (its code + the conversation):
   - **Name** — 2–4 plain, human-friendly words (e.g. "Team Availability
     Board"), max 200 chars. Not the \`appId\` slug, no version numbers.
   - **Description** — 1–2 sentences: what it does and who it's for. Keep it
     well under 2000 chars.
2. Show both to the member and ask them to approve or revise.
3. **Wait for explicit approval.** If they want changes, revise and re-present —
   as many rounds as needed. Never upload a name or description the member has
   not confirmed.
4. After approval, write the values into \`pln-app.config.json\` (\`appName\`,
   \`appDescription\`) so later redeploys reuse them without re-asking.

## Offer the one-pager PRD (optional)

Ask once, in plain words — e.g. *"Want me to add a one-pager PRD? It's a short
brief explaining why the app exists and what it does — shown alongside your app
on the dashboard."* If the member declines, you're done — deploys and updates
work fine without a PRD.

If they want one, produce a short, one-page **Markdown** brief. The author is
usually a non-technical member who vibe-coded the app, so the brief explains
**why** the app was built and **what** it is meant to do — not how it is
engineered or tested.

### How to write the brief

1. Read back through the conversation (and the app) to understand what it does,
   who it is for, and why it was built.
2. **Synthesize what you already know.** Do NOT interview the member with a long
   questionnaire. Ask at most one or two questions, and only when Goals / OKR
   Impact or Success Metrics is genuinely missing and cannot be inferred —
   otherwise mark that section "To be confirmed" rather than guessing.
3. Write in plain language. Avoid jargon, framework names, and internal
   engineering detail. If the member did not say something technical, do not
   invent it.
4. Fill in the template below. Keep the whole thing to roughly one page. Every
   section should be a few sentences or a short list — this is a brief, not a
   spec. Comfortably under 100,000 characters.
5. Save the brief locally as \`prd.md\`, give the member a faithful summary in
   chat, and get **explicit approval** — revise and re-present on feedback —
   then upload it (below). Never upload an unapproved PRD.

### One-pager template

\`\`\`markdown
# <App Name>

_One-line description of what the app does._

## Problem Statement

The problem the app is meant to solve, from the user's perspective. What was
hard, slow, or missing before this app existed.

## Solution

A brief executive summary of the app — a few lines describing what it is and
how it addresses the problem above. High level, not a feature-by-feature
breakdown (that comes next).

## Key Features

A short bulleted list of what the app can do — the main capabilities a user
gets. Keep each to a line. This is the "what's in the box" section.

## How to Use

A simple, numbered walkthrough of how someone actually uses the app, start to
finish. Written for a first-time user who has never seen it. Include where to
find it, what to do, and what they will see. Skip anything technical — this is
the "getting started" section.

## Implementation Decisions

Notable choices the builder made, described in plain terms — not code. For
example: what data the app uses, what it deliberately keeps simple, any
assumptions it makes, or anything a future editor should know. Skip this
section if there is nothing meaningful to say.

## Goals / OKR Impact

The goal, objective, or OKR this app is meant to move, and how it contributes.
If it supports a specific team or org OKR, name it. If none is confirmed yet,
mark this "To be confirmed."

## Success Metrics

How you will know the app is working. A few concrete signals — usage, time
saved, adoption, a number going up or down. Keep it to what can actually be
observed.

## Out of Scope

What this app deliberately does NOT do, so expectations are clear. Useful for
heading off "can it also…" questions later.
\`\`\`

## Saving via the metadata endpoint

\`metadataEndpoint\` in \`pln-app.config.json\` is a URL **template** — replace the
literal \`{appUid}\` with the app's \`uid\` (the \`uid\` field of the deploy/draft
response, saved as \`appUid\` in the config after the first upload). Auth is the
same short-lived deploy token used for deploys, in the \`${AI_APP_TOKEN_HEADER}\`
header — for a metadata-only session (no deploy planned), run the connect flow
from the deploy-to-labs skill to get one.

Name/description only:

\`\`\`bash
curl -sX PATCH "<metadataEndpoint with {appUid} replaced>" \\
  -H "${AI_APP_TOKEN_HEADER}: <deployToken>" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Team Availability Board","description":"See at a glance who on your team is free this week."}'
\`\`\`

With a PRD, build the JSON body in a file — the \`prd\` value is the whole
Markdown document as one JSON string, so don't hand-escape it in the shell:

\`\`\`bash
node -e 'const fs=require("fs");fs.writeFileSync("body.json",JSON.stringify({prd:fs.readFileSync("prd.md","utf8")}))'
curl -sX PATCH "<metadataEndpoint with {appUid} replaced>" \\
  -H "${AI_APP_TOKEN_HEADER}: <deployToken>" \\
  -H "Content-Type: application/json" \\
  --data @body.json
\`\`\`

All three fields are optional — send only what changed. \`"prd": null\` removes
the PRD, \`"description": null\` clears the description. The response is the
updated app record; the dashboard reflects it immediately.

## Rules

- **Approval first, always.** Name, description, and PRD are what other PLN
  members see — never save a draft the member hasn't explicitly approved.
- **Metadata saves are instant and deploy-free**: no ZIP, no build, no downtime.
  Never redeploy "to apply" a name/description/PRD change.
- The endpoint edits only apps owned by the member who approved the token, and
  404s before the first deploy/draft upload (the app record is created by the
  first upload) — a brand-new app gets its approved name/description through
  the deploy form, and its PRD right after via this endpoint.
- Keep \`pln-app.config.json\` in sync: after any approved rename or description
  change, update \`appName\`/\`appDescription\` there too.
- The deploy token stays in memory only — never write it to the config or any
  file (same rule as the deploy skill).
`;
  }

  private designSystemSkill(): string {
    return `---
name: pl-design-system
description: Use whenever building or editing UI for a PLN AI App. Covers the bundled PL Design System — instantiate React components from pl-design-system/components, use design tokens only, layout patterns, and the LabOS consume steps in USAGE.md. Load before writing any JSX/TSX/SCSS for the app.
---

# PL Design System

Companion to \`AGENTS.md\`. Source of truth for on-brand UI in this kit.

## Before you write UI

1. Read \`pl-design-system/guidelines.md\` (hard rules).
2. Read \`pl-design-system/USAGE.md\` (how to wire it into \`app/\`).
3. Check \`pl-design-system/components/component-catalog.md\` for the component you need.

## Hard rules

- **Instantiate, never recreate.** Import from \`pl-design-system/components/<Name>\`.
  Do not hand-roll Button, Input, Badge, Table, Tabs, Dropdown, Sidebar, cards, etc.
- **Tokens only.** Colors / type / spacing / radius / shadows come from
  \`pl-design-system/tokens/\` as CSS variables (\`var(--foreground-neutral-primary)\`,
  \`var(--background-brand-default)\`, \`var(--spacing-md)\`, \`var(--radius-md)\`,
  \`var(--shadow-xs)\`). Never hardcode hex, raw px type sizes, or Tailwind color utilities.
- **Layer 3 only** in component/layout styles — never \`var(--global-color-*)\` or
  \`var(--semantic-*)\`.
- Aesthetic: **structured · calm · technical · minimal**. No loud gradients, glow,
  heavy decorative shadows, or random accents.

## Consume in \`app/\` (Next.js 14)

Only \`app/\` is deployed. Copy the kit's \`pl-design-system/\` into \`app/pl-design-system/\`,
exclude it from \`tsconfig\` checking, install peer deps listed in \`USAGE.md\`, import
\`styles/globals.scss\` once in the root layout, and copy \`public/fonts\` into the app's
\`public/fonts\`. Import components from their folder (not only the barrel).

Start script must honor \`PORT\` and bind \`0.0.0.0\`:
\`"start": "next start -p \${PORT:-3000} -H 0.0.0.0"\`.

## Which component?

| Need | Reach for |
|---|---|
| Actions | \`Button\` |
| Text entry | \`Input\`, \`Textarea\`, \`SearchInput\` |
| Choice / toggle | \`Checkbox\`, \`Switch\`, \`Dropdown\`, \`Tabs\` |
| Status / meta | \`Badge\`, \`Alert\`, \`Tooltip\`, \`EmptyState\` |
| People / orgs | \`Avatar\`, \`MemberCard\` (dense), \`MemberProfileCard\` (hero), \`TeamCard\` |
| Data | \`Table\`, \`Pagination\`, \`Progress\` |
| Shell | \`NavBar\`, \`Sidebar\`, \`BottomNav\` (mobile), \`PageHeader\` |
| Overlay | \`Drawer\` (modal / drawer / bottom-sheet patterns in \`patterns/overlay-patterns.md\`) |
| Product cards | \`ForumPostCard\`, \`FocusAreaCard\`, \`OfficeHoursCard\`, \`CTACard\`, \`WelcomeCard\`, … |

Specs: \`components/primitives/*.md\`, \`components/product/*.md\`.
Layouts: \`patterns/\`. Page structure reference only: \`examples/\`.

**MemberCard vs MemberProfileCard:** many in a list → MemberCard; single hero subject → MemberProfileCard.

**Surfaces:** cards use elevation (\`--shadow-xs\` / \`--shadow-sm\`), no border at rest. Form controls use \`--border-*\`.

## Missing component

Prefer composing existing components + tokens. If you would have to invent a new
primitive, stop and tell the member: \`Missing canonical component: [name]\`.

## Sanity check

- Every interactive control is an import from \`pl-design-system/components/\`
- At most one primary Fill+Brand \`Button\` per section
- No hardcoded colors/spacing; no \`X-Frame-Options\` on the app
`;
  }

  private memberContextSkill(): string {
    return `---
name: pln-member-context
description: Get the signed-in PLN member's identity (name, teams, role, skills) inside a deployed AI App, for personalization and feedback. Use whenever the app should greet the user, tag content with who created it, or adapt to the member using it. Load before writing any code that needs to know who is using the app.
---

# PLN Member Context — who is using the app

Deployed apps are opened by signed-in PLN members from the PL Infra → AI Apps
dashboard. The LabOS login cookie (\`authToken\`) is scoped to the shared apps
domain, so the app's own origin receives it — the app reads it and presents it
to the PLN API as a Bearer token. No login UI of its own is needed.

## The endpoint

\`memberContextEndpoint\` in \`pln-app.config.json\`:

\`\`\`
GET ${AI_APPS_ME_ENDPOINT}
\`\`\`

Call it from **browser code**, sending the \`authToken\` cookie value as the
\`Authorization\` header. Do NOT rely on \`credentials: 'include'\` alone — the
cookie's domain covers the app hosts but not necessarily the API host, so the
browser may silently omit it (a guaranteed 401). Reading the cookie only needs
the app's own origin, which always works. The config file is not shipped inside
\`app/\`, so bake the URL into the frontend as a constant:

\`\`\`js
const MEMBER_CONTEXT_URL = '${AI_APPS_ME_ENDPOINT}';

// The cookie value is URL-encoded and JSON-quoted (e.g. %22eyJhbGci...%22).
function readAuthToken() {
  const match = document.cookie.match(/(?:^|;\\s*)authToken=([^;]*)/);
  if (!match) return null;
  const raw = decodeURIComponent(match[1]).replace(/^"|"$/g, '');
  return raw || null;
}

async function getMemberContext() {
  try {
    const token = readAuthToken();
    const res = await fetch(MEMBER_CONTEXT_URL, {
      // Bearer from the cookie is the reliable path; credentials:'include' is
      // only a fallback for environments where the cookie reaches the API host.
      headers: token ? { Authorization: \`Bearer \${token}\` } : undefined,
      credentials: token ? 'omit' : 'include',
    });
    if (!res.ok) return null; // 401 = not signed in, 403 = no AI Apps access
    const { member } = await res.json();
    return member;
  } catch {
    return null; // network/CORS error — treat as signed out
  }
}
\`\`\`

Response shape (\`member\`):

\`\`\`json
{
  "uid": "…",
  "name": "Ada Lovelace",
  "image": "https://…/profile.png",
  "location": { "city": "London", "country": "United Kingdom", "continent": "Europe" },
  "skills": ["Engineering", "Research"],
  "teams": [
    { "uid": "…", "name": "Protocol Labs", "role": "Engineer", "mainTeam": true, "teamLead": false }
  ]
}
\`\`\`

Fields may be \`null\`/empty, and new fields may be added over time — ignore
anything you don't recognize. The response deliberately contains **no contact
info** (no email, no office-hours link) — don't build features that assume a
way to reach the member, and don't ask them to type contact details in to
compensate.

## Rules

- **Always handle the signed-out case.** \`getMemberContext()\` returns \`null\`
  when the visitor is not signed in, lacks AI Apps access, or when the app runs
  locally (\`npm start\` — no PLN cookie on localhost). Show a friendly note like
  *"Open this app from the LabOS → AI Apps dashboard to personalize it"* and keep
  the rest of the app working. Never crash or block on missing identity.
- **Personalization only, not authentication.** Use the identity to greet the
  member, tag feedback/content with who wrote it, or tailor behavior. Do not
  gate sensitive or destructive actions on it, and don't build your own
  session/auth system on top.
- Call it client-side. If you must know the member on your server, do the same
  thing there: the \`authToken\` cookie arrives on every request to the app, so
  decode it (URL-decode, strip the surrounding double quotes) and forward it to
  the endpoint as \`Authorization: Bearer <token>\`. Never store or log the
  token, and never send it — or the member's data — to any third-party service.
- Keep the token in memory for the current page only — don't persist it to
  localStorage, files, or your own backend.
- This is the only PLN member API available to apps. Don't call other internal
  PLN endpoints; if the app needs more PLN data than this provides, tell the
  member it isn't available yet.
`;
  }

  private deploySkill(): string {
    return `---
name: deploy-to-labs
description: Deploy the app in ./app to the Protocol Labs Network sandbox. Use when the member asks to deploy, ship, or publish the app.
---

# Deploy to PLN Labs

Deploys the app in \`app/\` to the PLN sandbox and returns its live URL.

**Needs secrets? Decide BEFORE deploying — don't wait for the member to say so.**
The member usually has no coding background and won't know their app "has secrets".
Check for it yourself: does the app read any credential from the environment
(\`process.env.*\` or equivalent), or call any external service that needs an API
key (OpenAI/Anthropic, email/SMS, a database, a paid API)? A quick check:

\`\`\`bash
grep -rniE 'process\\.env\\.|os\\.environ|getenv' app --include='*.js' --include='*.ts' --include='*.py' | grep -viE 'PORT|NODE_ENV'
\`\`\`

If anything secret shows up (or you wrote code that needs a key), do steps 1–5 as
written but then follow "**Apps that need secrets (draft flow)**" below instead of
step 6 — you register a draft and the member deploys from LabOS after entering the
values there. Never deploy a secrets app directly and never accept key values in
the chat.

## Steps
1. Read \`pln-app.config.json\` to get \`connectEndpoint\`, \`deployEndpoint\`,
   \`draftEndpoint\`, \`metadataEndpoint\`, the \`kitVersion\` (sent with every upload
   so PLN knows which kit built the app), and (if present) saved \`appId\`,
   \`appUid\`, \`appName\`, and \`appDescription\`. If no \`appId\` exists yet, pick a
   short, stable, lowercase slug (e.g. \`hello-board\`) and save it back to the
   config. Never edit \`kitVersion\` by hand.
2. **Settle the display name & description.** If \`appName\` in the config is
   empty (first deploy), load the **app-metadata** skill
   (\`.claude/skills/app-metadata/SKILL.md\`): propose a human-friendly name and
   a 1–2 sentence description, get the member's **explicit approval** (revise
   until they approve), and save the approved values to \`appName\`/
   \`appDescription\` in the config. If \`appName\` is already set, **reuse the
   saved values verbatim and don't re-ask** — the deploy form overwrites the
   stored metadata, so anything else would revert what the member approved.
   Only re-run the propose flow when the member explicitly asks to change the
   name or description.
3. **Get a deploy token via LabOS.** The kit has no token; obtain a short-lived one
   through the connect flow:

   a. Start a session (no auth needed). Set \`clientName\` to YOUR actual tool
      name (e.g. "Claude Code", "Cursor", "Codex CLI") — it is shown to the
      member on the approval page and recorded with the deployed app:

   \`\`\`bash
   curl -sX POST "<connectEndpoint>" \\
     -H "Content-Type: application/json" \\
     -d '{"clientName":"<your tool name>"}'
   # → { "sessionId", "userCode", "connectUrl", "pollToken", "pollIntervalSec", "expiresAt" }
   \`\`\`

   b. **Tell the member, in your chat:** open \`connectUrl\` in their browser, sign in
      to LabOS, confirm the code shown matches \`userCode\`, and click **Approve**.
   c. Poll until the session is decided (every \`pollIntervalSec\` seconds, up to
      \`expiresAt\`), sending the \`pollToken\` you received:

   \`\`\`bash
   curl -sX POST "<connectEndpoint>/poll" \\
     -H "Content-Type: application/json" \\
     -d '{"pollToken":"<pollToken>"}'
   # pending  → keep polling
   # approved → { "status":"approved", "deployToken":"plndeploy_…", "deployTokenExpiresAt" }
   # denied   → the member lacks ai_apps.write; stop and tell them
   # expired  → the link timed out; start a new session (step 3a)
   \`\`\`

   Hold \`deployToken\` **in memory only** — never write it to \`pln-app.config.json\`
   or any other file, and never print it.
4. Make sure \`app/\` runs locally first (\`npm install && npm start\`, hit
   \`/health\`). For a migrated existing app, also confirm the migration checklist
   in \`AGENTS.md\` is satisfied (self-contained \`app/\`, fitting Dockerfile, binds
   \`0.0.0.0\`, no reliance on injected secrets).
5. Zip the **contents** of \`app/\` so the \`Dockerfile\` sits at the ZIP root.
   Exclude \`node_modules\`, build output, and — importantly — any secrets: real
   \`.env\` files, tokens/keys, and data dirs must never enter the ZIP (the backend
   stores it server-side).

   \`\`\`bash
   cd app && zip -r ../app.zip . \\
     -x 'node_modules/*' '*/node_modules/*' 'dist/*' '.next/*' '.env' '.env.*' '.data/*' && cd ..
   # Sanity-check nothing sensitive slipped in:
   unzip -l ../app.zip | grep -iE '\\.env|secret|credential|\\.pem|\\.key' && echo 'STOP: secret in zip' || echo 'ok'
   \`\`\`

6. Upload the ZIP to the deploy endpoint as multipart/form-data, sending the
   \`deployToken\` from step 3 in the \`${AI_APP_TOKEN_HEADER}\` header. \`name\` and
   \`description\` are the member-approved \`appName\`/\`appDescription\` from
   \`pln-app.config.json\` (step 2) — send them verbatim. The PLN backend stores
   the ZIP and triggers the build — no cloud credentials are needed:

   \`\`\`bash
   curl -X POST "<deployEndpoint>" \\
     -H "${AI_APP_TOKEN_HEADER}: <deployToken>" \\
     -F "appId=<your-app-id>" \\
     -F "name=<the approved appName from pln-app.config.json>" \\
     -F "description=<the approved appDescription from pln-app.config.json>" \\
     -F "deploymentId=<unique id per deploy, e.g. a timestamp>" \\
     -F "kitVersion=<the kitVersion from pln-app.config.json>" \\
     -F "agentModel=<the model you are running on, e.g. claude-sonnet-4-5; omit the field if unknown>" \\
     -F "file=@app.zip;type=application/zip"
   \`\`\`

7. On success the response contains the app record with its deployment URL and
   status:

   \`\`\`json
   { "uid": "cl…", "status": "READY", "url": "https://<appId>.${AI_APPS_APP_DOMAIN}", "host": "...", "port": 31001 }
   \`\`\`

   Save the response's \`uid\` as \`appUid\` in \`pln-app.config.json\` (it addresses
   the metadata endpoint later). Use the URL only for the internal checks below —
   **do not reveal it to the member** (see "Keep the deployment URL private").
   On \`READY\`, tell the member the app is live and can be opened from the
   PL Infra → AI Apps dashboard. If \`status\` is \`ERROR\`, surface \`notes\`
   (never the URL).

   **After the FIRST successful deploy**, offer the optional one-pager PRD —
   see "Offer the one-pager PRD" in the app-metadata skill. If the member wants
   one, generate it, get approval, and save it via \`metadataEndpoint\` — no
   redeploy involved. Don't re-offer it on later redeploys.

8. **Verify the app is iframe-embeddable** (internal check — do not surface the URL
   to the member). The dashboard shows it in an \`<iframe>\` from a sibling
   \`*.plnetwork.io\` subdomain; check the live response headers:

   \`\`\`bash
   curl -sSI "https://<appId>.${AI_APPS_APP_DOMAIN}/" | grep -iE 'x-frame-options|content-security-policy'
   \`\`\`

   It must pass BOTH:
   - **No \`X-Frame-Options\` header** (it can't allow a sibling subdomain; if present
     it blocks the embed).
   - If a \`Content-Security-Policy\` is present, its \`frame-ancestors\` must include
     \`https://*.plnetwork.io\` (and must NOT be \`'none'\`).

   If either fails, the embed will show \`refused to connect\`. Fix the app's headers
   (see the framing rule in \`AGENTS.md\`) and redeploy before reporting success.

## Apps that need secrets (draft flow)
When the app needs runtime secrets, replace the upload in step 6 with a **draft
registration** — same multipart shape (including the approved \`appName\`/
\`appDescription\` from the config), posted to \`draftEndpoint\`, plus
\`requiredEnvVars\` (the env var NAMES the app reads; JSON array or
comma-separated). Nothing is deployed yet:

\`\`\`bash
curl -X POST "<draftEndpoint>" \\
  -H "${AI_APP_TOKEN_HEADER}: <deployToken>" \\
  -F "appId=<your-app-id>" \\
  -F "name=<the approved appName from pln-app.config.json>" \\
  -F "description=<the approved appDescription from pln-app.config.json>" \\
  -F "deploymentId=<unique id per upload, e.g. a timestamp>" \\
  -F "kitVersion=<the kitVersion from pln-app.config.json>" \\
  -F "agentModel=<the model you are running on; omit the field if unknown>" \\
  -F 'requiredEnvVars=["OPENAI_API_KEY","SUPABASE_URL"]' \\
  -F "file=@app.zip;type=application/zip"
# → { "uid": "cl…", "status": "DRAFT", "appPageUrl": "https://…/pl-infra/ai-apps/<uid>", "missingEnvVars": [ … ] }
\`\`\`

Save the response's \`uid\` as \`appUid\` in \`pln-app.config.json\`, same as a
regular deploy.

**IMMEDIATELY give the member the \`appPageUrl\` link — this is the very next
thing you do after the registration call returns, before anything else.** A
draft deploys NOTHING by itself: until the member opens that link and clicks
Deploy, they see no progress anywhere and will think the deployment is stuck.
(\`appPageUrl\` is a LabOS page link — the "keep the deployment URL private" rule
below does NOT apply to it; it exists to be shared.) Tell them in plain
non-technical language — e.g. *"Your app is registered. Open this link, paste
your OpenAI API key into the form, and click Deploy — that page is the only safe
place for your key."* They enter the values there and click **Deploy**. The
deploy runs immediately with the stored secrets; the app then appears as usual
on the AI Apps dashboard.

- **Never** ask the member to paste secret values into the chat, and never write
  them to a file — LabOS is the only place values are entered. If they paste a
  key into the chat anyway, don't use or repeat it — point them to \`appPageUrl\`
  (and suggest rotating the key if it's sensitive).
- To ship a **code update** later, re-register the draft (same \`appId\`, fresh
  \`deploymentId\`, updated \`requiredEnvVars\` if they changed) and send the member
  back to \`appPageUrl\` to click Deploy. Stored secret values remain valid.
- The member can also update secret values and redeploy entirely from LabOS —
  no agent involvement needed: on the AI Apps dashboard they open the **⋯ menu**
  on the app's card and choose **Deployment settings**. If they want a direct
  link, hand them \`appSettingsUrl\` from \`pln-app.config.json\` with \`{appUid}\`
  replaced by the saved \`appUid\` — it opens that modal straight away.

## Keep the deployment URL private
This rule covers ONLY the deployed app's own address — the URL/host/port on
\`<appId>.${AI_APPS_APP_DOMAIN}\`. Do not print, link, or otherwise tell the member
that URL, host, or port — in your messages, summaries, or saved files. The member
opens their app through the PL Infra → AI Apps dashboard, which embeds it; they
never need the raw URL. You may use the URL silently for the verification and
health checks here, but it must not appear in anything you report back. (The
config file stores only the \`appId\`, not the URL — keep it that way.)

It does NOT cover the LabOS links — \`connectUrl\` (approval page) and
\`appPageUrl\` (secrets + deploy page). Those are made to be opened by the member,
and you MUST share them in chat whenever the flow produces one. Withholding
\`appPageUrl\` strands a draft app: nothing deploys until the member opens it.

## If the upload times out (504) or seems to hang
A slow build can exceed the gateway's request timeout, so the upload may return a
\`504 Gateway Time-out\` (or hang) **even though the build succeeded**. Do NOT assume
failure and blindly re-upload. Instead poll the app (internal check — don't share the
URL with the member):

\`\`\`bash
curl -sS -m 20 -o /dev/null -w '%{http_code}\\n' "https://<appId>.${AI_APPS_APP_DOMAIN}/health"
\`\`\`

If it returns \`200\` within a minute or two, the deploy worked — proceed to the
verification steps. Only re-deploy if it stays unreachable.

## Notes
- Reuse the same \`appId\` to redeploy an existing app; use a new \`deploymentId\`
  each time. Derive the URL from the \`appId\` for your own checks, but treat it as
  sensitive (see "Keep the deployment URL private").
- Redeploys resend the saved \`appName\`/\`appDescription\` verbatim and never
  re-run the propose-and-approve flow. Renames, description edits, and PRD
  changes go through the **app-metadata** skill (\`metadataEndpoint\`) — they
  never require a redeploy, and a redeploy never touches the PRD.
- The deploy token is short-lived (≈1 hour) and tied to the member who approved the
  connect link. Keep it in memory only — never save it to a file or print it. Within
  the window you can redeploy without reconnecting; once it expires (deploy returns
  \`401\`), run the connect flow again to get a fresh token.
- Runtime secrets are supported only through the draft flow above — the sandbox
  injects exactly the env vars the member provided in LabOS. Non-secret config
  should ship sensible defaults — see the migration checklist in \`AGENTS.md\`.
`;
  }

  private configJson(): string {
    return `${JSON.stringify(
      {
        connectEndpoint: AI_APPS_CONNECT_ENDPOINT,
        deployEndpoint: AI_APPS_DEPLOY_ENDPOINT,
        draftEndpoint: AI_APPS_DRAFT_ENDPOINT,
        metadataEndpoint: AI_APPS_METADATA_ENDPOINT,
        appSettingsUrl: AI_APPS_APP_SETTINGS_ENDPOINT,
        memberContextEndpoint: AI_APPS_ME_ENDPOINT,
        deployTokenHeader: AI_APP_TOKEN_HEADER,
        kitVersion: AI_APPS_STARTER_KIT_VERSION,
        appId: '',
        appUid: '',
        appName: '',
        appDescription: '',
        notes:
          'No token is stored here. At deploy time the agent runs the LabOS connect flow (see .claude/skills/deploy-to-labs) to get a short-lived deploy token. Set appId to a stable lowercase slug on first deploy and reuse it. appName/appDescription hold the member-APPROVED display metadata (see .claude/skills/app-metadata) — redeploys resend them verbatim. After the first deploy, save the response uid as appUid; metadataEndpoint and appSettingsUrl are templates where {appUid} is replaced with it (appSettingsUrl opens the member-facing Deployment settings modal to update secrets & redeploy). If the app needs runtime secrets, register it via draftEndpoint instead of deploying (see the deploy skill).',
      },
      null,
      2
    )}\n`;
  }

  private themeCss(): string {
    return `:root {
  /* Protocol Labs Network design tokens */
  --pln-color-bg: #ffffff;
  --pln-color-surface: #f1f5f9;
  --pln-color-text: #0f172a;
  --pln-color-muted: #64748b;
  --pln-color-primary: #156ff7;
  --pln-color-primary-hover: #1d4ed8;
  --pln-color-border: #cbd5e1;
  --pln-radius: 8px;
  --pln-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
  --pln-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

body {
  margin: 0;
  font-family: var(--pln-font-sans);
  color: var(--pln-color-text);
  background: var(--pln-color-bg);
}

.pln-button {
  background: var(--pln-color-primary);
  color: #fff;
  border: none;
  border-radius: var(--pln-radius);
  padding: 10px 16px;
  font: inherit;
  cursor: pointer;
}
.pln-button:hover { background: var(--pln-color-primary-hover); }

.pln-card {
  background: var(--pln-color-surface);
  border: 1px solid var(--pln-color-border);
  border-radius: var(--pln-radius);
  box-shadow: var(--pln-shadow);
  padding: 16px;
}
`;
  }

  private fontsDoc(): string {
    return `# PLN Fonts

The PLN UI uses **Inter** as its primary typeface.

**Building with the PL Design System (preferred)?** The Inter variable font is
already self-hosted in \`pl-design-system/public/fonts/\` and wired up by
\`pl-design-system/styles/globals.scss\` — see \`pl-design-system/USAGE.md\`. You
don't need anything here.

**Plain-HTML / non-React app** using \`styles/pln-theme.css\`? Load Inter from the
CDN in your \`<head>\`:

\`\`\`html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
\`\`\`

Then rely on the \`--pln-font-sans\` variable from \`pln-theme.css\`.
`;
  }

  private appServer(): string {
    return `const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (_req, res) => {
  res.send(\`
    <html>
      <head><title>My PLN App</title></head>
      <body style="font-family: sans-serif; padding: 40px;">
        <h1>Hello from my PLN app</h1>
        <p>Edit app/server.js (or ask your AI agent to) and redeploy.</p>
      </body>
    </html>
  \`);
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(port, '0.0.0.0', () => console.log(\`app listening on \${port}\`));
`;
  }

  private appPackageJson(): string {
    return `${JSON.stringify(
      {
        name: 'my-pln-app',
        version: '1.0.0',
        private: true,
        scripts: { start: 'node server.js' },
        dependencies: { express: '^4.19.2' },
      },
      null,
      2
    )}\n`;
  }

  private appDockerfile(): string {
    return `FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
`;
  }
}
