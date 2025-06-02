import { Injectable } from '@nestjs/common';
import { SearchResult, SearchResultSchema } from 'libs/contracts/src/schema/global-search';
import { OpenSearchService } from '../opensearch/opensearch.service';
import { truncate } from '../utils/formatters';

const MAX_SEARCH_RESULTS_PER_INDEX = 10;
const AUTOMCOMPLETE_MAX_LENGTH = 50;

@Injectable()
export class SearchService {
  constructor(private readonly openSearchService: OpenSearchService) {}

  async fetchAllIndices(text: string): Promise<SearchResult> {
    const indices = {
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

      const body = {
        query: {
          multi_match: {
            query: text,
            fields,
            type: 'best_fields',
          },
        },
        highlight: {
          fields: fields.reduce((acc, f) => {
            acc[f] = {};
            return acc;
          }, {}),
        },
      };

      const res = await this.openSearchService.searchWithLimit(index, MAX_SEARCH_RESULTS_PER_INDEX, body);

      for (const hit of res.body.hits.hits) {
        const matches = Object.entries(hit.highlight || {}).map(([field, value]) => ({
          field,
          content: value.join(' '),
        }));

        const item = {
          uid: hit._id,
          name: hit._source?.name ?? '',
          image: hit._source?.image ?? '',
          index: key,
          matches,
        };

        result[key].push(item);

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

  async autocompleteSearch(text: string, size = 5): Promise<SearchResult> {
    const indices = {
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

      const body = { suggest: {} };

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

      const foundItem = {};
      const idsToFetch = new Set<string>();

      for (const key in response.body.suggest) {
        const suggestions = response.body.suggest[key];
        if (!Array.isArray(suggestions)) continue;

        const firstEntry = suggestions[0];
        if (!firstEntry || !Array.isArray(firstEntry.options)) continue;

        firstEntry.options.forEach((opt) => {
          const uid = opt._id;
          const field = key.replace('suggest_', '').replace('_suggest', '');
          const content = opt.text;

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

      results[index_key] = Object.values(foundItem);
    }

    return SearchResultSchema.parse(results);
  }
}
