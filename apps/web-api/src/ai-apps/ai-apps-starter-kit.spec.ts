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
      '.claude/skills/pl-design-system/SKILL.md',
      '.claude/skills/pln-member-context/SKILL.md',
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

  it('documents the response shape and signed-out handling in the skill', () => {
    const skill = entries.get('.claude/skills/pln-member-context/SKILL.md') as string;
    expect(skill).toContain('/v1/ai-apps/me');
    expect(skill).toContain('readAuthToken');
    expect(skill).toContain('authToken=([^;]*)');
    expect(skill).toContain('Bearer');
    expect(skill).toContain('signed-out');
    expect(skill).toContain('"teams"');
  });
});
