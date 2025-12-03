import { Injectable } from '@nestjs/common';
import { SearchResult, SearchResultSchema } from 'libs/contracts/src/schema/global-search';
import { OpenSearchService } from '../opensearch/opensearch.service';
import { truncate } from '../utils/formatters';

const MAX_SEARCH_RESULTS_PER_INDEX = 50;
const AUTOMCOMPLETE_MAX_LENGTH = 50;

type FetchAllOptions = {
  strict?: boolean;
  perIndexSize?: number;   // default: MAX_SEARCH_RESULTS_PER_INDEX
  topN?: number;           // default: 50 (controls result.top)
  page?: number;           // 1-based; optional combined pagination
  pageSize?: number;       // optional combined pagination
};

@Injectable()
export class SearchService {
  constructor(private readonly openSearchService: OpenSearchService) {}

  /**
   * Build a "loose" query (current behavior): multi_match best_fields with analyzer.
   * This is safer and returns results if user types partial text; works like OR (by analyzer).
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
   * Strict search for all fields.
   * - Boosts every text field equally (you can tune per field).
   * - Uses best_fields (+tie_breaker), exact phrase, and phrase_prefix.
   * - Handles keyword-only fields via term/prefix; no phrase_* on keyword fields.
   */
  private buildStrictQuery(fields: string[], text: string) {
    const keywordOnly = new Set<string>([
      'tags', 'image',
      'name_suggest','tagline_suggest','tags_suggest','shortDescription_suggest','location_suggest',
    ]);

    const textFields = fields.filter(f => !keywordOnly.has(f));
    const kwFields   = fields.filter(f => keywordOnly.has(f));

    // Boost all text fields (tune here if you want per-field weights, e.g., name^4, tagline^3, etc.)
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
      // exact match on <field>.keyword if present
      ...fields.map(f => ({ term: { [`${f}.keyword`]: { value: text, boost: 10.0 } } })),
      // exact on keyword-only fields
      ...kwFields.map(f => ({ term: { [f]: { value: text, boost: 10.0 } } })),
    ];

    const terms = text.trim().split(/\s+/);
    if (terms.length === 1) {
      // single-word boost: prefix across keyword fields
      for (const f of fields) {
        keywordClauses.push({ prefix: { [`${f}.keyword`]: { value: text.toLowerCase(), boost: 4.0 } } });
      }
    }

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

  /**
   * Adds highlighter config for the provided fields.
   */
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

  async fetchAllIndices(text: string, options?: FetchAllOptions): Promise<SearchResult> {
    const indices: Record<string, [string, string[]]> = {
      events:  ['event',  ['name','description','shortDescription','additionalInfo','location']],
      projects:['project',['name','tagline','description','readMe','tags']],
      teams:   ['team',   ['name','shortDescription','longDescription']],
      members: ['member', ['name','bio']],

      // NEW: forum indices
      forumTopics: ['forum_topic', ['title','name','slug','url']],
      forumPosts:  ['forum_post',  ['content','topicTitle','name','topicSlug','url']],
    };

    const perIndexSize = options?.perIndexSize ?? MAX_SEARCH_RESULTS_PER_INDEX;
    const topN         = options?.topN ?? 50;

    // NOTE: extend SearchResult to include forumTopics/forumPosts & new item fields, or relax schema.
    const result: any = { events: [], projects: [], teams: [], members: [], forumTopics: [], forumPosts: [], top: [] };
    const allHits: Array<{
      uid: string; name: string; image: string; index: string;
      matches: Array<{ field: string; content: string }>;
      score: number;
      kind?: 'forum_topic' | 'forum_post';
      isComment?: boolean;
      source?: any;
      scheduleMeetingCount?: number;
    }> = [];

    for (const key of Object.keys(indices)) {
      const [index, fields] = indices[key];
      const queryBody = options?.strict
        ? this.buildStrictQuery(fields, text)
        : this.buildLooseQuery(fields, text);

      // Ask OS to sort by _score (explicit), track totals
      const body = {
        ...this.withHighlight(queryBody, fields),
        sort: [{ _score: 'desc' }],
        track_total_hits: true,
      };

      const res = await this.openSearchService.searchWithLimit(index, perIndexSize, body);

      for (const hit of res.body.hits.hits) {
        const src = hit._source || {};

        const matches = Object.entries(hit.highlight || {}).map(([field, value]: [string, any]) => ({
          field,
          content: (Array.isArray(value) ? value : [value]).join(' '),
        }));

        // Display name/image rules for forum docs
        let displayName = src?.name ?? '';
        let displayImage = src?.image ?? '';
        let kind: 'forum_topic' | 'forum_post' | undefined;
        let isComment: boolean | undefined;

        if (index === 'forum_topic') {
          kind = 'forum_topic';
          displayName = src?.title ?? src?.name ?? '';
        } else if (index === 'forum_post') {
          kind = 'forum_post';
          isComment = Boolean(src?.isComment);
          displayName = src?.name
            ?? (src?.topicTitle ? `[${src.topicTitle}] ${String(src?.content || '').slice(0, 120)}`
              : String(src?.content || '').slice(0, 120));
        }

        const item: any = {
          uid: hit._id,
          name: displayName,
          image: displayImage,
          index: key,
          kind,
          isComment,
          matches,
          source: src,
        };

        if (key === 'members' && typeof src.scheduleMeetingCount === 'number') {
          item.scheduleMeetingCount = src.scheduleMeetingCount;
        }

        (result as any)[key].push(item);

        allHits.push({
          ...item,
          score: typeof hit._score === 'number' ? hit._score : 0,
        });
      }
    }

    // Combined, globally sorted by _score
    allHits.sort((a, b) => b.score - a.score);

    // Optional combined pagination
    if (options?.page && options?.pageSize) {
      const start = (options.page - 1) * options.pageSize;
      const pageItems = allHits.slice(start, start + options.pageSize).map(item => ({
        uid: item.uid, name: item.name, image: item.image, index: item.index,
        kind: item.kind, isComment: item.isComment, matches: item.matches, source: item.source,
        scheduleMeetingCount: item.scheduleMeetingCount, // keep in top too
      }));
      result.top = pageItems;
    } else {
      // TopN (default 50) for the "top" section
      result.top = allHits.slice(0, topN).map(item => ({
        uid: item.uid, name: item.name, image: item.image, index: item.index,
        kind: item.kind, isComment: item.isComment, matches: item.matches, source: item.source,
        scheduleMeetingCount: item.scheduleMeetingCount,
      }));
    }

    return SearchResultSchema.parse(result);
  }

