import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { HuskySqlDbService } from './husky-db.interface';
import { Pool, PoolClient } from 'pg';

@Injectable()
export class PostgresSqlDb implements OnModuleDestroy, HuskySqlDbService<any> {
  private pool: Pool;
  private readonly logger = new Logger(PostgresSqlDb.name);
  private isConnected = false;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  constructor() {
    this.initializePool();
    this.setupPoolErrorHandling();
  }

  private initializePool() {
    try {
      this.pool = new Pool({
        connectionString: process.env.HUSKY_POSTGRES_DB,
        max: 3, // maximum number of clients in the pool
        idleTimeoutMillis: 60000, // increased to 1 minute
        connectionTimeoutMillis: 10000, // increased to 10 seconds
        maxUses: 7500,
        keepAlive: true, // Enable keepalive
        keepAliveInitialDelayMillis: 10000, // Start keepalive after 10 seconds
        statement_timeout: 30000, // Statement timeout of 30 seconds
        query_timeout: 30000, // Query timeout of 30 seconds
        application_name: 'pln-directory-portal', // For better identification in pg_stat_activity
      });

      // Test the connection
      this.pool.connect().then((client) => {
        this.isConnected = true;
        // Set session level parameters
        return client.query(`
          SET statement_timeout = '30s';
          SET idle_in_transaction_session_timeout = '30s';
        `).finally(() => client.release());
      }).then(() => {
        this.logger.log('Successfully connected to PostgreSQL');
      }).catch((err) => {
        this.logger.error('Failed to connect to PostgreSQL:', err);
      });
    } catch (error) {
      this.logger.error('Error initializing PostgreSQL pool:', error);
      throw error;
    }
  }

  private setupPoolErrorHandling() {
    this.pool.on('error', (err, client) => {
      this.logger.error('Unexpected error on idle PostgreSQL client:', err);
      if (client) {
        client.release(true); // Release with error
      }
      // Attempt to reconnect on pool errors
      this.reconnect().catch(error => 
        this.logger.error('Failed to reconnect after pool error:', error)
      );
    });

    this.pool.on('connect', () => {
      this.isConnected = true;
      this.logger.log('New client connected to PostgreSQL pool');
    });

    this.pool.on('remove', () => {
      this.logger.log('Client removed from PostgreSQL pool');
    });
  }

  async runRawQuery(query: string, retryCount = 0): Promise<any> {
    let client: PoolClient | null = null;
    try {
      client = await this.getClientWithRetry();
      const result = await client.query(query);
      return result.rows;
    } catch (err) {
      this.logger.error('Error executing query:', err);
      
      // Handle specific error cases
      if (this.isConnectionError(err) && retryCount < this.maxRetries) {
        this.logger.warn(`Attempt ${retryCount + 1}/${this.maxRetries}: Retrying query after error...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.runRawQuery(query, retryCount + 1);
      }

      throw err; // Re-throw if max retries exceeded or different error
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  private async getClientWithRetry(attempts = 0): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch (err) {
      if (this.isConnectionError(err) && attempts < this.maxRetries) {
        this.logger.warn(`Attempt ${attempts + 1}/${this.maxRetries}: Retrying connection...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.getClientWithRetry(attempts + 1);
      }
      throw err;
    }
  }

  private isConnectionError(err: any): boolean {
    return (
      err.code === 'ECONNRESET' ||
      err.code === 'ETIMEDOUT' ||
      err.code === '57P01' || // admin shutdown
      err.code === '57P02' || // crash shutdown
      err.code === '57P03' || // cannot connect now
      err.message.includes('Connection terminated') ||
      err.message.includes('connection timeout')
    );
  }

  private async reconnect(): Promise<void> {
    this.logger.log('Attempting to reconnect to PostgreSQL...');
    try {
      await this.pool.end();
      this.initializePool();
    } catch (error) {
      this.logger.error('Failed to reconnect:', error);
      throw error;
    }
  }

  // Cleanup resources
  async onModuleDestroy() {
    try {
      await this.pool.end();
      this.isConnected = false;
      this.logger.log('PostgreSQL connection pool closed');
    } catch (error) {
      this.logger.error('Error closing PostgreSQL connection pool:', error);
      throw error;
    }
  }
}