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
  async create(collection: string, data: any) {
    const col = this.db.collection(collection);
    await col.insertOne(data);
  }

  async upsertByKeyValue(collection: string, key: string, value: string, data: any) {
    const col = this.db.collection(collection);
    await col.updateOne({ [key]: value }, { $set: data }, { upsert: true });
  }

  async updateDocByKeyValue(collection: string, key: string, value: string, data: any) {
    const col = this.db.collection(collection);
    await col.updateOne({ [key]: value }, { $set: data });
  }

  async getDocByKeyValue(collection: string, key: string, value: string) {
    const col = this.db.collection(collection);
    return await col.findOne({ [key]: value });
  }

  async updateById(collection: string, key: string, value: string, query: any) {
    const col = this.db.collection(collection);
    await col.updateOne({ [key]: value }, { $set: query });
  }

  async updateByKeyValue(collection: string, key: string, value: string, query: any) {
    const col = this.db.collection(collection);
    await col.updateOne({ [key]: value }, { $set: query });
  }

  async patchDocByKeyValue(collection: string, key: string, value: string, data: any) {
    const col = this.db.collection(collection);
    const existingDoc = await col.findOne({ [key]: value });

    if (!existingDoc) {
      return null;
    }

    const updateQuery: any = {};

    Object.keys(data).forEach((field: string) => {
      if (Array.isArray(existingDoc[field])) {
        updateQuery[field] = { $push: { [field]: data[field] } };
      } else {
        updateQuery[field] = { $set: { [field]: data[field] } };
      }
    });

    await col.updateOne({ [key]: value }, updateQuery);
  }

  async findByKeyValue(collection: string, key: string, value: string) {
    const col = this.db.collection(collection);
    return await col.find({ [key]: value }).sort({ createdAt: 1 }).toArray();
  }

  async findOneByKeyValue(collection: string, key: string, value: string) {
    const col = this.db.collection(collection);
    return await col.findOne({ [key]: value });
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
