import { Injectable } from '@nestjs/common';
import { SearchResult, SearchResultItem } from 'libs/contracts/src/schema/global-search';
import { OpenSearchService } from '../opensearch/opensearch.service';
import { truncate } from '../utils/formatters';

const MAX_SEARCH_RESULTS_PER_INDEX = 50;
const AUTOMCOMPLETE_MAX_LENGTH = 50;

type FetchAllOptions = {
  strict?: boolean;
  perIndexSize?: number; // default: MAX_SEARCH_RESULTS_PER_INDEX
  topN?: number;         // default: 50 (controls result.top when no pagination)
  page?: number;         // 1-based; optional combined pagination
  pageSize?: number;     // optional combined pagination
};

@Injectable()
export class SearchService {
  constructor(private readonly openSearchService: OpenSearchService) {}

  /**
   * Loose query (current default behavior): multi_match best_fields.
   * Good for partial text; behaves like OR after analysis.
   */
  private buildLooseQuery(fields: string[], text: string) {
    return {
      query: {
        multi_match: {
          query: text,
          fields,
          type: 'best_fields',
        },
      },
    };
  }

  /**
   * Strict query: boosts text fields, tries exact phrase + phrase_prefix, and keyword terms.
   * Tweak weights (e.g., name^4) if you want per-field importance.
   */
  private buildStrictQuery(fields: string[], text: string) {
    const keywordOnly = new Set<string>([
      'tags', 'image',
      'name_suggest','tagline_suggest','tags_suggest','shortDescription_suggest','location_suggest',
    ]);

    const textFields = fields.filter(f => !keywordOnly.has(f));
    const kwFields   = fields.filter(f => keywordOnly.has(f));
    const weightedText = textFields.map(f => `${f}^3`);

    const bestFields = textFields.length ? {
      multi_match: {
        query: text,
        type: 'best_fields',
        fields: weightedText,
        operator: 'and',
        tie_breaker: 0.2,
        boost: 1.2,
      },
    } : undefined;

    const exactPhrase = textFields.length ? {
      multi_match: {
        query: text,
        type: 'phrase',
        fields: weightedText,
        slop: 0,
        boost: 3.0,
      },
    } : undefined;

    const phrasePrefix = textFields.length ? {
      multi_match: {
        query: text,
        type: 'phrase_prefix',
        fields: weightedText,
        slop: 0,
        max_expansions: 50,
        boost: 3.0,
      },
    } : undefined;

    const keywordClauses: any[] = [
      // exact <field>.keyword if exists
      ...fields.map(f => ({ term: { [`${f}.keyword`]: { value: text, boost: 10.0 } } })),
      // exact on keyword-only fields
      ...kwFields.map(f => ({ term: { [f]: { value: text, boost: 10.0 } } })),
    ];

    // For single-word queries, prefix-match over keyword fields as a fallback
    const terms = text.trim().split(/\s+/);
    if (terms.length === 1) {
      for (const f of fields) {
        keywordClauses.push({ prefix: { [`${f}.keyword`]: { value: text.toLowerCase(), boost: 4.0 } } });
      }
    }
    // Prefix for keyword-only fields as well
    for (const f of kwFields) {
      keywordClauses.push({ prefix: { [f]: { value: text.toLowerCase(), boost: 1.5 } } });
    }

    const should: any[] = [
      ...(bestFields ? [bestFields] : []),
      ...(exactPhrase ? [exactPhrase] : []),
      ...(phrasePrefix ? [phrasePrefix] : []),
      ...keywordClauses,
    ];

    return { query: { bool: { minimum_should_match: 1, should } } };
  }

  /** Attach a basic highlighter for the provided fields. */
  private withHighlight(baseBody: any, fields: string[]) {
    return {
      ...baseBody,
      highlight: {
        fields: fields.reduce<Record<string, object>>((acc, f) => {
          acc[f] = {};
          return acc;
        }, {}),
      },
    };
  }

  /** -------- lightweight text matching for forumThreads -------- */
  private normalize(s: string) {
    return (s ?? '').toString().toLowerCase();
  }
  private includes(haystack: string, needle: string) {
    return this.normalize(haystack).includes(this.normalize(needle));
  }

