import { Injectable } from '@nestjs/common';
import { SearchResult, SearchResultSchema } from 'libs/contracts/src/schema/global-search';
import { OpenSearchService } from '../opensearch/opensearch.service';
import { truncate } from '../utils/formatters';

const MAX_SEARCH_RESULTS_PER_INDEX = 1000;
const AUTOMCOMPLETE_MAX_LENGTH = 50;

type FetchAllOptions = {
  /** If true, switches to strict (phrase) search instead of OR-like loose search */
  strict?: boolean;
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
   * Build a "strict" query:
   *  - multi_match with type 'phrase' to force exact ordered phrase within analyzed text
   *  - OR exact keyword term match (if your mapping has <field>.keyword). If keyword subfield
   *    doesn't exist, this clause simply won't match (and won't throw).
   *
   * Using bool+should allows either precise phrase or exact keyword to hit. Keyword gets higher boost.
   */
  private buildStrictQuery(fields: string[], text: string) {
    const phraseClause = {
      multi_match: {
        query: text,
        type: 'phrase', // strict ordered phrase, no slop
        fields,
        slop: 0,
        boost: 2.0,
      },
    };

    // Attempt exact string match against <field>.keyword (if present in mapping)
    const keywordClauses = fields.map((f) => ({
      term: { [`${f}.keyword`]: { value: text, boost: 5.0 } },
    }));

    return {
      query: {
        bool: {
          minimum_should_match: 1,
          should: [phraseClause, ...keywordClauses],
        },
      },
    };
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

  /**
   * Fetch results across multiple indices.
   * Default (strict=false): preserves current "loose" behavior.
   * If strict=true: uses exact-phrase semantics (match_phrase/multi_match phrase) + keyword exact match.
   */
  async fetchAllIndices(text: string, options?: FetchAllOptions): Promise<SearchResult> {
    const indices: Record<string, [string, string[]]> = {
      events: ['event', ['name', 'description', 'shortDescription', 'additionalInfo', 'location']],
      projects: ['project', ['name', 'tagline', 'description', 'readMe', 'tags']],
      teams: ['team', ['name', 'shortDescription', 'longDescription']],
      members: ['member', ['name', 'bio']],
    };

    const result: SearchResult = {
      events: [],
      projects: [],
      teams: [],
      members: [],
      top: [],
    };

    const allHits: Array<{
      uid: string;
      name: string;
      image: string;
      index: string;
      matches: Array<{ field: string; content: string }>;
      score: number;
    }> = [];

    for (const key of Object.keys(indices)) {
      const [index, fields] = indices[key];

      // Choose query body based on strict flag, then add highlight
      const queryBody = options?.strict
        ? this.buildStrictQuery(fields, text)
        : this.buildLooseQuery(fields, text);

      const body = this.withHighlight(queryBody, fields);

      const res = await this.openSearchService.searchWithLimit(index, MAX_SEARCH_RESULTS_PER_INDEX, body);

      for (const hit of res.body.hits.hits) {
        const matches = Object.entries(hit.highlight || {}).map(([field, value]: [string, any]) => ({
          field,
          content: (Array.isArray(value) ? value : [value]).join(' '),
        }));

        const item = {
          uid: hit._id,
          name: hit._source?.name ?? '',
          image: hit._source?.image ?? '',
          index: key,
          matches,
        };

        (result as any)[key].push(item);

        const rawScore = hit._score;
        const score = typeof rawScore === 'number' ? rawScore : 0;

        allHits.push({
          uid: hit._id,
          name: item.name,
          image: item.image,
          index: key,
          matches,
          score,
        });
      }
    }

    result.top = allHits
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((item) => ({
        uid: item.uid,
        name: item.name,
        image: item.image,
        index: item.index,
        matches: item.matches,
      }));

    return SearchResultSchema.parse(result);
  }

  /**
   * Autocomplete stays unchanged: uses completion suggesters.
   * NOTE: This endpoint is typically not "strict", because completion suggests benefit from prefix/partial matches.
   */
  async autocompleteSearch(text: string, size = 5): Promise<SearchResult> {
    const indices: Record<string, [string, string[]]> = {
      events: ['event', ['name_suggest', 'shortDescription_suggest', 'location_suggest']],
      projects: ['project', ['name_suggest', 'tagline_suggest', 'tags_suggest']],
      teams: ['team', ['name_suggest', 'shortDescription_suggest']],
      members: ['member', ['name_suggest']],
    };

    const results: SearchResult = {
      events: [],
      teams: [],
      projects: [],
      members: [],
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
        { uid: string; index: string; matches: Array<{ field: string; content: string }>; name?: string; image?: string }
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

            item.name = source.name ?? 'unknown';
            item.image = source.image ?? '';

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
