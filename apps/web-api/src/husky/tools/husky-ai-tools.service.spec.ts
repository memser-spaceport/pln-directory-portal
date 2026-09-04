// `ai` pulls in untranspiled ESM this jest config can't parse; only its types are used here.
jest.mock('ai', () => ({}));

import { CoreTool } from 'ai';
import { HuskyAiToolsService } from './husky-ai-tools.serivice';

function fakeTool(execute?: (args: any) => Promise<string>) {
  return { getTool: jest.fn().mockReturnValue({ description: 'fake', parameters: {}, execute }) };
}

function run(tool: CoreTool, args: Record<string, unknown>, options: any) {
  if (!tool.execute) {
    throw new Error('tool has no execute');
  }
  return tool.execute(args, options);
}

describe('HuskyAiToolsService.getTools', () => {
  const logger = { error: jest.fn(), info: jest.fn() };
  const options = { toolCallId: 'call-1', messages: [] };

  const irlEvents = fakeTool(async () => 'events');
  const members = fakeTool(async () => 'members');
  const teams = fakeTool(async () => {
    throw new Error('column does not exist');
  });
  const projects = fakeTool(async () => 'projects');
  const focusAreas = fakeTool(async () => 'focus areas');
  const asks = fakeTool(async () => 'asks');
  const forum = fakeTool(undefined);

  const service = new HuskyAiToolsService(
    logger as any,
    irlEvents as any,
    members as any,
    teams as any,
    projects as any,
    focusAreas as any,
    asks as any,
    forum as any
  );

  beforeEach(() => jest.clearAllMocks());

  it('exposes only database-backed tools and passes the login state where it matters', () => {
    const tools = service.getTools(true);
    expect(Object.keys(tools).sort()).toEqual(
      ['getAsks', 'getFocusAreas', 'getForumPosts', 'getIrlEvents', 'getMembers', 'getProjects', 'getTeams'].sort()
    );
    expect(members.getTool).toHaveBeenCalledWith(true);
    expect(forum.getTool).toHaveBeenCalledWith(true);
  });

  it('turns a throwing tool into a tool result instead of an exception', async () => {
    const tools = service.getTools(false);

    await expect(run(tools.getTeams, { search: 'Example' }, options)).resolves.toMatch(
      /getTeams tool is currently unavailable/
    );
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('getTeams'));
    await expect(run(tools.getMembers, {}, options)).resolves.toBe('members');
  });

  it('leaves tools without an execute function untouched', () => {
    const tools = service.getTools(false);
    expect(tools.getForumPosts.execute).toBeUndefined();
  });
});
