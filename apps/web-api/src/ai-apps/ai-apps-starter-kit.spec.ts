import AdmZip from 'adm-zip';

import { AiAppsStarterKitService } from './ai-apps-starter-kit.service';
import { AI_APPS_STARTER_KIT_VERSION } from './ai-apps.constants';

describe('AiAppsStarterKitService buildZip', () => {
  let entries: Map<string, string>;

  beforeAll(() => {
    const zip = new AdmZip(new AiAppsStarterKitService().buildZip());
    entries = new Map(
      zip
        .getEntries()
        .filter((e) => !e.isDirectory)
        .map((e) => [e.entryName, e.getData().toString('utf8')])
    );
  });

  it('ships the agent-facing instruction files and skills', () => {
    for (const path of [
      'README.md',
      'CLAUDE.md',
      'AGENTS.md',
      '.claude/skills/deploy-to-labs/SKILL.md',
      '.claude/skills/app-metadata/SKILL.md',
      '.claude/skills/app-logs/SKILL.md',
      '.claude/skills/pl-design-system/SKILL.md',
      '.claude/skills/pln-member-context/SKILL.md',
      '.claude/skills/db-migration/SKILL.md',
      'pln-app.config.json',
    ]) {
      expect(entries.has(path)).toBe(true);
    }
  });

  it('writes the member-context endpoint into the config (and still no token)', () => {
    const config = JSON.parse(entries.get('pln-app.config.json') as string);
    expect(config.memberContextEndpoint).toContain('/v1/ai-apps/me');
    expect(JSON.stringify(config)).not.toContain('plndeploy_');
  });

  it('stamps the kit version into the config and tells the agent to send upload metadata', () => {
    const config = JSON.parse(entries.get('pln-app.config.json') as string);
    expect(config.kitVersion).toBe(AI_APPS_STARTER_KIT_VERSION);
    const deploySkill = entries.get('.claude/skills/deploy-to-labs/SKILL.md') as string;
    expect(deploySkill).toContain('kitVersion=');
    expect(deploySkill).toContain('agentModel=');
    expect(deploySkill).toContain('clientName');
  });

  it('points the agent at the member-context skill from CLAUDE.md/AGENTS.md', () => {
    for (const path of ['CLAUDE.md', 'AGENTS.md']) {
      const content = entries.get(path) as string;
      expect(content).toContain('pln-member-context');
      // Bearer-from-cookie is the reliable transport; credentials:'include'
      // alone breaks when the cookie domain doesn't cover the API host.
      expect(content).toContain('Authorization: Bearer');
      expect(content).toContain('NOT rely on');
    }
  });

  it('tells the agent to share appPageUrl immediately and scopes the URL-privacy rule', () => {
    const deploySkill = entries.get('.claude/skills/deploy-to-labs/SKILL.md') as string;
    // The draft flow must demand the LabOS link is handed over unprompted…
    expect(deploySkill).toContain('IMMEDIATELY give the member the `appPageUrl`');
    // …and the privacy rule must explicitly exempt the LabOS links, or agents
    // over-generalize it and silently withhold appPageUrl (v1.3 field report).
    expect(deploySkill).toContain('It does NOT cover the LabOS links');
    for (const path of ['CLAUDE.md', 'AGENTS.md']) {
      expect(entries.get(path) as string).toContain('LabOS links');
    }
  });

  it('writes the metadata endpoint template and display-metadata fields into the config', () => {
    const config = JSON.parse(entries.get('pln-app.config.json') as string);
    expect(config.metadataEndpoint).toContain('/v1/ai-apps/{appUid}/agent');
    // Persisted so redeploys reuse the member-approved values and can address
    // the metadata endpoint without re-running the propose flow.
    expect(config.appUid).toBe('');
    expect(config.appName).toBe('');
    expect(config.appDescription).toBe('');
  });

  it('writes the Deployment settings deep-link template into the config', () => {
    const config = JSON.parse(entries.get('pln-app.config.json') as string);
    // A {appUid} template the agent can fill to hand the member a link that
    // opens the update-secrets-and-redeploy modal on the app page.
    expect(config.appSettingsUrl).toContain('/pl-infra/ai-apps/{appUid}');
    expect(config.appSettingsUrl).toContain('settings=deployment');
  });

  it('teaches the propose → approve → optional-PRD metadata flow', () => {
    const metadataSkill = entries.get('.claude/skills/app-metadata/SKILL.md') as string;
    // Nothing member-facing is saved without explicit approval…
    expect(metadataSkill).toContain('Wait for explicit approval');
    // …the PRD is offered, not imposed, and declining is a valid outcome…
    expect(metadataSkill).toContain('If the member declines');
    // …and saving goes through the deploy-free metadata endpoint.
    expect(metadataSkill).toContain('PATCH');
    expect(metadataSkill).toContain('{appUid}');
    expect(metadataSkill).toContain('"prd": null');
    expect(metadataSkill).toContain('no ZIP, no build');
    // Markdown one-page brief with the product template sections…
    expect(metadataSkill).toContain('prd.md');
    expect(metadataSkill).toContain('Problem Statement');
    expect(metadataSkill).toContain('Goals / OKR Impact');
    expect(metadataSkill).toContain('Success Metrics');
    expect(metadataSkill).toContain('Out of Scope');
    // …synthesized from context, not a long questionnaire.
    expect(metadataSkill).toContain('Synthesize what you already know');
    expect(metadataSkill).toContain('Ask at most one or two questions');
    for (const path of ['CLAUDE.md', 'AGENTS.md']) {
      const content = entries.get(path) as string;
      expect(content).toContain('app-metadata');
      expect(content).toContain('wait for explicit approval');
      expect(content).toContain('one-pager PRD');
      expect(content).toContain('Markdown one-page brief');
    }
  });

  it('makes redeploys reuse approved metadata instead of re-proposing', () => {
    const deploySkill = entries.get('.claude/skills/deploy-to-labs/SKILL.md') as string;
    // The deploy form overwrites stored name/description, so redeploys must
    // resend the saved values verbatim — not fresh drafts.
    expect(deploySkill).toContain("saved values verbatim and don't re-ask");
    expect(deploySkill).toContain('the approved appName from pln-app.config.json');
    expect(deploySkill).toContain("Save the response's `uid` as `appUid`");
    for (const path of ['CLAUDE.md', 'AGENTS.md']) {
      expect(entries.get(path) as string).toContain('NOT re-run the propose-and-approve flow');
    }
  });

  it('writes the log endpoint templates into the config and teaches the logs flow', () => {
    const config = JSON.parse(entries.get('pln-app.config.json') as string);
    expect(config.buildLogsEndpoint).toContain('/v1/ai-apps/{appUid}/logs/build');
    expect(config.runtimeLogsEndpoint).toContain('/v1/ai-apps/{appUid}/logs/runtime');

    const logsSkill = entries.get('.claude/skills/app-logs/SKILL.md') as string;
    expect(logsSkill).toContain('buildLogsEndpoint');
    expect(logsSkill).toContain('runtimeLogsEndpoint');
    expect(logsSkill).toContain('sinceMinutes');
    // CloudWatch quirk: an empty events page with a nextToken is NOT "no logs".
    expect(logsSkill).toContain('nextToken');
    expect(logsSkill).toContain('empty first page does NOT mean there are no logs');
    // The URL-privacy rule extends to quoted log lines.
    expect(logsSkill).toContain("don't surface the URL");

    // The agent instructions and the deploy skill's failure paths point at it.
    for (const path of ['CLAUDE.md', 'AGENTS.md']) {
      expect(entries.get(path) as string).toContain('app-logs');
    }
    const deploySkill = entries.get('.claude/skills/deploy-to-labs/SKILL.md') as string;
    expect(deploySkill).toContain('app-logs');
  });

  it('documents the response shape and signed-out handling in the skill', () => {
    const skill = entries.get('.claude/skills/pln-member-context/SKILL.md') as string;
    expect(skill).toContain('/v1/ai-apps/me');
    expect(skill).toContain('readAuthToken');
    expect(skill).toContain('authToken=([^;]*)');
    expect(skill).toContain('Bearer');
    expect(skill).toContain('signed-out');
    expect(skill).toContain('"teams"');
  });

  it('teaches the agent to offer database provisioning as an alternative to BYO', () => {
    const config = JSON.parse(entries.get('pln-app.config.json') as string);
    // Absent by default; the agent sets it only after the member opts in, and
    // persists it so redeploys don't have to ask again.
    expect(config.database).toBeNull();

    const deploySkill = entries.get('.claude/skills/deploy-to-labs/SKILL.md') as string;
    // The choice belongs to the member, not the agent.
    expect(deploySkill).toContain("don't assume");
    expect(deploySkill).toContain('Needs a database?');
    // The exact opt-in payload the backend expects.
    expect(deploySkill).toContain('{"enabled":true,"type":"postgres"}');
    // The app never generates its own credentials or creates the database.
    expect(deploySkill).toContain('You never create the database');
    // The ready-to-use env vars a provisioned database injects.
    expect(deploySkill).toContain('DATABASE_URL');
    expect(deploySkill).toContain('JDBC_DATABASE_URL');
    expect(deploySkill).toContain('DB_PASSWORD');
    // BYO is routed through the existing secrets flow, not a bespoke one.
    expect(deploySkill).toContain('bring their own');
    expect(deploySkill).toContain('this is just a runtime secret');
  });

  it('warns the agent the provisioned database requires SSL and how to enable it per stack (field-hit 2026-07-31)', () => {
    const deploySkill = entries.get('.claude/skills/deploy-to-labs/SKILL.md') as string;
    // The literal error the member hit in prod — matching on it lets the agent
    // recognize the failure instantly instead of re-checking credentials.
    expect(deploySkill).toContain('no encryption');
    expect(deploySkill).toContain("doesn't mean");
    // node-postgres is the most common stack for this kit and needs an
    // explicit `ssl` option — appending sslmode to the URL alone is a no-op.
    expect(deploySkill).toContain('ignores that query param');
    expect(deploySkill).toContain('rejectUnauthorized: false');
    // Other common stacks the kit's agent might be building in.
    expect(deploySkill).toContain('Prisma');
    expect(deploySkill).toContain('psycopg2');
    expect(deploySkill).toContain('sslmode=require');
  });

  it('tells the human, in the README, that a database can be provisioned or brought their own', () => {
    const readme = entries.get('README.md') as string;
    expect(readme).toContain('## Apps that need a database');
    expect(readme).toContain('Let PL set one up for you');
    expect(readme).toContain('Connect a database you already have');
    // Routed through the same secure page as any other secret, not a new one.
    expect(readme).toContain('Apps that need an API key or password');
  });

  it('ships the curated Tailwind design system (and not Storybook/GAP docs)', () => {
    for (const path of [
      'pl-design-system/USAGE.md',
      'pl-design-system/guidelines.md',
      'pl-design-system/README.md',
      'pl-design-system/tokens/tokens.css',
      'pl-design-system/tokens/tailwind-theme.css',
      'pl-design-system/components/index.ts',
      'pl-design-system/components/EntityCard.tsx',
      'pl-design-system/lib/cn.ts',
    ]) {
      expect(entries.has(path)).toBe(true);
    }
    for (const path of entries.keys()) {
      expect(path).not.toMatch(/\.stories\.tsx$/);
      expect(path).not.toMatch(/GAP-/);
      expect(path).not.toContain('AUDIT.md');
      expect(path).not.toContain('.storybook/');
      expect(path).not.toContain('globals.scss');
    }
  });

  it('teaches semantic Tailwind tokens and EntityCard in the design-system skill', () => {
    const skill = entries.get('.claude/skills/pl-design-system/SKILL.md') as string;
    expect(skill).toContain('Semantic tokens only');
    expect(skill).toContain('bg-surface');
    expect(skill).toContain('EntityCard');
    expect(skill).toContain('@source');
    expect(skill).toContain('Tailwind v4');
    expect(skill).not.toContain('Layer 3');
    expect(skill).not.toContain('globals.scss');
    expect(skill).not.toContain('SCSS');

    for (const path of ['CLAUDE.md', 'AGENTS.md']) {
      const content = entries.get(path) as string;
      expect(content).toContain('Semantic tokens only');
      expect(content).toContain('bg-surface');
      expect(content).not.toContain('globals.scss');
      expect(content).not.toContain('var(--background-brand-default)');
    }

    const readme = entries.get('README.md') as string;
    expect(readme).toContain('Tailwind v4');
    expect(readme).toContain('EntityCard');
    expect(readme).not.toContain('SCSS design tokens');
  });

  it('teaches the db-migration skill to detect, port, and report on an existing database', () => {
    const skill = entries.get('.claude/skills/db-migration/SKILL.md') as string;
    // Detection covers the common BaaS/ORM/driver signatures and existing migration folders.
    expect(skill).toContain('@supabase/supabase-js');
    expect(skill).toContain('supabase/migrations');
    expect(skill).toContain('prisma/migrations');
    // Provider-specific features must be reported, never silently dropped.
    expect(skill).toContain('Supabase Auth, Storage, or Realtime');
    expect(skill).toContain('auth.uid()');
    expect(skill).toContain('db-migration-report.md');
    // Extensions the generated SQL might need.
    expect(skill).toContain('pgcrypto');
    expect(skill).toContain('uuid-ossp');
    expect(skill).toContain('CREATE EXTENSION IF NOT EXISTS');
    // The platform has no migration hook — the app's own image must run it.
    expect(skill).toContain('no platform-level migration step');
    expect(skill).toContain('_pln_migrations');
    // Never guesses credentials, and hands off to the existing provisioned-database contract.
    expect(skill).toContain('Never provision or guess credentials');
    expect(skill).toContain('{"enabled":true,"type":"postgres"}');
    expect(skill).toContain('deploy-to-labs');

    // AGENTS.md/CLAUDE.md and the README point the agent/member at it.
    for (const path of ['CLAUDE.md', 'AGENTS.md']) {
      expect(entries.get(path) as string).toContain('db-migration');
    }
    const readme = entries.get('README.md') as string;
    expect(readme).toContain('db-migration');
    expect(readme).toContain('move my database to PL');
  });

  it('copies existing data by default alongside the schema, as one migration', () => {
    const skill = entries.get('.claude/skills/db-migration/SKILL.md') as string;
    // Data copy is the default path; starting empty is the one opt-out.
    expect(skill).toContain('by default');
    expect(skill).toContain("the data half doesn't need a separate approval");
    expect(skill).toContain('rather start the new database empty');
    expect(skill).toContain('snapshot copy, not live sync');
    // Idempotent/resumable per-table tracking, mirroring the schema tracking table.
    expect(skill).toContain('_pln_data_copy');
    expect(skill).toContain('ON CONFLICT');
    // FK-safe ordering, batching under the runtime memory limit, and sequence fixup.
    expect(skill).toContain('parents before children');
    expect(skill).toContain('384Mi memory');
    expect(skill).toContain('setval(pg_get_serial_sequence');
    // Progress is only observable after deploy, via the existing logs skill.
    expect(skill).toContain('[db-migration]');
    expect(skill).toContain('app-logs');
    // Old credentials must survive long enough for the copy to run.
    expect(skill).toContain('keep the old database');
    expect(skill).toContain('Never truncate, delete from, or write back to the **old** database');
    // Not a separate approval gate from the schema migration itself.
    expect(skill).toContain("don't treat");
    expect(skill).toContain('it as a separate ask requiring its own approval');

    const readme = entries.get('README.md') as string;
    expect(readme).toContain('and your existing data');
    expect(readme).toContain('one migration, not two separate asks');

    for (const path of ['CLAUDE.md', 'AGENTS.md']) {
      expect(entries.get(path) as string).toContain('existing data by default');
    }
  });
});
