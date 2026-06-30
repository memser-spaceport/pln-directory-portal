import { Injectable, Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AI_APP_TOKEN_HEADER, AI_APPS_DEPLOY_ENDPOINT } from './ai-apps.constants';

/** Prebuilt PL Design System bundle, shipped verbatim inside the starter kit. */
const DESIGN_SYSTEM_ZIP_NAME = 'pl-design-system.zip';

/** ZIP "stored" method (no compression) — see adm-zip util/constants STORED. */
const ZIP_METHOD_STORED = 0;

/**
 * Builds the reusable "AI Apps" starter kit ZIP a member downloads once and
 * unpacks into their AI coding tool (Claude Code, Cursor, …). It carries the
 * member's personal deploy token, deploy instructions for the agent, a minimal
 * runnable app scaffold, and the full PL Design System (React components +
 * design tokens + usage guidelines) — but no PLN private API info.
 */
@Injectable()
export class AiAppsStarterKitService {
  private readonly logger = new Logger(AiAppsStarterKitService.name);

  buildZip(token: string): Buffer {
    const zip = new AdmZip();
    const add = (path: string, content: string) => zip.addFile(path, Buffer.from(content, 'utf8'));

    add('README.md', this.readme());
    add('CLAUDE.md', this.agentInstructions(token));
    add('AGENTS.md', this.agentInstructions(token));
    add('.claude/skills/deploy-to-labs/SKILL.md', this.deploySkill());
    add('pln-app.config.json', this.configJson(token));
    add('styles/pln-theme.css', this.themeCss());
    add('styles/FONTS.md', this.fontsDoc());
    add('app/server.js', this.appServer());
    add('app/package.json', this.appPackageJson());
    add('app/Dockerfile', this.appDockerfile());
    add('app/.dockerignore', 'node_modules\nnpm-debug.log\n');

    // The full PL Design System (React components, SCSS tokens, fonts, specs)
    // ships as a single prebuilt ZIP embedded verbatim — the agent unzips it
    // (see AGENTS.md). This avoids walking hundreds of files or writing any temp
    // files per download. Members consume canonical components instead of
    // hand-rolling buttons/cards/inputs.
    this.addDesignSystem(zip);

    return zip.toBuffer();
  }

  /**
   * Locate the prebuilt design-system ZIP bundled as a build asset. In a built
   * app it sits next to the compiled code (`dist/apps/web-api/ai-apps/assets/…`,
   * see `apps/web-api/project.json` assets); the source path is the fallback for
   * unbundled runs (tests / ts-node).
   */
  private designSystemZipPath(): string {
    const candidates = [
      join(__dirname, 'ai-apps', 'assets', DESIGN_SYSTEM_ZIP_NAME),
      join(process.cwd(), 'apps', 'web-api', 'src', 'ai-apps', 'assets', DESIGN_SYSTEM_ZIP_NAME),
    ];
    return candidates.find((p) => existsSync(p)) ?? candidates[0];
  }

  /**
   * Add the prebuilt design-system ZIP into the kit as a single entry, stored
   * (not recompressed) since it is already compressed. Adding it must never
   * break the kit download — if the asset is missing (misconfigured build), log
   * and ship the kit without it.
   */
  private addDesignSystem(zip: AdmZip): void {
    const path = this.designSystemZipPath();
    if (!existsSync(path)) {
      this.logger.warn(`PL Design System bundle not found at ${path}; shipping starter kit without it.`);
      return;
    }
    const entry = zip.addFile(DESIGN_SYSTEM_ZIP_NAME, readFileSync(path));
    entry.header.method = ZIP_METHOD_STORED;
  }

