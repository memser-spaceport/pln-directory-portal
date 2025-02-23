import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { HuskySqlDbService } from './husky-db.interface';
import pg from 'pg'

@Injectable()
export class PostgresSqlDb implements OnModuleDestroy, HuskySqlDbService<any> {
  private client;

  constructor() {
    const { Client } = pg
    this.client = new Client({
        connectionString: process.env.HUSKY_POSTGRES_DB
    })
    this.client.connect()
  }

  async runRawQuery(query: string): Promise<any> {
    try {
        const res = await this.client.query(query)
        return res.rows;
     } catch (err) {
        console.error(err);
        return []
     } 
  }

  // Cleanup resources
  async onModuleDestroy() {
    await this.client.end()
    console.log('MongoDB connection closed');
  }
}
