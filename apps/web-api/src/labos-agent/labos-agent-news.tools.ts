import { CoreTool, tool } from 'ai';
import { z } from 'zod';
import { HuskySourceRef } from 'libs/contracts/src/schema/husky-chat';
import { ContextualTurnSummary } from '../husky/husky-ai.service';
import { McpActorContext, McpToolDef } from '../mcp/mcp-tools';

type NewsRowLike = { uid?: unknown; title?: unknown };

/** The LabOS link of a news story (LAB-3362 D1): the story opens on Home, `/?news=<uid>`. */
export function newsStoryLink(uid: string): string {
  return `/?news=${encodeURIComponent(uid)}`;
}

/** The old Home path of a story. The AI search news tool still writes it; the web app redirects it to `/?news=`. */
const OLD_NEWS_LINK = /^\/home\/?\?news=/;

/**
 * The C1 `sourceRefs` with each news link as `/?news=<uid>` (LAB-3362 D1). The AI search news tool
 * (`getTeamNews`) writes `/home?news=<uid>`, and AI search keeps that link. Only the link changes: the index, the
 * title and the order stay, so the `[n]` citations in the answer still match.
 */
export function withNewsStoryLinks(refs: HuskySourceRef[]): HuskySourceRef[] {
  return refs.map((ref) =>
    ref.type === 'news' && ref.directoryLink && OLD_NEWS_LINK.test(ref.directoryLink)
      ? { ...ref, directoryLink: ref.directoryLink.replace(OLD_NEWS_LINK, '/?news=') }
      : ref
  );
}

/**
 * The C1 tail field `sourceRefs` with the news links of `withNewsStoryLinks`. Empty when the turn has no source refs,
 * so the tail keeps its shape (`sourceRefs` only when there are any). `turnFields` fields replace the tail fields.
 */
export function newsLinkFields(turn: ContextualTurnSummary): { sourceRefs?: HuskySourceRef[] } {
  return turn.sourceRefs.length ? { sourceRefs: withNewsStoryLinks(turn.sourceRefs) } : {};
}

/**
 * One `[NewsLink](...)` line per story, so AI search builds `sourceRefs` for the
 * stories that `list_news` and `get_news_item` return (see husky/source-refs.ts).
 */
export function newsLinkLines(result: Record<string, unknown>): string {
  const rows = (Array.isArray(result.items) ? result.items : [result]) as NewsRowLike[];
  return rows
    .filter((row) => typeof row?.uid === 'string' && typeof row?.title === 'string')
    .map((row) => `Title: ${row.title} [NewsLink](${newsStoryLink(row.uid as string)})`)
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