  /**
   * Autocomplete uses completion suggesters (now includes forum indices).
   */
  async autocompleteSearch(text: string, size = 5): Promise<SearchResult> {
    const indices: Record<string, [string, string[]]> = {
      events: ['event', ['name_suggest', 'shortDescription_suggest', 'location_suggest']],
      projects: ['project', ['name_suggest', 'tagline_suggest', 'tags_suggest']],
      teams: ['team', ['name_suggest', 'shortDescription_suggest']],
      members: ['member', ['name_suggest']],

      // NEW: forum suggesters (both indices have name_suggest)
      forumTopics: ['forum_topic', ['name_suggest']],
      forumPosts:  ['forum_post',  ['name_suggest']],
    };

    // NOTE: extend SearchResult to include forum* and allow source/isComment/kind if needed.
    const results: any = {
      events: [],
      teams: [],
      projects: [],
      members: [],
      forumTopics: [],
      forumPosts: [],
      top: [],
    };

    for (const index_key of Object.keys(indices)) {
      const [index, fields] = indices[index_key];

      const body: any = { suggest: {} };

      fields.forEach((field) => {
        body.suggest[`suggest_${field}`] = {
          prefix: text,
          completion: {
            field,
            size,
          },
        };
      });

      const response = await this.openSearchService.searchWithLimit(index, MAX_SEARCH_RESULTS_PER_INDEX, body);

      const foundItem: Record<
        string,
        { uid: string; index: string; matches: Array<{ field: string; content: string }>;
          name?: string; image?: string; kind?: 'forum_topic' | 'forum_post'; isComment?: boolean; source?: any;
          scheduleMeetingCount?: number;
        }
      > = {};
      const idsToFetch = new Set<string>();

      for (const key in response.body.suggest) {
        const suggestions = response.body.suggest[key];
        if (!Array.isArray(suggestions)) continue;

        const firstEntry = suggestions[0];
        if (!firstEntry || !Array.isArray(firstEntry.options)) continue;

        firstEntry.options.forEach((opt: any) => {
          const uid: string = opt._id;
          const field = key.replace('suggest_', '').replace('_suggest', '');
          const content: string = opt.text;

          idsToFetch.add(uid);

          if (!foundItem[uid]) {
            foundItem[uid] = {
              uid,
              index: index_key,
              matches: [],
              kind: index === 'forum_topic' ? 'forum_topic' : index === 'forum_post' ? 'forum_post' : undefined,
            };
          }

          foundItem[uid].matches.push({ field, content });
        });
      }

      const ids = Array.from(idsToFetch);
      if (ids.length > 0) {
        const allDocs = await this.openSearchService.getDocsByIds(index, ids);

        for (const doc of allDocs as any[]) {
          if (doc._source && foundItem[doc._id]) {
            const item = foundItem[doc._id];
            const source = doc._source;

            // name/image shaping for forum docs
            let displayName = source?.name ?? '';
            if (index === 'forum_topic') {
              displayName = source?.title ?? source?.name ?? '';
            } else if (index === 'forum_post') {
              displayName = source?.name
                ?? (source?.topicTitle ? `[${source.topicTitle}] ${String(source?.content || '').slice(0, 120)}`
                  : String(source?.content || '').slice(0, 120));
            }

            item.name = displayName || 'unknown';
            item.image = source?.image ?? '';
            item.isComment = index === 'forum_post' ? Boolean(source?.isComment) : undefined;
            item.source = source;

            if (index === 'member' && typeof source?.scheduleMeetingCount === 'number') {
              item.scheduleMeetingCount = source.scheduleMeetingCount;
            }

            item.matches.forEach((match) => {
              const fullFieldValue = source[match.field];
              if (typeof fullFieldValue === 'string') {
                match.content = truncate(fullFieldValue, AUTOMCOMPLETE_MAX_LENGTH);
              } else if (Array.isArray(fullFieldValue)) {
                match.content = truncate(fullFieldValue.join(', '), AUTOMCOMPLETE_MAX_LENGTH);
              }
            });
          }
        }
      }

      (results as any)[index_key] = Object.values(foundItem);
    }

    return SearchResultSchema.parse(results);
  }
}