  /**
   * Build matches for forum threads manually from _source:
   * - include only real matches
   * - always show topic (fallback to topicTitle if no matches)
   * - include pid, uidAuthor, cid for posts and comments
   */
  private pickForumMatchesFromSource(src: any, text: string, maxCommentMatches = 5) {
    const matches: Array<{ field: string; content: string; pid?: number; uidAuthor?: number; cid?: number }> = [];
    const cid = typeof src?.cid === 'number' ? src.cid : undefined;

    // Topic-level fields
    if (this.includes(src?.topicTitle ?? '', text)) {
      matches.push({ field: 'topicTitle', content: String(src.topicTitle), cid });
    }
    if (this.includes(src?.name ?? '', text) && src?.name && src?.name !== src?.topicTitle) {
      matches.push({ field: 'name', content: String(src.name), cid });
    }
    if (this.includes(src?.topicSlug ?? '', text)) {
      matches.push({ field: 'topicSlug', content: String(src.topicSlug), cid });
    }
    if (this.includes(src?.topicUrl ?? '', text)) {
      matches.push({ field: 'topicUrl', content: String(src.topicUrl), cid });
    }

    // Root post
    const root = src?.rootPost;
    if (root?.content && this.includes(root.content, text)) {
      matches.push({
        field: 'rootPost.content',
        content: String(root.content),
        pid: typeof root.pid === 'number' ? root.pid : undefined,
        uidAuthor: typeof root.uidAuthor === 'number' ? root.uidAuthor : undefined,
        cid,
      });
    }

    // Replies
    const replies: any[] = Array.isArray(src?.replies) ? src.replies : [];
    for (const r of replies) {
      if (r?.content && this.includes(r.content, text)) {
        matches.push({
          field: 'replies.content',
          content: String(r.content),
          pid: typeof r.pid === 'number' ? r.pid : undefined,
          uidAuthor: typeof r.uidAuthor === 'number' ? r.uidAuthor : undefined,
          cid,
        });
        if (matches.length >= maxCommentMatches) break;
      }
    }

    // Fallback if nothing matched
    if (matches.length === 0 && src?.topicTitle) {
      matches.push({ field: 'topicTitle', content: String(src.topicTitle), cid });
    }

    return matches;
  }

  /** ------------------------------------------------------------------------ */

  /**
   * Full search across all sections with combined "top".
   * Simpler forumThreads handling:
   * - ignore OpenSearch highlights
   * - build matches manually from _source with pid/uidAuthor/cid
   * - always include topic
   */
  async fetchAllIndices(text: string, options?: FetchAllOptions): Promise<SearchResult> {
    const indices: Record<string, [string, string[]]> = {
      events:   ['event',      ['name','description','shortDescription','additionalInfo','location']],
      projects: ['project',    ['name','tagline','description','readMe','tags']],
      teams:    ['team',       ['name','shortDescription','longDescription']],
      members:  ['member',     ['name','bio']],
      forumThreads: ['forum_thread', ['name','topicTitle','topicSlug','topicUrl','rootPost.content','replies.content']],
    };

    const perIndexSize = options?.perIndexSize ?? MAX_SEARCH_RESULTS_PER_INDEX;
    const topN         = options?.topN ?? 50;

    const result: SearchResult = {
      events: [], projects: [], teams: [], members: [], forumThreads: [], top: [],
    };

    const allHits: Array<SearchResultItem & { score: number }> = [];

    for (const key of Object.keys(indices)) {
      const [index, fields] = indices[key];
      const queryBody = options?.strict
        ? this.buildStrictQuery(fields, text)
        : this.buildLooseQuery(fields, text);

      const body = (key === 'forumThreads')
        ? { ...queryBody, sort: [{ _score: 'desc' }], track_total_hits: true }
        : { ...this.withHighlight(queryBody, fields), sort: [{ _score: 'desc' }], track_total_hits: true };

      const res = await this.openSearchService.searchWithLimit(index, perIndexSize, body);

      for (const hit of res.body.hits.hits) {
        const src = hit._source || {};

        let matches: any[] = [];
        if (key === 'forumThreads') {
          matches = this.pickForumMatchesFromSource(src, text);
        } else {
          matches = Object.entries(hit.highlight || {}).map(([field, value]: [string, any]) => ({
            field,
            content: (Array.isArray(value) ? value : [value]).join(' '),
          }));
        }

        let item: SearchResultItem & { cid?: number } = {
          uid: String(hit._id),
          name: src?.name ?? '',
          image: src?.image ?? '',
          index: key as SearchResultItem['index'],
          matches,
          source: src,
        };

        // Members: pass through extra context
        if (key === 'members') {
          if (typeof src.scheduleMeetingCount === 'number') {
            item.scheduleMeetingCount = src.scheduleMeetingCount;
          }
          if (typeof src.officeHoursUrl === 'string') {
            item.officeHoursUrl = src.officeHoursUrl;
          }
          if (typeof src.availableToConnect === 'boolean') {
            item.availableToConnect = src.availableToConnect;
          }
        }

        // Forum threads: decorate and compute a better display name/snippet
        if (key === 'forumThreads') {
          item.kind = 'forum_thread';
          const summary = src?.rootPost?.content ? String(src.rootPost.content).slice(0, 120) : '';
          item.name = src?.topicTitle ? `[${src.topicTitle}] ${summary}` : (src?.name ?? summary);
          item.topicTitle = src?.topicTitle;
          item.topicSlug  = src?.topicSlug;
          item.topicUrl   = src?.topicUrl;
          item.replyCount = typeof src?.replyCount === 'number' ? src.replyCount : undefined;
          item.lastReplyAt = src?.lastReplyAt ?? undefined;

          if (typeof src?.cid === 'number') {
            (item as any).cid = src.cid;
          }
        }

        (result as any)[key].push(item);
        allHits.push({ ...item, score: typeof hit._score === 'number' ? hit._score : 0 });
      }
    }

    // Global ranking by score (desc)
    allHits.sort((a, b) => b.score - a.score);

    // Optional combined pagination
    if (options?.page && options?.pageSize) {
      const start = (options.page - 1) * options.pageSize;
      result.top = allHits.slice(start, start + options.pageSize)
        .map(({ score, ...rest }) => rest);
    } else {
      result.top = allHits.slice(0, topN).map(({ score, ...rest }) => rest);
    }

    return result;
  }

