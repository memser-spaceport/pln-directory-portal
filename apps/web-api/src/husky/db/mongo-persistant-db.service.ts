import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { MongoClient, Db } from 'mongodb';
import { HuskyPersistentDbService } from './husky-db.interface';

@Injectable()
export class MongoPersistantDbService implements OnModuleDestroy, HuskyPersistentDbService<any> {
  private client: MongoClient;
  private db: Db;

  constructor() {
    this.client = new MongoClient(process.env.MONGO_URI || '');
    this.db = this.client.db(process.env.MONGO_DB_NAME);
  }

  // Example: Store a chat message
  async create(collection: string, message: any) {
    const col = this.db.collection(collection);
    await col.insertOne(message);
  }

  // Cleanup resources
  async onModuleDestroy() {
    await this.client.close();
    console.log('MongoDB connection closed');
  }
}
