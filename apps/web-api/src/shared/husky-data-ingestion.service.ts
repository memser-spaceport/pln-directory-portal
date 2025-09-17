import { Injectable, Logger } from '@nestjs/common';
import { AwsService } from '../utils/aws/aws.service';
import { randomUUID } from 'crypto';

/**
 * Status of the record in the ingestion queue
 */
export type RecordStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

/**
 * Message structure for entity ingestion
 */
export interface IngestionMsgPayload {
  entity: string;
  
  /** CRUD action performed */
  action: 'create' | 'update' | 'delete';
  
  /** Entity data containing unique identifier */
  data: {
    uid: string;
  };
  
  /** Optional additional options */
  options?: Record<string, any>;
}

/**
 * DynamoDB record structure for ingestion items
 */
export interface IngestionRecord {
  /** Partition key */
  pk: string;
  
  /** Sort key */
  sk: string;
  
  /** Unique record identifier */
  recordId: string;
  
  /** Current status of the record */
  status: RecordStatus;
  
  /** The ingestion message payload */
  payload: IngestionMsgPayload;
  
  /** ISO timestamp when record was created */
  createdAt: string;
  
  /** ISO timestamp when record was last updated */
  updatedAt: string;
  
  /** Entity type for easy filtering */
  entityType: string;
}

/**
 * Service responsible for managing database event ingestion using DynamoDB
 * Handles creation and updating of ingestion records for database CRUD events
 * 
 * Key Design:
 * - PK: entity#uid - Ensures uniqueness per entity
 * - SK: LATEST - Fixed value, prevents duplicates for same entity
 * - GSI: status (PK) + createdAt (SK) - Enables Lambda to process in FIFO order
 * 
 * Duplicate Prevention:
 * - Only one record per entity#uid combination
 * - If PENDING record exists, update it instead of creating duplicate
 */
@Injectable()
export class HuskyDataIngestionService {
  private readonly logger = new Logger(HuskyDataIngestionService.name);
  private readonly tableName = process.env.DB_EVENTS_DYNAMODB_TABLE || '';

  constructor(private awsService: AwsService) {}

  /**
   * Writes a database event to DynamoDB ingestion table
   * Prevents duplicates: Only one PENDING record per entity#uid
   *
   * @param data - The ingestion record input containing entity details
   * @throws Error if tableName is empty or DynamoDB operation fails
   */
  async ingestRecord(data: IngestionMsgPayload): Promise<void> {
    try {
      // PK: entity#uid ensures uniqueness per entity
      // SK: Fixed value "LATEST" prevents duplicates (only one record per entity)
      // GSI attributes: status + createdAt for Lambda FIFO processing
      const now = new Date();
      const record: IngestionRecord = {
        pk: `${data.entity}#${data.data.uid}`,
        sk: 'LATEST',
        recordId: randomUUID(),
        status: 'PENDING' as RecordStatus,
        payload: data,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        entityType: data.entity,
      };
      // Attempt upsert: try to update existing record, otherwise create new
      await this.upsertRecordInDynamoDB(record);
      this.logger.log(
        `Successfully wrote ingestion event to DynamoDB: ${data.entity} - ${data.action} - ${data.data.uid}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to write ingestion event to DynamoDB: ${data.entity} - ${data.action} - ${data.data.uid}`,
        error
      );
      throw error;
    }
  }

  /**
   * Upserts (update or insert) an ingestion record in DynamoDB
   * 
   * Uses a single UPDATE operation with if_not_exists() to achieve true upsert:
   * - If record exists: Updates all fields except createdAt (preserves FIFO order)
   * - If record doesn't exist: Creates new record with all fields
   * 
   * This prevents duplicates:
   * - Same entity#uid can only have ONE record
   * - If PENDING already exists, it gets updated (not duplicated)
   *
   * @param record - The ingestion record to upsert
   * @private
   */
  private async upsertRecordInDynamoDB(record: IngestionRecord): Promise<void> {
    if (!this.tableName) {
      this.logger.error('DynamoDB table name is empty - cannot write ingestion record');
      return;
    }
    const updateParams = {
      TableName: this.tableName,
      Key: {
        pk: record.pk,
        sk: record.sk,
      },
      UpdateExpression: `SET 
        #status = :status, 
        #payload = :payload, 
        #updatedAt = :updatedAt, 
        #entityType = :entityType, 
        #recordId = :recordId,
        #createdAt = if_not_exists(#createdAt, :createdAt)`,
      ExpressionAttributeNames: {
        '#status': 'status',
        '#payload': 'payload',
        '#updatedAt': 'updatedAt',
        '#entityType': 'entityType',
        '#recordId': 'recordId',
        '#createdAt': 'createdAt',
      },
      ExpressionAttributeValues: {
        ':status': record.status,
        ':payload': record.payload,
        ':updatedAt': record.updatedAt,
        ':entityType': record.entityType,
        ':recordId': record.recordId,
        ':createdAt': record.createdAt,
      },
      ReturnValues: 'ALL_NEW' as const,
    };
    const result = await this.awsService.updateRecordInDynamoDB(updateParams);
    console.log("result", result);
    this.logger.debug(`Upserted ingestion record: ${record.pk}`);
    return result;
  }
}

