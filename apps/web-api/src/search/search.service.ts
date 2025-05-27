import { Inject, Injectable } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { SearchResult, SearchResultSchema } from 'libs/contracts/src/schema/global-search';

type IndexFieldMap = {
  [key: string]: [string, string[]];
};

const MAX_SEARCH_RESULTS_PER_INDEX = 10;

@Injectable()
export class SearchService {
  constructor(@Inject('OPENSEARCH_CLIENT') private readonly client: Client) {}

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
    };

    for (const key of Object.keys(result) as Array<keyof SearchResult>) {
      const [index, fields] = indices[key];

      const res = await this.client.search({
        index,
        size: MAX_SEARCH_RESULTS_PER_INDEX,
        body: {
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
        },
      });

      result[key] = res.body.hits.hits.map((hit) => ({
        uid: hit._id,
        name: hit._source?.name ?? '',
        matches: Object.entries(hit.highlight || {}).map(([field, value]) => ({
          field,
          content: value.join(' '),
        })),
      }));
    }

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

      const response = await this.client.search({ index, body });

      const groupedById: Record<
        string,
        { uid: string; name: string; matches: { field: string; content: string }[] }
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
