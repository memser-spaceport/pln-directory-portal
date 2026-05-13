import { FieldEntry } from '../../../hooks/teams/useTeamsEnrichmentReview';

export function formatFieldContent(content: FieldEntry['content']): string {
  if (content === null || content === undefined) return '';
  if (Array.isArray(content)) return content.join(', ');
  if (typeof content === 'object' && 'url' in content) return content.url ?? '';
  const str = String(content);
  return str.length > 100 ? str.slice(0, 100) + '…' : str;
}
