import { Injectable } from '@nestjs/common';
import { SearchResult, SearchResultItem } from 'libs/contracts/src/schema/global-search';
import { OpenSearchService } from '../opensearch/opensearch.service';
import { truncate } from '../utils/formatters';
import { SearchMetrics, classifyError } from '../metrics/search.metrics';

const MAX_SEARCH_RESULTS_PER_INDEX = 50;
const AUTOMCOMPLETE_MAX_LENGTH = 50;

type FetchAllOptions = {
  strict?: boolean;
  perIndexSize?: number; // default: MAX_SEARCH_RESULTS_PER_INDEX
  topN?: number; // default: 50 (controls result.top when no pagination)
  page?: number; // 1-based; optional combined pagination
  pageSize?: number; // optional combined pagination
};

type SourceType = 'full' | 'autocomplete' | 'posts' | 'hydrate';
const strictLabel = (v?: boolean) => String(!!v); // "true" | "false"

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
      'tags',
      'image',
      'name_suggest',
      'tagline_suggest',
      'tags_suggest',
      'shortDescription_suggest',
      'location_suggest',
      'timestamp_suggest',
    ]);

    const textFields = fields.filter((f) => !keywordOnly.has(f));
    const kwFields = fields.filter((f) => keywordOnly.has(f));
    const weightedText = textFields.map((f) => `${f}^3`);

    const bestFields = textFields.length
      ? {
          multi_match: {
            query: text,
            type: 'best_fields',
            fields: weightedText,
            operator: 'and',
            tie_breaker: 0.2,
            boost: 1.2,
          },
        }
      : undefined;

    const exactPhrase = textFields.length
      ? {
          multi_match: {
            query: text,
            type: 'phrase',
            fields: weightedText,
            slop: 0,
            boost: 3.0,
          },
        }
      : undefined;

    const phrasePrefix = textFields.length
      ? {
          multi_match: {
            query: text,
            type: 'phrase_prefix',
            fields: weightedText,
            slop: 0,
            max_expansions: 50,
            boost: 3.0,
          },
        }
      : undefined;

    const keywordClauses: any[] = [
      // exact <field>.keyword if exists
      ...fields.map((f) => ({ term: { [`${f}.keyword`]: { value: text, boost: 10.0 } } })),
      // exact on keyword-only fields
      ...kwFields.map((f) => ({ term: { [f]: { value: text, boost: 10.0 } } })),
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
    const short = new Set(['name', 'topicTitle', 'tagline', 'shortDescription', 'location']);
    const cfg: Record<string, any> = {};
    for (const f of fields) {
      cfg[f] = short.has(f)
        ? { number_of_fragments: 0 }
        : { fragment_size: 140, number_of_fragments: 1, no_match_size: 0 };
    }

    return {
      ...baseBody,
      highlight: {
        pre_tags: ['<em>'],
        post_tags: ['</em>'],
        require_field_match: false,
        encoder: 'html',
        fields: cfg,
      },
    };
  }

  /**
   * Full search across all logical sections and a combined "top".
   * Forum content is unified under `forumThreads` (sourced from OS index `forum_thread`).
   */
  async fetchAllIndices(text: string, options?: FetchAllOptions): Promise<SearchResult> {
    // Logical section -> [OpenSearch index name, field list]
    const indices: Record<string, [string, string[]]> = {
      events: ['event', ['name', 'description', 'shortDescription', 'additionalInfo', 'location']],
      projects: ['project', ['name', 'tagline', 'description', 'readMe', 'tags']],
      teams: ['team', ['name', 'shortDescription', 'longDescription']],
      members: ['member', ['name', 'bio']],

      // Unified forum threads index: each doc is a whole thread
      forumThreads: [
        'forum_thread',
        ['name', 'topicTitle', 'topicSlug', 'topicUrl', 'rootPost.content', 'replies.content', 'rootPost.author.name', 'replies.author.name'],
      ],
    };

    const perIndexSize = options?.perIndexSize ?? MAX_SEARCH_RESULTS_PER_INDEX;
    const topN = options?.topN ?? 50;
    const strict = strictLabel(options?.strict);
    const source: SourceType = 'full';

    // Overall (single user operation)
    SearchMetrics.requests.inc({ source, section: 'all', strict });
    const overallEnd = SearchMetrics.duration.startTimer({ source, section: 'all', strict });

    const result: SearchResult = {
      events: [],
      projects: [],
      teams: [],
      members: [],
      forumThreads: [],
      top: [],
    };

    const allHits: Array<SearchResultItem & { score: number }> = [];

    try {
      for (const key of Object.keys(indices)) {
        const [index, fields] = indices[key];
        const queryBody = options?.strict ? this.buildStrictQuery(fields, text) : this.buildLooseQuery(fields, text);
        const body: any = {
          ...this.withHighlight(queryBody, fields),
          sort: [{ _score: 'desc' }],
          track_total_hits: true,
        };
        // Helps highlighter prefer the same query semantics
        if (queryBody?.query) body.highlight.highlight_query = queryBody.query;

        // Per-section metrics
        SearchMetrics.requests.inc({ source, section: key, strict });
        const end = SearchMetrics.duration.startTimer({ source, section: key, strict });

        let res;
        try {
          res = await this.openSearchService.searchWithLimit(index, perIndexSize, body);
        } catch (e) {
          SearchMetrics.errors.inc({ source, section: key, strict, error_type: classifyError(e) });
          throw e;
        } finally {
          end(); // close the per-section timer regardless of success/failure
        }

        const hits = res?.body?.hits?.hits ?? [];
        if (hits.length === 0) {
          SearchMetrics.empty.inc({ source, section: key, strict });
        }

        for (const hit of hits) {
          const src = hit._source || {};
          const hl = (hit as any).highlight || {};
          const matches = Object.entries(hl).map(([field, value]: [string, any]) => ({
            field,
            content: (Array.isArray(value) ? value : [value]).join(' '),
          }));

          // Default shape for the UI
          let item: SearchResultItem = {
            uid: String(hit._id),
            name: src?.name ?? '',
            image: src?.image ?? '',
            index: key as SearchResultItem['index'],
            matches,
            source: src,
          };

          // Extra context for members
          if (key === 'members') {
            if (typeof src.scheduleMeetingCount === 'number') item.scheduleMeetingCount = src.scheduleMeetingCount;
            if (typeof src.officeHoursUrl === 'string') item.officeHoursUrl = src.officeHoursUrl;
            if (typeof src.availableToConnect === 'boolean') item.availableToConnect = src.availableToConnect;
          }

          // Forum threads: decorate title & snippet
          if (key === 'forumThreads') {
            item.kind = 'forum_thread';
            const hlTitle =
              (Array.isArray(hl['topicTitle']) && hl['topicTitle'][0]) ||
              (Array.isArray(hl['name']) && hl['name'][0]) ||
              src?.topicTitle ||
              src?.name ||
              '';
            const hlRoot = (Array.isArray(hl['rootPost.content']) && hl['rootPost.content'][0]) || '';
            const hlReply = (Array.isArray(hl['replies.content']) && hl['replies.content'][0]) || '';
            const summary = hlRoot || hlReply || (src?.rootPost?.content ? String(src.rootPost.content).slice(0, 120) : '');
            item.name = hlTitle ? `[${hlTitle}] ${summary}` : src?.name ?? summary;
            item.topicTitle = src?.topicTitle;
            item.topicSlug = src?.topicSlug;
            item.topicUrl = src?.topicUrl;
            item.replyCount = typeof src?.replyCount === 'number' ? src.replyCount : undefined;
            item.lastReplyAt = src?.lastReplyAt ?? undefined;
          }

          (result as any)[key].push(item);
          allHits.push({ ...item, score: typeof hit._score === 'number' ? hit._score : 0 });
        }
      }

      // If truly nothing was found in any section, mark overall as empty too
      if (allHits.length === 0) {
        SearchMetrics.empty.inc({ source, section: 'all', strict });
      }

      // Global ranking by score (desc)
      allHits.sort((a, b) => b.score - a.score);

      // Combined pagination (optional)
      if (options?.page && options?.pageSize) {
        const start = (options.page - 1) * options.pageSize;
        result.top = allHits.slice(start, start + options.pageSize).map(({ score, ...rest }) => rest);
      } else {
        result.top = allHits.slice(0, topN).map(({ score, ...rest }) => rest);
      }

      return result;
    } catch (e) {
      // Bubble up but record an overall error with a normalized type
      SearchMetrics.errors.inc({ source, section: 'all', strict, error_type: classifyError(e) });
      throw e;
    } finally {
      overallEnd(); // always close the top-level timer
    }
  }

  /**
   * Autocomplete using completion suggesters.
   * Forum: `forum_thread.name_suggest` is used to suggest thread titles/summaries.
   */
  async autocompleteSearch(text: string, size = 5): Promise<SearchResult> {
    const indices: Record<string, [string, string[]]> = {
      events: ['event', ['name_suggest', 'shortDescription_suggest', 'location_suggest']],
      projects: ['project', ['name_suggest', 'tagline_suggest', 'tags_suggest']],
      teams: ['team', ['name_suggest', 'shortDescription_suggest']],
      members: ['member', ['name_suggest']],

      // Forum threads suggester
      forumThreads: ['forum_thread', ['name_suggest']],
    };

    const source: SourceType = 'autocomplete';
    const strict = 'false';

    SearchMetrics.requests.inc({ source, section: 'all', strict });
    const overallEnd = SearchMetrics.duration.startTimer({ source, section: 'all', strict });

    const results: SearchResult = {
      events: [],
      teams: [],
      projects: [],
      members: [],
      forumThreads: [],
      top: [],
    };

    let totalFound = 0;

    try {
      for (const key of Object.keys(indices)) {
        const [index, fields] = indices[key];

        SearchMetrics.requests.inc({ source, section: key, strict });
        const end = SearchMetrics.duration.startTimer({ source, section: key, strict });

        const body: any = { suggest: {} };
        fields.forEach((field) => {
          body.suggest[`suggest_${field}`] = {
            prefix: text,
            completion: { field, size },
          };
        });

        let response;
        try {
          response = await this.openSearchService.searchWithLimit(index, MAX_SEARCH_RESULTS_PER_INDEX, body);
        } catch (e) {
          SearchMetrics.errors.inc({ source, section: key, strict, error_type: classifyError(e) });
          throw e;
        } finally {
          end();
        }

        const found: Record<string, SearchResultItem> = {};
        const ids = new Set<string>();

        // Collect suggestion IDs and basic match snippets
        for (const sk in response?.body?.suggest) {
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
              };
            }
            const field = sk.replace('suggest_', '').replace('_suggest', '');
            found[id].matches.push({ field, content: String(opt.text) });
          });
        }

        if (ids.size === 0) {
          SearchMetrics.empty.inc({ source, section: key, strict });
          (results as any)[key] = [];
          continue;
        }

        // Hydration phase (measured separately)
        const hydrateSource: SourceType = 'hydrate';
        SearchMetrics.requests.inc({ source: hydrateSource, section: key, strict });
        const hydrateEnd = SearchMetrics.duration.startTimer({ source: hydrateSource, section: key, strict });

        try {
          const docs = await this.openSearchService.getDocsByIds(index, Array.from(ids));
          totalFound += docs?.length ?? 0;

          for (const doc of docs as any[]) {
            const src = doc?._source || {};
            const item = found[String(doc?._id)];
            if (!item) continue;

            if (key === 'forumThreads') {
              item.kind = 'forum_thread';
              const summary = src?.rootPost?.content ? String(src.rootPost.content).slice(0, 120) : '';
              item.name = src?.topicTitle ? `[${src.topicTitle}] ${summary}` : src?.name ?? summary;
              item.topicTitle = src?.topicTitle;
              item.topicSlug = src?.topicSlug;
              item.topicUrl = src?.topicUrl;
              item.replyCount = typeof src?.replyCount === 'number' ? src.replyCount : undefined;
              item.lastReplyAt = src?.lastReplyAt ?? undefined;
            } else {
              item.name = src?.name ?? 'unknown';
            }

            item.image = src?.image ?? '';
            item.source = src;

            // Trim matched content snippets for UX
            item.matches.forEach((m) => {
              const full = (src as any)[m.field];
              if (typeof full === 'string') m.content = truncate(full, AUTOMCOMPLETE_MAX_LENGTH);
              else if (Array.isArray(full)) m.content = truncate(full.join(', '), AUTOMCOMPLETE_MAX_LENGTH);
            });

            // Extra context for members (if available)
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
        } catch (e) {
          SearchMetrics.errors.inc({ source: hydrateSource, section: key, strict, error_type: classifyError(e) });
          throw e;
        } finally {
          hydrateEnd();
        }

        (results as any)[key] = Object.values(found);
      }

      if (totalFound === 0) {
        SearchMetrics.empty.inc({ source, section: 'all', strict });
      }

      return results;
    } catch (e) {
      SearchMetrics.errors.inc({ source, section: 'all', strict, error_type: classifyError(e) });
      throw e;
    } finally {
      overallEnd();
    }
  }

  /**
   * Search forum posts only by query
   */
  async searchForumPosts(query: string, limit = 10): Promise<any[]> {
    const source: SourceType = 'posts';
    const section = 'forumThreads';
    const strict = 'false';

    SearchMetrics.requests.inc({ source, section: 'all', strict });
    const overallEnd = SearchMetrics.duration.startTimer({ source, section: 'all', strict });

    try {
      const fields = [
        'name',
        'topicTitle',
        'topicSlug',
        'topicUrl',
        'rootPost.content',
        'replies.content',
        'rootPost.author.name',
        'replies.author.name',
      ];
      const queryBody = this.buildLooseQuery(fields, query);

      // Per-section metrics
      SearchMetrics.requests.inc({ source, section, strict });
      const end = SearchMetrics.duration.startTimer({ source, section, strict });

      let res;
      try {
        res = await this.openSearchService.searchWithLimit('forum_thread', limit, {
          ...queryBody,
          sort: [{ _score: 'desc' }],
          track_total_hits: true,
        });
      } catch (e) {
        SearchMetrics.errors.inc({ source, section, strict, error_type: classifyError(e) });
        throw e;
      } finally {
        end();
      }

      const hits = res?.body?.hits?.hits ?? [];
      if (hits.length === 0) {
        SearchMetrics.empty.inc({ source, section, strict });
      }

      const mapped = hits.map((hit: any) => {
        const src = hit._source;
        return {
          tid: src.tid,
          cid: src.cid,
          topicTitle: src.topicTitle,
          topicSlug: src.topicSlug,
          topicUrl: src.topicUrl,
          forumLink: `${process.env.WEB_UI_BASE_URL}/forum/topics/${src.cid}/${src.tid}`,
          rootPost: {
            pid: src.rootPost.pid,
            uidAuthor: src.rootPost.uidAuthor,
            author: src.rootPost.author,
            content: src.rootPost.content,
            timestamp: src.rootPost.timestamp,
          },
          replies:
            src.replies?.map((reply: any) => ({
              pid: reply.pid,
              uidAuthor: reply.uidAuthor,
              author: reply.author,
              content: reply.content,
              timestamp: reply.timestamp,
            })) ?? [],
          replyCount: src.replyCount ?? 0,
          lastReplyAt: src.lastReplyAt,
          score: hit._score,
        };
      });

      return mapped;
    } catch (e) {
      SearchMetrics.errors.inc({ source, section: 'all', strict, error_type: classifyError(e) });
      throw e;
    } finally {
      overallEnd();
    }
  }
}