  private readme(): string {
    return `# PLN AI Apps — Starter Kit

Welcome! This kit lets you vibe-code an app with your AI assistant and deploy it
to the Protocol Labs Network sandbox with a single instruction.

## What's inside
- \`CLAUDE.md\` / \`AGENTS.md\` — instructions your AI agent reads automatically.
- \`.claude/skills/deploy-to-labs/\` — the deploy skill your agent uses.
- \`pln-app.config.json\` — your personal deploy token + the deploy endpoint.
- \`pl-design-system.zip\` — the **PL Design System**: ready-made React components
  (Button, MemberCard, TeamCard, Table, Tabs, Badge, PageHeader, SearchInput,
  Pagination, …), SCSS design tokens, the Inter font, and \`guidelines.md\` /
  \`USAGE.md\`. **Unzip it** (\`unzip pl-design-system.zip\`) to get a
  \`pl-design-system/\` folder. Your agent uses these instead of hand-building UI,
  so your app looks on-brand out of the box.
- \`styles/\` — a tiny CSS-variable fallback (\`pln-theme.css\`) for plain-HTML apps
  that don't use React, plus font guidance.
- \`app/\` — a minimal runnable Node app to start from (its \`server.js\`,
  \`package.json\`, and \`Dockerfile\` are placeholders you can replace).

## How to use
1. Unzip this folder and open it in Claude Code (or your AI tool of choice). Also
   unzip the bundled design system once: \`unzip pl-design-system.zip\`.
2. Add your app to the \`app/\` folder:
   - **New app:** tell your agent what to build (e.g. "build a leaderboard page
     using the PLN styles"). It works in \`app/\`.
   - **Existing app:** copy your project's files into \`app/\`, then say "migrate this
     existing app and deploy it to LabOS". Your agent takes care of whatever setup is
     needed to run it there.
3. When you're happy, say "deploy this app". Your agent ships it to the PLN sandbox;
   the first deploy can take a minute or two.
4. Your app appears on the PL Infra → AI Apps dashboard, where you can open it.

> **Don't copy passwords or secret keys into \`app/\`** — apps run on shared
> infrastructure with no credentials provided. If your app needs them, ask your
> agent how to handle it.

## Embedding in the dashboard
Your app is shown inside the AI Apps dashboard. Apps built with this kit display
correctly out of the box, and your agent checks this for you on every deploy — so you
don't need to do anything special. (The technical rule lives in \`AGENTS.md\` for your
agent's reference.)

## Keep your token private
\`pln-app.config.json\` holds a personal deploy token tied to your account. Do not
commit it to a public repo or share it.
`;
  }

  private agentInstructions(token: string): string {
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
This kit ships the **PL Design System** as \`pl-design-system.zip\`. **Unzip it
first** — \`unzip pl-design-system.zip\` — to get the \`pl-design-system/\` folder.
It is the source of truth for how PLN apps look. Then read
\`pl-design-system/USAGE.md\` (how to consume it) and
\`pl-design-system/guidelines.md\` (the rules) before building any UI.

- **Reuse the canonical React components in \`pl-design-system/components/\`** —
  Button, Input, Textarea, Checkbox, Switch, Badge, Tabs, Tooltip, Dropdown,
  Pagination, Table, SearchInput, PageHeader, MemberCard, TeamCard, Avatar,
  Sidebar, NavBar, EmptyState, and more (see \`components/component-catalog.md\`).
  **Do NOT recreate buttons, cards, inputs, badges, tables, tabs, dropdowns, or
  sidebars from scratch** — import the existing component.
- **Use the design tokens, never hardcoded values.** All colors, typography,
  spacing, radius, and shadows come from \`pl-design-system/tokens/\` (CSS custom
  properties like \`var(--background-brand-default)\`, \`var(--spacing-md)\`,
  \`var(--radius-md)\`). Never hardcode hex colors or pixel font sizes.
- **If a component you need is missing**, follow the "Missing Component Behavior"
  in \`guidelines.md\`: prefer composing existing components and tokens over
  inventing a bespoke one.
- The components are React + SCSS modules (Next.js 14). For UI work, scaffold a
  Next.js app in \`app/\` and consume the design system per \`USAGE.md\` (copy the
  \`pl-design-system/\` folder into \`app/\` so it ships on deploy, install its peer
  deps, and load the tokens globally). For a non-React/plain-HTML app, the
  minimal \`styles/pln-theme.css\` fallback is available, but the React components
  are strongly preferred.
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
3. **Assume no runtime config.** The sandbox injects NO env vars or secrets. Decide
   how the app runs without its usual credentials — degrade to sample/mock data, or
   clearly surface what's missing. Never hardcode real secrets to compensate.
4. **Never ship secrets.** Keep real \`.env\` files, tokens, keys, and data dirs OUT of
   the uploaded zip: add them to \`.dockerignore\` and confirm they're absent before
   deploying. The zip is built and stored server-side.
5. **Verify before deploying:** \`cd app && npm install && npm start\` (or the app's
   equivalent), then confirm \`GET /health\` is 200 and \`GET /\` renders.

## Deploying the app
When the member asks you to deploy, use the **deploy-to-labs** skill in
\`.claude/skills/deploy-to-labs/SKILL.md\`. In short:
1. Read \`pln-app.config.json\` for the deploy token and endpoint.
2. Choose a stable, lowercase \`appId\` (e.g. \`my-leaderboard\`) and a fresh
   \`deploymentId\` for each deploy.
3. Zip the **contents** of \`app/\` (so the \`Dockerfile\` sits at the root of the ZIP),
   excluding \`node_modules\`, build output, and any secrets/\`.env\`/data dirs, then
   upload that ZIP to the deploy endpoint as multipart/form-data. The PLN backend
   stores it and runs the build — you do not need any cloud credentials.
4. Tell the member the deploy succeeded and that they can open their app from the
   PL Infra → AI Apps dashboard. **Do NOT reveal the deployment URL, host, or port**
   (see "Keep the deployment URL private" in the deploy skill).

## Deploy token
Your deploy token is in \`pln-app.config.json\` and is sent in the
\`${AI_APP_TOKEN_HEADER}\` header. It is tied to this member's account and reused
across all of their apps. Never print it in logs or commit it. (Token starts
with \`${token.slice(0, 10)}…\`.)

Do not ask for or use any internal PLN APIs — only the deploy endpoint in the
config is available to you.
`;
  }

