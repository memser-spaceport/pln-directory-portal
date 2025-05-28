import { Injectable } from '@nestjs/common';
import { SearchResult, SearchResultSchema } from 'libs/contracts/src/schema/global-search';
import { OpenSearchService } from '../opensearch/opensearch.service';

type IndexFieldMap = {
  [key: string]: [string, string[]];
};

const MAX_SEARCH_RESULTS_PER_INDEX = 10;

@Injectable()
export class SearchService {
  constructor(private readonly openSearchService: OpenSearchService) {}

  async fetchAllIndices(text: string): Promise<SearchResult> {
    const indices: IndexFieldMap = {
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
      index: keyof SearchResult;
      uid: string;
      name: string;
      matches: Array<{ field: string; content: string }>;
      score: number;
    }> = [];

    for (const key of Object.keys(result) as Array<keyof SearchResult>) {
      if (key == 'top') {
        continue;
      }

      const [index, fields] = indices[key];

      const res = await this.openSearchService.searchWithLimit(index, MAX_SEARCH_RESULTS_PER_INDEX, {
        query: {
          multi_match: {
            query: text,
            fields,
            type: 'best_fields',
          },
        },
        highlight: {
          fields: fields.reduce<Record<string, Record<string, never>>>((acc, f) => {
            acc[f] = {};
            return acc;
          }, {}),
        },
      });

      const formattedHits = res.body.hits.hits.map((hit) => {
        const matches = Object.entries(hit.highlight || {}).map(([field, value]) => ({
          field,
          content: value.join(' '),
        }));

        const item = {
          uid: hit._id,
          name: hit._source?.name ?? '',
          index: key,
          matches,
        };

        // Add to grouped results
        result[key].push(item);

        const rawScore = hit._score;
        const score = typeof rawScore === 'number' ? rawScore : 0;

        // Track for "top" scoring results
        allHits.push({
          uid: hit._id,
          name: item.name,
          index: key,
          matches,
          score,
        });

        return item;
      });
    }

    result.top = allHits
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ index, uid, name, matches }) => ({
        index,
        uid,
        name,
        matches,
      }));

    return result;
  }

  async autocompleteSearch(text: string, size = 5): Promise<SearchResult> {
    const indices = ['member', 'team', 'project', 'event'] as const;
    type IndexType = typeof indices[number];

    const results: SearchResult = {
      events: [],
      teams: [],
      projects: [],
      members: [],
      top: [],
    };

    const indexToResultKey: Record<IndexType, keyof SearchResult> = {
      member: 'members',
      team: 'teams',
      project: 'projects',
      event: 'events',
    };

    const suggestFields: Record<IndexType, string[]> = {
      member: ['name_suggest'],
      team: ['name_suggest', 'shortDescription_suggest'],
      project: ['name_suggest', 'tagline_suggest', 'tags_suggest'],
      event: ['name_suggest', 'shortDescription_suggest', 'location_suggest'],
    };

    for (const index of indices) {
      const body: Record<string, any> = { suggest: {} };

      suggestFields[index].forEach((field) => {
        body.suggest[`suggest_${field}`] = {
          prefix: text,
          completion: {
            field,
            size,
          },
        };
      });

      const response = await this.openSearchService.searchWithLimit(index, MAX_SEARCH_RESULTS_PER_INDEX, body);

      const groupedById: Record<
        string,
        { uid: string; name: string; index: string; matches: { field: string; content: string }[] }
      > = {};

      for (const key in response.body.suggest) {
        const suggestions = response.body.suggest[key];
        if (!Array.isArray(suggestions)) continue;

        const firstEntry = suggestions[0];
        if (!firstEntry || !Array.isArray(firstEntry.options)) continue;

        firstEntry.options.forEach((opt) => {
          const uid = opt._id;
          const field = key.replace('suggest_', '').replace('_suggest', '');
          const name = opt._source?.name ?? opt.text ?? 'unknown';

          if (!groupedById[uid]) {
            groupedById[uid] = {
              uid: uid,
              name,
              index: indexToResultKey[opt._index],
              matches: [],
            };
          }

          groupedById[uid].matches.push({
            field,
            content: opt.text,
          });
        });
      }

      results[indexToResultKey[index]] = Object.values(groupedById);
    }

    return SearchResultSchema.parse(results);
  }
}
