import { Injectable } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { AI_APP_TOKEN_HEADER, AI_APPS_DEPLOY_ENDPOINT } from './ai-apps.constants';

/**
 * Builds the reusable "AI Apps" starter kit ZIP a member downloads once and
 * unpacks into their AI coding tool (Claude Code, Cursor, …). It carries the
 * member's personal deploy token, deploy instructions for the agent, a minimal
 * runnable app scaffold, and the PLN design tokens — but no PLN private API info.
 */
@Injectable()
export class AiAppsStarterKitService {
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

    return zip.toBuffer();
  }

  private readme(): string {
    return `# PLN AI Apps — Starter Kit

Welcome! This kit lets you vibe-code an app with your AI assistant and deploy it
to the Protocol Labs Network sandbox with a single instruction.

## What's inside
- \`CLAUDE.md\` / \`AGENTS.md\` — instructions your AI agent reads automatically.
- \`.claude/skills/deploy-to-labs/\` — the deploy skill your agent uses.
- \`pln-app.config.json\` — your personal deploy token + the deploy endpoint.
- \`styles/\` — PLN design tokens (CSS variables) and font guidance.
- \`app/\` — a minimal runnable Node app to start from.

## How to use
1. Unzip this folder and open it in Claude Code (or your AI tool of choice).
2. Tell your agent what you want to build (e.g. "build a leaderboard page using
   the PLN styles"). It edits files in \`app/\`.
3. When you're happy, say "deploy this app". The agent follows the deploy skill,
   packages \`app/\`, and ships it to the PLN sandbox.
4. Your app appears on the PL Infra → AI Apps dashboard with its live URL.

## Embedding in the dashboard
Your app is displayed inside the AI Apps dashboard in an \`<iframe>\` served from a
\`*.plnetwork.io\` subdomain. The starter app embeds fine as-is. If you add security
headers (e.g. \`helmet\` or a Content-Security-Policy), keep it embeddable: don't send
\`X-Frame-Options\`, and if you set a CSP make sure \`frame-ancestors\` allows
\`https://*.plnetwork.io\`. Otherwise the dashboard shows "refused to connect". See the
framing rule in \`AGENTS.md\`; the deploy skill verifies this automatically.

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
  on the port given by the \`PORT\` env var (default 3000).
- The app must expose a \`GET /health\` endpoint returning HTTP 200.
- Use the PLN design tokens in \`styles/pln-theme.css\` for any UI you create.
- Keep dependencies minimal. The sandbox builds from the \`app/Dockerfile\`.

## Deploying the app
When the member asks you to deploy, use the **deploy-to-labs** skill in
\`.claude/skills/deploy-to-labs/SKILL.md\`. In short:
1. Read \`pln-app.config.json\` for the deploy token and endpoint.
2. Choose a stable, lowercase \`appId\` (e.g. \`my-leaderboard\`) and a fresh
   \`deploymentId\` for each deploy.
3. Zip the **contents** of \`app/\` (so \`Dockerfile\`, \`package.json\`, \`server.js\`
   sit at the root of the ZIP) and upload that ZIP to the deploy endpoint as
   multipart/form-data. The PLN backend stores it and runs the build — you do not
   need any cloud credentials.
4. Report the returned live URL back to the member.

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
   \`/health\`).
3. Zip the **contents** of \`app/\` so the \`Dockerfile\` sits at the ZIP root:

   \`\`\`bash
   cd app && zip -r ../app.zip . -x 'node_modules/*' '*/node_modules/*' && cd ..
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

5. On success the response contains the live URL:

   \`\`\`json
   { "status": "READY", "url": "https://sandbox-<appId>.plnetwork.io", "host": "...", "port": 31001 }
   \`\`\`

   Report the \`url\` to the member. If \`status\` is \`ERROR\`, surface \`notes\`.

6. **Verify the app is iframe-embeddable** (the dashboard shows it in an \`<iframe>\`
   from a sibling \`*.plnetwork.io\` subdomain). Check the live response headers:

   \`\`\`bash
   curl -sSI "https://sandbox-<appId>.plnetwork.io/" \
     | grep -iE 'x-frame-options|content-security-policy'
   \`\`\`

   It must pass BOTH:
   - **No \`X-Frame-Options\` header** (it can't allow a sibling subdomain; if present
     it blocks the embed).
   - If a \`Content-Security-Policy\` is present, its \`frame-ancestors\` must include
     \`https://*.plnetwork.io\` (and must NOT be \`'none'\`).

   If either fails, the embed will show \`refused to connect\`. Fix the app's headers
   (see the framing rule in \`AGENTS.md\`) and redeploy before reporting success.

## Notes
- Reuse the same \`appId\` to redeploy an existing app; use a new \`deploymentId\`
  each time. The app is served at \`https://sandbox-<appId>.plnetwork.io\`.
- The deploy token authenticates you as the member — keep it secret.
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

Load it in your HTML \`<head>\`:

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
