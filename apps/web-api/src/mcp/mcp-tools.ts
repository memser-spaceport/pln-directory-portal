export type McpActorContext = {
  memberUid: string;
  name: string;
  email: string | null;
  permissions: Set<string>;
};

export type McpToolDef = {
  name: string;
  description: string;
  visibility: 'always' | 'investor_db';
  execute: (ctx: McpActorContext) => Promise<Record<string, unknown>>;
};

export const WHOAMI_TOOL: McpToolDef = {
  name: 'whoami',
  description: 'Return the Directory member this agent is acting as.',
  visibility: 'always',
  execute: async (ctx) => ({
    memberUid: ctx.memberUid,
    name: ctx.name,
    email: ctx.email,
  }),
};

/** Later Warm Intro tickets register tools here with visibility: 'investor_db'. */
export const WARM_INTRO_TOOLS: McpToolDef[] = [];

export function isToolVisible(tool: McpToolDef, permissions: Set<string>): boolean {
  if (tool.visibility === 'always') {
    return true;
  }
  return permissions.has('investor_db.view');
}

export function toolsForPermissions(
  permissions: Set<string>,
  catalog: McpToolDef[] = [WHOAMI_TOOL, ...WARM_INTRO_TOOLS]
): McpToolDef[] {
  return catalog.filter((tool) => isToolVisible(tool, permissions));
}
