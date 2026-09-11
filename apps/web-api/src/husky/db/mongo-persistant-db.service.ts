import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MongoClient, Db, Collection } from 'mongodb';
import { HuskyPersistentDbService } from './husky-db.interface';

@Injectable()
export class MongoPersistantDbService implements OnModuleInit, OnModuleDestroy, HuskyPersistentDbService<any> {
  private readonly logger = new Logger(MongoPersistantDbService.name);
  private client: MongoClient;
  private db: Db;

  constructor() {
    this.client = new MongoClient(process.env.MONGO_URI || '');
    this.db = this.client.db(process.env.MONGO_DB_NAME);
  }

  async onModuleInit() {
    try {
      await this.client.connect();
    } catch (error) {
      // Do not fail app startup because of Mongo; operations reconnect lazily via getCollection().
      this.logger.error(`Initial MongoDB connection failed: ${error?.message}`);
    }
  }

  /**
   * Returns a collection handle on a live connection.
   *
   * The driver auto-connects on the first operation, but if that first connection attempt fails
   * the client keeps a permanently closed topology and every later operation throws
   * "Topology is closed" until the process restarts. `connect()` is a no-op when already connected,
   * dedupes concurrent calls, and rebuilds the topology when it is closed, so calling it before
   * every operation makes the service recover from a failed initial connection.
   */
  private async getCollection(collection: string): Promise<Collection> {
    await this.client.connect();
    return this.db.collection(collection);
  }

  // Example: Store a chat message
  async create(collection: string, data: any) {
    const col = await this.getCollection(collection);
    await col.insertOne(data);
  }

  async deleteDocByKeyValue(collection: string, key: string, value: string) {
    const col = await this.getCollection(collection);
    await col.updateOne({ [key]: value }, { $set: { isDeleted: true } });
  }

  async upsertByKeyValue(collection: string, key: string, value: string, data: any) {
    const col = await this.getCollection(collection);
    await col.updateOne({ [key]: value }, { $set: data }, { upsert: true });
  }

  async updateDocByKeyValue(collection: string, key: string, value: string, data: any) {
    const col = await this.getCollection(collection);
    await col.updateOne({ [key]: value }, { $set: data });
  }

  async getDocByKeyValue(collection: string, key: string, value: string) {
    const col = await this.getCollection(collection);
    return await col.findOne({ [key]: value });
  }

  async updateById(collection: string, key: string, value: string, query: any) {
    const col = await this.getCollection(collection);
    await col.updateOne({ [key]: value }, { $set: query });
  }

  async updateByKeyValue(collection: string, key: string, value: string, query: any) {
    const col = await this.getCollection(collection);
    await col.updateOne({ [key]: value }, { $set: query });
  }

  async patchDocByKeyValue(collection: string, key: string, value: string, data: any) {
    const col = await this.getCollection(collection);
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
    const col = await this.getCollection(collection);
    return await col
      .find({ [key]: value, isDeleted: { $ne: true } })
      .sort({ createdAt: 1 })
      .toArray();
  }

  async findOneByKeyValue(collection: string, key: string, value: string) {
    const col = await this.getCollection(collection);
    return await col.findOne({ [key]: value });
  }

  async findOneById(collection: string, key: string, value: string, type?: string) {
    const col = await this.getCollection(collection);
    const query: any = { [key]: value };
    if (type) {
      query.type = type;
    }
    return await col.findOne(query);
  }

  // Cleanup resources
  async onModuleDestroy() {
    await this.client.close();
    this.logger.log('MongoDB connection closed');
  }
}
