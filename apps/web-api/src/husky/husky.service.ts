import { Injectable, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { openai } from '@ai-sdk/openai';
import { embed, generateText, streamObject } from 'ai';
import { Response } from 'express';
import { HuskyResponseSchema } from 'libs/contracts/src/schema/husky-chat';
import { QdrantVectorDbService } from './db/qdrant-vector-db.service';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { Neo4jGraphDbService } from './db/neo4j-graph-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { HUSKY_ACTION_TYPES, HUSKY_NO_INFO_PROMPT, HUSKY_SOURCES } from '../utils/constants';
import { AwsService } from '../utils/aws/aws.service';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { S3 } from 'aws-sdk';
@Injectable()
export class HuskyService {
  constructor(
    private logger: LogService,
    private prisma: PrismaService,
    private huskyPersistentDbService: MongoPersistantDbService,
    private awsService: AwsService,
    @InjectQueue('document-processing') private documentQueue: Queue
  ){}

  async fetchDiscoverQuestions(query: Prisma.DiscoveryQuestionFindManyArgs) {
    try {
      query.include = {
        ...query.include,
        team: {
          select: {
            uid: true,
            logo: true,
            name: true,
          },
        },
        project: {
          select: {
            uid: true,
            logo: true,
            name: true,
          },
        },
        plevent: {
          select: {
            uid: true,
            name: true,
            logo: true,
          },
        },
      };
      return await this.prisma.discoveryQuestion.findMany(query);
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async fetchDiscoverQuestionBySlug(slug: string) {
    try {
      return await this.prisma.discoveryQuestion.findUnique({
        where: { slug },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async createDiscoverQuestion(discoveryQuestion: Prisma.DiscoveryQuestionUncheckedCreateInput, loggedInMember) {
    try {
      return await this.prisma.discoveryQuestion.create({
        data: {
          ...{
            createdBy: loggedInMember.uid,
            modifiedBy: loggedInMember.uid,
            slug: Math.random().toString(36).substring(2, 8),
          },
          ...discoveryQuestion,
        },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async updateDiscoveryQuestionBySlug(
    slug: string,
    discoveryQuestion: Prisma.DiscoveryQuestionUncheckedCreateInput,
    loggedInMember
  ) {
    try {
      return this.prisma.discoveryQuestion.update({
        where: { slug },
        data: {
          ...{
            modifiedBy: loggedInMember.uid,
          },
          ...discoveryQuestion,
        },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async updateDiscoveryQuestionShareCount(slug: string) {
    try {
      return await this.prisma.discoveryQuestion.update({
        where: { slug },
        data: {
          shareCount: { increment: 1 },
        },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async updateDiscoveryQuestionViewCount(slug: string) {
    try {
      return await this.prisma.discoveryQuestion.update({
        where: { slug },
        data: {
          viewCount: { increment: 1 },
        },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async addHuskyFeedback(feedback: any) {
    await this.huskyPersistentDbService.create(process.env.MONGO_FEEDBACK_COLLECTION || '', {
      ...feedback,
      createdAt: Date.now(),
    });
  }

  private handleErrors(error, message?) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          throw new ConflictException('Unique key constraint error on discovery question:', error.message);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on discovery question', error.message);
        case 'P2025':
          throw new NotFoundException('Discovery question is not found with slug:' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database field validation error on discovery question', error.message);
    }
    throw error;
  }

  async uploadToS3(file: any, bucketName: string, docName: string) {
    return await this.awsService.uploadFileToS3(file, process.env.AWS_S3_BUCKET_NAME, docName);
  }

  async queueDocumentProcessing(data: { s3Url: string; originalName: string; mimeType: string }) {
    return await this.documentQueue.add('process-document', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
  }
}
