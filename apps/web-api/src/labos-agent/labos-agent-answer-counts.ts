import { LabosAgentAnswerCounts } from 'libs/contracts/src/schema/labos-agent';
import { HuskySourceRef } from 'libs/contracts/src/schema/husky-chat';
import { ContextualTurnSummary } from '../husky/husky-ai.service';

/** The AI search web search tool (`HuskyAiToolsService.getTools`). */
export const WEB_SEARCH_TOOL = 'searchWeb';

/** One key for a link: trimmed, with no trailing slash. */
function linkKey(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** A source ref by its link. A ref with no link is the type and the title. */
function refKey(ref: HuskySourceRef): string {
  const link = ref.externalUrl || ref.directoryLink;
  return link ? linkKey(link) : `${ref.type}:${ref.title}`;
}

/**
 * The C1 answer counts (LAB-3297, V0-R4). Counts and a boolean only.
 * `sourceCount` counts each item of `sourceRefs` and `sources` once: a web page in both lists is one source.
 */
export function answerCounts(turn: ContextualTurnSummary): Required<LabosAgentAnswerCounts> {
  const keys = new Set<string>();
  for (const ref of turn.sourceRefs) keys.add(refKey(ref));
  for (const url of turn.sources) if (typeof url === 'string' && url.trim()) keys.add(linkKey(url));
  return {
    toolCount: turn.toolNames.length,
    usedWebSearch: turn.toolNames.includes(WEB_SEARCH_TOOL),
    sourceCount: keys.size,
  };
}