  private deploySkill(): string {
    return `---
name: deploy-to-labs
description: Deploy the app in ./app to the Protocol Labs Network sandbox. Use when the member asks to deploy, ship, or publish the app.
---

# Deploy to PLN Labs

Deploys the app in \`app/\` to the PLN sandbox and returns its live URL.

## Steps
1. Read \`pln-app.config.json\` to get \`deployToken\`, \`deployEndpoint\`, and (if
   present) a saved \`appId\`. If no \`appId\` exists yet, pick a short, stable,
   lowercase slug (e.g. \`hello-board\`) and save it back to the config.
2. Make sure \`app/\` runs locally first (\`npm install && npm start\`, hit
   \`/health\`). For a migrated existing app, also confirm the migration checklist
   in \`AGENTS.md\` is satisfied (self-contained \`app/\`, fitting Dockerfile, binds
   \`0.0.0.0\`, no reliance on injected secrets).
3. Zip the **contents** of \`app/\` so the \`Dockerfile\` sits at the ZIP root.
   Exclude \`node_modules\`, build output, and — importantly — any secrets: real
   \`.env\` files, tokens/keys, and data dirs must never enter the ZIP (the backend
   stores it server-side).

   \`\`\`bash
   cd app && zip -r ../app.zip . \\
     -x 'node_modules/*' '*/node_modules/*' 'dist/*' '.next/*' '.env' '.env.*' '.data/*' && cd ..
   # Sanity-check nothing sensitive slipped in:
   unzip -l ../app.zip | grep -iE '\\.env|secret|credential|\\.pem|\\.key' && echo 'STOP: secret in zip' || echo 'ok'
   \`\`\`

4. Upload the ZIP to the deploy endpoint as multipart/form-data. The PLN backend
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

5. On success the response contains the deployment URL and status:

   \`\`\`json
   { "status": "READY", "url": "https://sandbox-<appId>.plnetwork.io", "host": "...", "port": 31001 }
   \`\`\`

   Use this URL only for the internal checks below — **do not reveal it to the
   member** (see "Keep the deployment URL private"). On \`READY\`, tell the member the
   app is live and can be opened from the PL Infra → AI Apps dashboard. If \`status\`
   is \`ERROR\`, surface \`notes\` (never the URL).

6. **Verify the app is iframe-embeddable** (internal check — do not surface the URL
   to the member). The dashboard shows it in an \`<iframe>\` from a sibling
   \`*.plnetwork.io\` subdomain; check the live response headers:

   \`\`\`bash
   curl -sSI "https://sandbox-<appId>.plnetwork.io/" | grep -iE 'x-frame-options|content-security-policy'
   \`\`\`

   It must pass BOTH:
   - **No \`X-Frame-Options\` header** (it can't allow a sibling subdomain; if present
     it blocks the embed).
   - If a \`Content-Security-Policy\` is present, its \`frame-ancestors\` must include
     \`https://*.plnetwork.io\` (and must NOT be \`'none'\`).

   If either fails, the embed will show \`refused to connect\`. Fix the app's headers
   (see the framing rule in \`AGENTS.md\`) and redeploy before reporting success.

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
curl -sS -m 20 -o /dev/null -w '%{http_code}\\n' "https://sandbox-<appId>.plnetwork.io/health"
\`\`\`

If it returns \`200\` within a minute or two, the deploy worked — proceed to the
verification steps. Only re-deploy if it stays unreachable.

## Notes
- Reuse the same \`appId\` to redeploy an existing app; use a new \`deploymentId\`
  each time. Derive the URL from the \`appId\` for your own checks, but treat it as
  sensitive (see "Keep the deployment URL private").
- The deploy token authenticates you as the member — keep it secret.
- The sandbox injects no runtime env vars or secrets. An app that needs config must
  ship sensible defaults or degrade gracefully (e.g. sample data) — see the
  migration checklist in \`AGENTS.md\`.
`;
  }

  private configJson(token: string): string {
    return `${JSON.stringify(
      {
        deployEndpoint: AI_APPS_DEPLOY_ENDPOINT,
        deployTokenHeader: AI_APP_TOKEN_HEADER,
        deployToken: token,
        appId: '',
        notes: 'Set appId to a stable lowercase slug on first deploy and reuse it.',
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
