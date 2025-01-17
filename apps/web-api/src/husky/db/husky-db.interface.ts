export interface HuskyCacheDbService {
  set(key: string, value: any, ttl?: number): Promise<void>;
  get<T>(key: string): Promise<T | null>;
}

export interface HuskyVectorDbService<T> {
  searchEmbeddings(
    collectionName: string,
    embeddingToMatch: number[],
    limit: number,
    with_payload: boolean
  ): Promise<T[]>;
}

export interface HuskyGraphDbService<T> {
  query(cypher: string, params: any): Promise<any>;
}

export interface HuskyPersistentDbService<T> {
  create(collection: string, data: T): Promise<T>;
}
