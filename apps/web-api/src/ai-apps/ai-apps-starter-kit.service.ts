import { Injectable, Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  AI_APP_TOKEN_HEADER,
  AI_APPS_APP_DOMAIN,
  AI_APPS_CONNECT_ENDPOINT,
  AI_APPS_DEPLOY_ENDPOINT,
  AI_APPS_DRAFT_ENDPOINT,
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
    add('.claude/skills/pl-design-system/SKILL.md', this.designSystemSkill());
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
- \`.claude/skills/pl-design-system/\` — how to build on-brand UI with the PL Design System.
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
3. When you're happy, say "deploy this app". The first time you deploy, your agent
   will give you a LabOS link to open and approve — sign in and click **Approve**
   to authorize the deploy. Your agent then ships the app to the PLN sandbox; the
   first deploy can take a minute or two.
4. Your app appears on the PL Infra → AI Apps dashboard, where you can open it.

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
4. Updating a key later? Open your app's page in LabOS (PL Infra → AI Apps → your
   app), click **Update secrets & redeploy**, enter the new value, and Deploy.

Secrets never go into the code, the chat, or the uploaded ZIP — they are stored
securely on the sandbox and injected into your app when it runs.

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
3. Give the member the \`appPageUrl\` from the response: they open it in LabOS,
   enter the secret values, and click **Deploy** there. The deploy then runs
   with the stored secrets.
4. To ship a code update later, register the draft again (same \`appId\`, fresh
   \`deploymentId\`) — already-stored secret values stay valid; the member just
   clicks Deploy again in LabOS.
5. To change a key later, the member doesn't need you at all: on the app's LabOS
   page they click **Update secrets & redeploy**, enter the new value, and Deploy.

Never ask the member for secret values in the chat, and never write them to any
file — LabOS is the only place they should be entered.

## Deploying the app
When the member asks you to deploy, use the **deploy-to-labs** skill in
\`.claude/skills/deploy-to-labs/SKILL.md\`. If the app needs runtime secrets,
follow "Apps that need secrets" above instead of deploying directly. In short:
1. Read \`pln-app.config.json\` for the \`connectEndpoint\`, \`deployEndpoint\`, and
   (if present) a saved \`appId\`.
2. **Get a deploy token via LabOS (the connect flow).** There is no token in the
   kit. POST to \`connectEndpoint\` to start a connect session, give the member the
   returned \`connectUrl\` + confirmation \`userCode\` to open and approve in LabOS,
   then poll until you receive a short-lived \`deployToken\`. Full steps are in the
   deploy skill. Keep the token **in memory only** — never write it to
   \`pln-app.config.json\` or any file.
3. Choose a stable, lowercase \`appId\` (e.g. \`my-leaderboard\`) and a fresh
   \`deploymentId\` for each deploy.
4. Zip the **contents** of \`app/\` (so the \`Dockerfile\` sits at the root of the ZIP),
   excluding \`node_modules\`, build output, and any secrets/\`.env\`/data dirs, then
   upload that ZIP to \`deployEndpoint\` as multipart/form-data with the
   \`deployToken\` in the \`${AI_APP_TOKEN_HEADER}\` header. The PLN backend stores it
   and runs the build — you do not need any cloud credentials.
5. Tell the member the deploy succeeded and that they can open their app from the
   PL Infra → AI Apps dashboard. **Do NOT reveal the deployment URL, host, or port**
   (see "Keep the deployment URL private" in the deploy skill).

## Deploy token
There is **no long-lived token** in this kit. You obtain a short-lived deploy
token at deploy time through the LabOS connect flow (see the deploy skill), and
send it in the \`${AI_APP_TOKEN_HEADER}\` header. The token expires after about an
hour and is tied to the member who approved the connect link. Never print it in
logs, write it to a file, or commit it; if a deploy returns 401 (expired), just
run the connect flow again to get a fresh one.

Do not ask for or use any internal PLN APIs — only the connect and deploy
endpoints in the config are available to you.
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

If anything secret shows up (or you wrote code that needs a key), do steps 1–4 as
written but then follow "**Apps that need secrets (draft flow)**" below instead of
step 5 — you register a draft and the member deploys from LabOS after entering the
values there. Never deploy a secrets app directly and never accept key values in
the chat.

## Steps
1. Read \`pln-app.config.json\` to get \`connectEndpoint\`, \`deployEndpoint\`,
   \`draftEndpoint\`, and (if present) a saved \`appId\`. If no \`appId\` exists yet,
   pick a short, stable, lowercase slug (e.g. \`hello-board\`) and save it back to
   the config.
2. **Get a deploy token via LabOS.** The kit has no token; obtain a short-lived one
   through the connect flow:

   a. Start a session (no auth needed):

   \`\`\`bash
   curl -sX POST "<connectEndpoint>" \\
     -H "Content-Type: application/json" \\
     -d '{"clientName":"Claude Code"}'
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
   # expired  → the link timed out; start a new session (step 2a)
   \`\`\`

   Hold \`deployToken\` **in memory only** — never write it to \`pln-app.config.json\`
   or any other file, and never print it.
3. Make sure \`app/\` runs locally first (\`npm install && npm start\`, hit
   \`/health\`). For a migrated existing app, also confirm the migration checklist
   in \`AGENTS.md\` is satisfied (self-contained \`app/\`, fitting Dockerfile, binds
   \`0.0.0.0\`, no reliance on injected secrets).
4. Zip the **contents** of \`app/\` so the \`Dockerfile\` sits at the ZIP root.
   Exclude \`node_modules\`, build output, and — importantly — any secrets: real
   \`.env\` files, tokens/keys, and data dirs must never enter the ZIP (the backend
   stores it server-side).

   \`\`\`bash
   cd app && zip -r ../app.zip . \\
     -x 'node_modules/*' '*/node_modules/*' 'dist/*' '.next/*' '.env' '.env.*' '.data/*' && cd ..
   # Sanity-check nothing sensitive slipped in:
   unzip -l ../app.zip | grep -iE '\\.env|secret|credential|\\.pem|\\.key' && echo 'STOP: secret in zip' || echo 'ok'
   \`\`\`

5. Upload the ZIP to the deploy endpoint as multipart/form-data, sending the
   \`deployToken\` from step 2 in the \`${AI_APP_TOKEN_HEADER}\` header. The PLN backend
   stores the ZIP and triggers the build — no cloud credentials are needed:

   \`\`\`bash
   curl -X POST "<deployEndpoint>" \\
     -H "${AI_APP_TOKEN_HEADER}: <deployToken>" \\
     -F "appId=<your-app-id>" \\
     -F "name=<human-friendly app name>" \\
     -F "description=<one line about the app>" \\
     -F "deploymentId=<unique id per deploy, e.g. a timestamp>" \\
     -F "file=@app.zip;type=application/zip"
   \`\`\`

6. On success the response contains the deployment URL and status:

   \`\`\`json
   { "status": "READY", "url": "https://<appId>.${AI_APPS_APP_DOMAIN}", "host": "...", "port": 31001 }
   \`\`\`

   Use this URL only for the internal checks below — **do not reveal it to the
   member** (see "Keep the deployment URL private"). On \`READY\`, tell the member the
   app is live and can be opened from the PL Infra → AI Apps dashboard. If \`status\`
   is \`ERROR\`, surface \`notes\` (never the URL).

7. **Verify the app is iframe-embeddable** (internal check — do not surface the URL
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
When the app needs runtime secrets, replace the upload in step 5 with a **draft
registration** — same multipart shape, posted to \`draftEndpoint\`, plus
\`requiredEnvVars\` (the env var NAMES the app reads; JSON array or
comma-separated). Nothing is deployed yet:

\`\`\`bash
curl -X POST "<draftEndpoint>" \\
  -H "${AI_APP_TOKEN_HEADER}: <deployToken>" \\
  -F "appId=<your-app-id>" \\
  -F "name=<human-friendly app name>" \\
  -F "description=<one line about the app>" \\
  -F "deploymentId=<unique id per upload, e.g. a timestamp>" \\
  -F 'requiredEnvVars=["OPENAI_API_KEY","SUPABASE_URL"]' \\
  -F "file=@app.zip;type=application/zip"
# → { "status": "DRAFT", "appPageUrl": "https://…/pl-infra/ai-apps/<uid>", "missingEnvVars": [ … ] }
\`\`\`

Then **tell the member, in your chat, in plain non-technical language** — e.g.
*"Your app is registered. Open this link, paste your OpenAI API key into the form,
and click Deploy — that page is the only safe place for your key."* Give them
\`appPageUrl\`; they enter the values there and click **Deploy**. The deploy runs
immediately with the stored secrets; the app then appears as usual on the AI Apps
dashboard.

- **Never** ask the member to paste secret values into the chat, and never write
  them to a file — LabOS is the only place values are entered. If they paste a
  key into the chat anyway, don't use or repeat it — point them to \`appPageUrl\`
  (and suggest rotating the key if it's sensitive).
- To ship a **code update** later, re-register the draft (same \`appId\`, fresh
  \`deploymentId\`, updated \`requiredEnvVars\` if they changed) and send the member
  back to \`appPageUrl\` to click Deploy. Stored secret values remain valid.
- The member can also update secret values and redeploy entirely from LabOS —
  no agent involvement needed.

## Keep the deployment URL private
Do not print, link, or otherwise tell the member the deployment URL, host, or port —
in your messages, summaries, or saved files. The member opens their app through the
PL Infra → AI Apps dashboard, which embeds it; they never need the raw URL. You may
use the URL silently for the verification and health checks here, but it must not
appear in anything you report back. (The config file stores only the \`appId\`, not the
URL — keep it that way.)

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
        deployTokenHeader: AI_APP_TOKEN_HEADER,
        appId: '',
        notes:
          'No token is stored here. At deploy time the agent runs the LabOS connect flow (see .claude/skills/deploy-to-labs) to get a short-lived deploy token. Set appId to a stable lowercase slug on first deploy and reuse it. If the app needs runtime secrets, register it via draftEndpoint instead of deploying (see the deploy skill).',
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
