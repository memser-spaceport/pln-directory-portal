import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import {
  CreateDealRequestDto,
  ListDealRequestsQueryDto,
  UpdateDealRequestDto,
} from './deal-requests.dto';

@Injectable()
export class DealRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizePagination(page = 1, limit = 20) {
    const safePage = Number.isFinite(Number(page)) ? Math.max(1, Number(page)) : 1;
    const safeLimit = Number.isFinite(Number(limit)) ? Math.min(100, Math.max(1, Number(limit))) : 20;

    return {
      page: safePage,
      limit: safeLimit,
      skip: (safePage - 1) * safeLimit,
    };
  }

  async create(userUid: string | undefined, dealUidFromParam: string | undefined, body: CreateDealRequestDto) {
    if (!userUid) {
      throw new UnauthorizedException('User uid not found');
    }

    const resolvedDealUid = (dealUidFromParam ?? body?.dealUid)?.trim() || undefined;
    const description = body?.description?.trim();
    const whatDealAreYouLookingFor = body?.whatDealAreYouLookingFor?.trim();
    const howToReachOutToYou = body?.howToReachOutToYou?.trim();

    if (!description) {
      throw new BadRequestException('Description is required');
    }

    if (!whatDealAreYouLookingFor) {
      throw new BadRequestException('What deal are you looking for is required');
    }

    if (!howToReachOutToYou) {
      throw new BadRequestException('How to reach out to you is required');
    }

    if (resolvedDealUid) {
      const deal = await this.prisma.deal.findUnique({
        where: { uid: resolvedDealUid },
        select: { uid: true },
      });

      if (!deal) {
        throw new NotFoundException('Deal not found');
      }

      const existing = await this.prisma.dealRequest.findUnique({
        where: {
          dealUid_requestedByUserUid: {
            dealUid: resolvedDealUid,
            requestedByUserUid: userUid,
          },
        },
        select: { uid: true },
      });

      if (existing) {
        return {
          uid: existing.uid,
          dealUid: resolvedDealUid,
          requestedByUserUid: userUid,
          alreadyExists: true,
        };
      }
    }

    const created = await this.prisma.dealRequest.create({
      data: {
        ...(resolvedDealUid ? { dealUid: resolvedDealUid } : {}),
        description,
        whatDealAreYouLookingFor,
        howToReachOutToYou,
        requestedByUserUid: userUid,
      },
      select: {
        uid: true,
        dealUid: true,
        description: true,
        whatDealAreYouLookingFor: true,
        howToReachOutToYou: true,
        requestedByUserUid: true,
        requestedDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...created,
      alreadyExists: false,
    };
  }

  private buildWhere(query: ListDealRequestsQueryDto): Prisma.DealRequestWhereInput {
    return {
      ...(query?.dealUid ? { dealUid: query.dealUid } : {}),
      ...(query?.requestedByUserUid ? { requestedByUserUid: query.requestedByUserUid } : {}),
      ...(query?.search
        ? {
          OR: [
            { description: { contains: query.search, mode: 'insensitive' } },
            { whatDealAreYouLookingFor: { contains: query.search, mode: 'insensitive' } },
            { howToReachOutToYou: { contains: query.search, mode: 'insensitive' } },
            { requestedByUserUid: { contains: query.search, mode: 'insensitive' } },
            {
              requestedByUser: {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' } },
                  { email: { contains: query.search, mode: 'insensitive' } },
                ],
              },
            },
            {
              deal: {
                OR: [
                  { vendorName: { contains: query.search, mode: 'insensitive' } },
                  { shortDescription: { contains: query.search, mode: 'insensitive' } },
                ],
              },
            },
          ],
        }
        : {}),
    };
  }

  async adminList(query: ListDealRequestsQueryDto) {
    const { page, limit, skip } = this.normalizePagination(query.page, query.limit);
    const where = this.buildWhere(query);

    const [total, items] = await Promise.all([
      this.prisma.dealRequest.count({ where }),
      this.prisma.dealRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { requestedDate: 'desc' },
        select: {
          uid: true,
          dealUid: true,
          description: true,
          whatDealAreYouLookingFor: true,
          howToReachOutToYou: true,
          requestedByUserUid: true,
          requestedDate: true,
          createdAt: true,
          updatedAt: true,
          requestedByUser: {
            select: {
              uid: true,
              name: true,
              email: true,
            },
          },
          deal: {
            select: {
              uid: true,
              vendorName: true,
              shortDescription: true,
              category: true,
              audience: true,
              status: true,
            },
          },
        },
      }),
    ]);

    return { page, limit, total, items };
  }

  async adminGetByUid(uid: string) {
    const item = await this.prisma.dealRequest.findUnique({
      where: { uid },
      select: {
        uid: true,
        dealUid: true,
        description: true,
        whatDealAreYouLookingFor: true,
        howToReachOutToYou: true,
        requestedByUserUid: true,
        requestedDate: true,
        createdAt: true,
        updatedAt: true,
        requestedByUser: {
          select: {
            uid: true,
            name: true,
            email: true,
          },
        },
        deal: {
          select: {
            uid: true,
            vendorName: true,
            shortDescription: true,
            category: true,
            audience: true,
            status: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Deal request not found');
    }

    return item;
  }

  async adminUpdate(uid: string, body: UpdateDealRequestDto) {
    const data: Prisma.DealRequestUpdateInput = {};

    if (typeof body?.description === 'string') {
      const description = body.description.trim();
      if (!description) {
        throw new BadRequestException('Description cannot be empty');
      }
      data.description = description;
    }

    if (typeof body?.whatDealAreYouLookingFor === 'string') {
      const whatDealAreYouLookingFor = body.whatDealAreYouLookingFor.trim();
      if (!whatDealAreYouLookingFor) {
        throw new BadRequestException('What deal are you looking for cannot be empty');
      }
      data.whatDealAreYouLookingFor = whatDealAreYouLookingFor;
    }

    if (typeof body?.howToReachOutToYou === 'string') {
      const howToReachOutToYou = body.howToReachOutToYou.trim();
      if (!howToReachOutToYou) {
        throw new BadRequestException('How to reach out to you cannot be empty');
      }
      data.howToReachOutToYou = howToReachOutToYou;
    }

    if (!Object.keys(data).length) {
      throw new BadRequestException('No fields to update');
    }

    try {
      return await this.prisma.dealRequest.update({
        where: { uid },
        data,
        select: {
          uid: true,
          dealUid: true,
          description: true,
          whatDealAreYouLookingFor: true,
          howToReachOutToYou: true,
          requestedByUserUid: true,
          requestedDate: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new NotFoundException('Deal request not found');
      }
      throw error;
    }
  }

  async getByUidForUser(userUid: string | undefined, requestUid: string) {
    if (!userUid) {
      throw new UnauthorizedException('User uid not found');
    }

    const request = await this.prisma.dealRequest.findFirst({
      where: {
        uid: requestUid,
        requestedByUserUid: userUid,
      },
      select: {
        uid: true,
        dealUid: true,
        description: true,
        whatDealAreYouLookingFor: true,
        howToReachOutToYou: true,
        requestedByUserUid: true,
        requestedDate: true,
        createdAt: true,
        updatedAt: true,
        deal: {
          select: {
            uid: true,
            vendorName: true,
            shortDescription: true,
            category: true,
            audience: true,
            status: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Deal request not found');
    }

    return request;
  }
}
