import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { HuskyVectorDbService } from './husky-db.interface';

@Injectable()
export class QdrantVectorDbService implements HuskyVectorDbService<any> {
  private readonly client: QdrantClient;

  constructor() {
    this.client = new QdrantClient({ url: process.env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY });
  }

  // Search for similar vectors
  async searchEmbeddings(collectionName: string, vector: number[], limit = 5, with_payload = true) {
    try {
      return await this.client.search(collectionName, {
        vector,
        limit,
        with_payload,
      });
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }
}
