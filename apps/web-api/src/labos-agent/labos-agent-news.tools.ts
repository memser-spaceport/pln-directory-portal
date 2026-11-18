import { CoreTool, tool } from 'ai';
import { z } from 'zod';
import { McpActorContext, McpToolDef } from '../mcp/mcp-tools';

type NewsRowLike = { uid?: unknown; title?: unknown };

/**
 * One `[NewsLink](...)` line per story, so AI search builds `sourceRefs` for the
 * stories that `list_news` and `get_news_item` return (see husky/source-refs.ts).
 */
export function newsLinkLines(result: Record<string, unknown>): string {
  const rows = (Array.isArray(result.items) ? result.items : [result]) as NewsRowLike[];
  return rows
    .filter((row) => typeof row?.uid === 'string' && typeof row?.title === 'string')
    .map((row) => `Title: ${row.title} [NewsLink](/home?news=${encodeURIComponent(row.uid as string)})`)
    .join('\n\n');
}

/**
 * Wraps MCP tool definitions (`list_news`, `get_news_item`) as AI SDK tools for the agent.
 * The tool runs as the signed-in member. A failure goes back to the model as text, so the
 * answer stream does not stop (the same rule as the AI search tools).
 */
export function mcpToolsAsAgentTools(defs: McpToolDef[], ctx: McpActorContext): Record<string, CoreTool> {
  return Object.fromEntries(
    defs.map((def) => [
      def.name,
      tool({
        description: def.description,
        parameters: z.object(def.inputSchema ?? {}),
        execute: async (args: Record<string, unknown>) => {
          try {
            const result = await def.execute(ctx, args);
            return [newsLinkLines(result), JSON.stringify(result)].filter(Boolean).join('\n\n');
          } catch (error) {
            return `The ${def.name} tool returned no data: ${error?.message ?? error}`;
          }
        },
      }),
    ])
  );
}
