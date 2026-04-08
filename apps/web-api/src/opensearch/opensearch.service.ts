import { Injectable } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { MAX_SCORE_THRESHOLD } from '../utils/constants';
import * as AWS from 'aws-sdk';

@Injectable()
export class OpenSearchService {
  private readonly client: Client;

  constructor() {
    // Check if using local OpenSearch (no AWS credentials)
    const useLocal = process.env.OPENSEARCH_LOCAL === 'true';
    const localEndpoint = process.env.OPENSEARCH_LOCAL_ENDPOINT || 'http://localhost:9200';

    if (useLocal) {
      // Local OpenSearch connection (no auth)
      this.client = new Client({
        node: localEndpoint,
      });
      console.log(`OpenSearch: Connected to local instance at ${localEndpoint}`);
      return;
    }

    // AWS OpenSearch Serverless connection
    const accessKeyId = process.env.AWS_OPENSEARCH_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_OPENSEARCH_SECRET_ACCESS_KEY;
    const region = process.env.AWS_OPENSEARCH_REGION;
    const openSearchEndpoint = process.env.AWS_OPENSEARCH_ENDPOINT;

    if (!accessKeyId || !secretAccessKey || !region || !openSearchEndpoint) {
      throw new Error('Missing AWS credentials for OpenSearch in environment variables.');
    }

    this.client = new Client({
      ...AwsSigv4Signer({
        region: region,
        service: 'aoss',
        getCredentials: () =>
          Promise.resolve(
            new AWS.Credentials({
              accessKeyId: accessKeyId,
              secretAccessKey: secretAccessKey,
            })
          ),
      }),
      node: openSearchEndpoint,
    });
  }

  async search(index: string, body: any) {
    return this.client.search({ index, body });
  }

  async searchWithLimit(index: string, size: number, body: any) {
    return this.client.search({ index, size, body });
  }

  async getDocsByIds(index: string, ids: string[]) {
    const mgetResponse = await this.client.mget({
      index,
      body: { ids },
    });

    return mgetResponse.body.docs;
  }

  /**
   * Normalize OpenSearch score to 0-1 range.
   * Uses relative normalization based on max score in result set.
   * 
   * @param score - Raw OpenSearch score
   * @param maxScore - Maximum score in the result set
   * @returns Normalized score between 0 and 1
   */
  normalizeScore(score: number, maxScore: number): number {
    if (maxScore <= 0) return 0;
    const normalized = score / Math.max(maxScore, MAX_SCORE_THRESHOLD);
    return Math.min(Math.max(normalized, 0), 1);
  }

  /**
   * Escape special OpenSearch query characters to prevent query injection.
   * Characters escaped: + - = && || > < ! ( ) { } [ ] ^ " ~ * ? : \ /
   * 
   * @param query - Raw query string from user input
   * @returns Escaped query string safe for OpenSearch
   */
  escapeQuery(query: string): string {
    if (!query) return '';
    return query.replace(/[+\-=&|><!(){}[\]^"~*?:\\/]/g, '\\$&');
  }
}
