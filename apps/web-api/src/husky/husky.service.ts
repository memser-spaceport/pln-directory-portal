import { Injectable, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';

@Injectable()
export class HuskyService {
  constructor(
    private logger: LogService,
    private prisma: PrismaService,
    private huskyPersistentDbService: MongoPersistantDbService
  ) {}

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
}
