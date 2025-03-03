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

  async updateById(collection: string, key: string, value: string, query: any) {
    const col = this.db.collection(collection);
    await col.updateOne({ [key]: value }, { $set: query });
  }

  async findAllById(collection: string, key: string, value: string, type?: string) {
    const col = this.db.collection(collection);
    const query: any = { [key]: value };
    if (type) {
      query.type = type;
    } 
    return await col.find(query).sort({ createdAt: 1 }).toArray();
  }

  async findOneById(collection: string, key: string, value: string, type?: string) {
    const col = this.db.collection(collection);
    const query: any = { [key]: value };
    if (type) {
      query.type = type;
    }
    return await col.findOne(query);
  } 

  // Cleanup resources
  async onModuleDestroy() {
    await this.client.close();
    console.log('MongoDB connection closed');
  }
}
