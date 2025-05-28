import { Injectable } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import * as AWS from 'aws-sdk';

@Injectable()
export class OpenSearchService {
  private readonly client: Client;

  constructor() {
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
}
