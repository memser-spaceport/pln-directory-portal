import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
import { aiAppWriteTools } from './mcp-ai-app-feedback-tools';
import { McpActorContext, McpToolDef, toolInputSchema } from './mcp-tools';

const CTX: McpActorContext = {
  memberUid: 'owner-1',
  name: 'Ada',
  email: 'ada@example.com',
  permissions: new Set(['ai_apps.write']),
  authorizationUid: 'auth-1',
  clientName: 'Claude Code',
  agentAccess: 'write',
};

const APP = {
  uid: 'app-1',
  appId: 'demo',
  name: 'Demo',
  description: 'Old',
  status: 'READY',
  s3Key: 'k',
  memberUid: 'owner-1',
};

function build() {
  const aiApps = {
    deployDraft: jest.fn().mockResolvedValue({
      ...APP,
      status: 'DEPLOYING',
      deploymentId: 'dep-1',
      statusEndpoint: 'https://api/v1/ai-apps/app-1/deployments/dep-1',
      pollIntervalSec: 5,
    }),
    updateMetadata: jest.fn(async (_m: string, _uid: string, dto: Record<string, unknown>) => ({ ...APP, ...dto })),
  };
  const tools = new Map(aiAppWriteTools(aiApps as any).map((t) => [t.name, t]));
  const tool = (name: string) => tools.get(name) as McpToolDef;
  return { aiApps, tool };
}

describe('MCP AI App write tools (LAB-3061)', () => {
  it('redeploys the stored bundle as the member, with no secrets, and returns the status without the token URL', async () => {
    const { aiApps, tool } = build();
    const result: any = await tool('redeploy_ai_app').execute(CTX, { appUid: 'app-1' });
    expect(aiApps.deployDraft).toHaveBeenCalledWith('owner-1', 'app-1', undefined, 'prod');
    expect(result).toEqual({
      app: { uid: 'app-1', appId: 'demo', name: 'Demo', description: 'Old', status: 'DEPLOYING' },
      deploymentId: 'dep-1',
      pollIntervalSec: 5,
      checkStatusWith: 'list_my_ai_apps',
    });
    expect(JSON.stringify(result)).not.toContain('statusEndpoint');
    expect(JSON.stringify(result)).not.toContain('s3Key');
  });

  it('renames with a trimmed name and changes the description, through the page service', async () => {
    const { aiApps, tool } = build();
    const renamed: any = await tool('rename_ai_app').execute(CTX, { appUid: 'app-1', name: '  New name ' });
    expect(aiApps.updateMetadata).toHaveBeenCalledWith('owner-1', 'app-1', { name: 'New name' });
    expect(renamed.app.name).toBe('New name');

    await tool('update_ai_app_description').execute(CTX, { appUid: 'app-1', description: '' });
    expect(aiApps.updateMetadata).toHaveBeenLastCalledWith('owner-1', 'app-1', { description: '' });
  });

  it.each([
    ['rename_ai_app', { appUid: 'app-1', name: '   ' }],
    ['rename_ai_app', { appUid: 'app-1', name: 'x'.repeat(201) }],
    ['update_ai_app_description', { appUid: 'app-1', description: 'x'.repeat(4001) }],
    ['update_ai_app_description', { appUid: 'app-1' }],
    ['redeploy_ai_app', {}],
  ])('%s refuses %j and changes nothing', async (name, args) => {
    const { aiApps, tool } = build();
    await expect(tool(name).execute(CTX, args)).rejects.toBeInstanceOf(BadRequestException);
    expect(aiApps.deployDraft).not.toHaveBeenCalled();
    expect(aiApps.updateMetadata).not.toHaveBeenCalled();
  });

  it.each([
    ['redeploy_ai_app', { appUid: 'app-1', secrets: { API_KEY: 'x' } }, 'secrets'],
    ['redeploy_ai_app', { appUid: 'app-1', environment: 'preview' }, 'environment'],
    ['rename_ai_app', { appUid: 'app-1', name: 'n', feedbackEnabled: false }, 'feedbackEnabled'],
    ['update_ai_app_description', { appUid: 'app-1', description: 'd', prd: '# x' }, 'prd'],
  ])('%s refuses extra arguments by name after the SDK parse', async (name, args, field) => {
    const { aiApps, tool } = build();
    const t = tool(name);
    const parsed = (toolInputSchema(t) as z.ZodTypeAny).parse(args);
    await expect(t.execute(CTX, parsed)).rejects.toThrow(field);
    expect(aiApps.deployDraft).not.toHaveBeenCalled();
    expect(aiApps.updateMetadata).not.toHaveBeenCalled();
  });

  it.each([
    ['redeploy_ai_app', { appUid: 'app-1' }],
    ['rename_ai_app', { appUid: 'app-1', name: 'n' }],
    ['update_ai_app_description', { appUid: 'app-1', description: 'd' }],
  ])('%s needs ai_apps.write, like the page routes', async (name, args) => {
    const { aiApps, tool } = build();
    await expect(tool(name).execute({ ...CTX, permissions: new Set(['ai_apps.read']) }, args)).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(aiApps.deployDraft).not.toHaveBeenCalled();
    expect(aiApps.updateMetadata).not.toHaveBeenCalled();
  });

  it("passes the service's not-allowed and deploy-running errors through", async () => {
    const { aiApps, tool } = build();
    aiApps.deployDraft.mockRejectedValueOnce(
      new ForbiddenException('Only the app creator or a directory admin can deploy this app')
    );
    await expect(tool('redeploy_ai_app').execute(CTX, { appUid: 'app-2' })).rejects.toThrow('Only the app creator');
    aiApps.deployDraft.mockRejectedValueOnce(new ConflictException('A deploy is already in progress'));
    await expect(tool('redeploy_ai_app').execute(CTX, { appUid: 'app-1' })).rejects.toBeInstanceOf(ConflictException);
  });
});
