import { Module, Global } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import * as AWS from 'aws-sdk';

const accessKeyId = process.env.AWS_OPENSEARCH_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_OPENSEARCH_SECRET_ACCESS_KEY;
const region = process.env.AWS_OPENSEARCH_REGION;
const openSearchEndpoint = process.env.AWS_OPENSEARCH_ENDPOINT;

if (!accessKeyId || !secretAccessKey || !region || !openSearchEndpoint) {
  throw new Error('Missing AWS credentials for OpenSearch in environment variables.');
}

const OpenSearchClientProvider = {
  provide: 'OPENSEARCH_CLIENT',
  useFactory: async () => {
    return new Client({
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
  },
};

@Global()
@Module({
  providers: [OpenSearchClientProvider],
  exports: ['OPENSEARCH_CLIENT'],
})
export class OpenSearchModule {}
