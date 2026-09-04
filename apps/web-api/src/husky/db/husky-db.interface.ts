export interface HuskyCacheDbService {
  set(key: string, value: any, ttl?: number): Promise<void>;
  get<T>(key: string): Promise<T | null>;
}

export interface HuskyGraphDbService<T> {
  query(cypher: string, params: any): Promise<any>;
}

export interface HuskyPersistentDbService<T> {
  create(collection: string, data: T): Promise<T>;
}

export interface HuskySqlDbService<T> {
  runRawQuery(query: string): Promise<any>;
}
