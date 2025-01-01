import { Injectable, OnModuleDestroy } from '@nestjs/common';
import neo4j, { Driver, Session } from 'neo4j-driver';
import { HuskyGraphDbService } from './husky-db.interface';

@Injectable()
export class Neo4jGraphDbService implements OnModuleDestroy, HuskyGraphDbService<any> {
  private driver: Driver;

  constructor() {
    this.driver = neo4j.driver(
      process.env.NEO4J_URI || '',
      neo4j.auth.basic(process.env.NEO4J_USER || '', process.env.NEO4J_PASSWORD || '')
    );
  }

  async query(cypher: string, params: Record<string, any> = {}): Promise<any[]> {
    const session: Session = this.driver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((record) => record.toObject());
    } finally {
      await session.close();
    }
  }

  async onModuleDestroy() {
    await this.driver.close();
  }
}
