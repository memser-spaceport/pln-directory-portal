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
      expect(content).toContain("credentials: 'include'");
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

  it('documents the response shape and signed-out handling in the skill', () => {
    const skill = entries.get('.claude/skills/pln-member-context/SKILL.md') as string;
    expect(skill).toContain('/v1/ai-apps/me');
    expect(skill).toContain("credentials: 'include'");
    expect(skill).toContain('signed-out');
    expect(skill).toContain('"teams"');
  });
});