  /**
   * Autocomplete via completion suggesters.
   * Forum: forum_thread.name_suggest is used to suggest thread titles/summaries.
   */
  async autocompleteSearch(text: string, size = 5): Promise<SearchResult> {
    const indices: Record<string, [string, string[]]> = {
      events:       ['event',      ['name_suggest','shortDescription_suggest','location_suggest']],
      projects:     ['project',    ['name_suggest','tagline_suggest','tags_suggest']],
      teams:        ['team',       ['name_suggest','shortDescription_suggest']],
      members:      ['member',     ['name_suggest']],

      // Forum threads suggester
      forumThreads: ['forum_thread', ['name_suggest']],
    };

    const results: SearchResult = {
      events: [], teams: [], projects: [], members: [], forumThreads: [], top: [],
    };

    for (const key of Object.keys(indices)) {
      const [index, fields] = indices[key];

      const body: any = { suggest: {} };
      fields.forEach((field) => {
        body.suggest[`suggest_${field}`] = {
          prefix: text,
          completion: { field, size },
        };
      });

      const response = await this.openSearchService.searchWithLimit(index, MAX_SEARCH_RESULTS_PER_INDEX, body);

      const found: Record<string, SearchResultItem & { cid?: number }> = {};
      const ids = new Set<string>();

      // Collect suggestion IDs and basic match snippets
      for (const sk in response.body.suggest) {
        const suggestions = response.body.suggest[sk];
        const first = Array.isArray(suggestions) ? suggestions[0] : null;
        if (!first || !Array.isArray(first.options)) continue;

        first.options.forEach((opt: any) => {
          const id = String(opt._id);
          ids.add(id);
          if (!found[id]) {
            found[id] = {
              uid: id,
              name: '',
              image: '',
              index: key as SearchResultItem['index'],
              matches: [],
            } as any;
          }
          const field = sk.replace('suggest_', '').replace('_suggest', '');
          found[id].matches.push({ field, content: String(opt.text) });
        });
      }

      // Hydrate suggestion items with full _source
      if (ids.size > 0) {
        const docs = await this.openSearchService.getDocsByIds(index, Array.from(ids));
        for (const doc of docs as any[]) {
          const src = doc?._source || {};
          const item = found[String(doc?._id)];
          if (!item) continue;

          if (key === 'forumThreads') {
            item.kind = 'forum_thread';
            const summary = src?.rootPost?.content ? String(src.rootPost.content).slice(0, 120) : '';
            item.name = src?.topicTitle ? `[${src.topicTitle}] ${summary}` : (src?.name ?? summary);
            item.topicTitle = src?.topicTitle;
            item.topicSlug  = src?.topicSlug;
            item.topicUrl   = src?.topicUrl;
            item.replyCount = typeof src?.replyCount === 'number' ? src.replyCount : undefined;
            item.lastReplyAt = src?.lastReplyAt ?? undefined;

            if (typeof src?.cid === 'number') {
              (item as any).cid = src.cid;
            }
          } else {
            item.name = src?.name ?? 'unknown';
          }

          item.image = src?.image ?? '';
          item.source = src;

          // Trim matched content snippets for UX
          item.matches.forEach((m) => {
            const full = src[m.field];
            if (typeof full === 'string') m.content = truncate(full, AUTOMCOMPLETE_MAX_LENGTH);
            else if (Array.isArray(full)) m.content = truncate(full.join(', '), AUTOMCOMPLETE_MAX_LENGTH);
          });

          if (key === 'members' && typeof src?.scheduleMeetingCount === 'number') {
            item.scheduleMeetingCount = src.scheduleMeetingCount;
          }
          if (key === 'members' && typeof src?.officeHoursUrl === 'string') {
            item.officeHoursUrl = src.officeHoursUrl;
          }
          if (key === 'members' && typeof src?.availableToConnect === 'boolean') {
            item.availableToConnect = src.availableToConnect;
          }
        }
      }

      (results as any)[key] = Object.values(found);
    }

    // No combined "top" for autocomplete by default (can be added if needed)
    return results;
  }
}
