import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TeamPitchParticipantType } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';

const LIST_SELECT = Prisma.validator<Prisma.SpvSpotlightInvestorListSelect>()({
  uid: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  participants: {
    select: { participantUid: true, participant: { select: { member: { select: { email: true } } } } },
    orderBy: { id: 'asc' },
  },
});

type ListRecord = Prisma.SpvSpotlightInvestorListGetPayload<{ select: typeof LIST_SELECT }>;

function toListResponse(list: ListRecord) {
  const { participants, ...rest } = list;
  return {
    ...rest,
    participants: participants.map(({ participantUid, participant }) => ({
      uid: participantUid,
      email: participant.member.email,
    })),
  };
}

@Injectable()
export class SpvSpotlightInvestorListsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(spotlightUid: string) {
    await this.requireSpotlight(spotlightUid);
    const lists = await this.prisma.spvSpotlightInvestorList.findMany({
      where: { spvSpotlightUid: spotlightUid },
      orderBy: { createdAt: 'asc' },
      select: LIST_SELECT,
    });
    return lists.map(toListResponse);
  }

  async create(spotlightUid: string, input: { name: string; participantUids: string[] }) {
    await this.requireSpotlight(spotlightUid);
    const participantUids = await this.requireInvestors(spotlightUid, input.participantUids);
    const list = await this.withUniqueName(() =>
      this.prisma.spvSpotlightInvestorList.create({
        data: {
          spvSpotlightUid: spotlightUid,
          name: input.name,
          participants: { create: participantUids.map((participantUid) => ({ participantUid })) },
        },
        select: LIST_SELECT,
      })
    );
    return toListResponse(list);
  }

  async update(spotlightUid: string, listUid: string, input: { name?: string; participantUids?: string[] }) {
    await this.requireList(spotlightUid, listUid);
    const participantUids = input.participantUids && (await this.requireInvestors(spotlightUid, input.participantUids));
    const list = await this.withUniqueName(() =>
      this.prisma.spvSpotlightInvestorList.update({
        where: { uid: listUid },
        data: {
          name: input.name,
          participants: participantUids && {
            deleteMany: { participantUid: { notIn: participantUids } },
            createMany: {
              data: participantUids.map((participantUid) => ({ participantUid })),
              skipDuplicates: true,
            },
          },
        },
        select: LIST_SELECT,
      })
    );
    return toListResponse(list);
  }

  async delete(spotlightUid: string, listUid: string) {
    const { count } = await this.prisma.spvSpotlightInvestorList.deleteMany({
      where: { uid: listUid, spvSpotlightUid: spotlightUid },
    });
    if (!count) {
      throw new NotFoundException('Investor list not found');
    }
    return { success: true };
  }

  private async requireSpotlight(uid: string) {
    const spotlight = await this.prisma.spvSpotlight.findUnique({ where: { uid }, select: { uid: true } });
    if (!spotlight) {
      throw new NotFoundException('SPV spotlight not found');
    }
  }

  private async requireList(spotlightUid: string, listUid: string) {
    const list = await this.prisma.spvSpotlightInvestorList.findFirst({
      where: { uid: listUid, spvSpotlightUid: spotlightUid },
      select: { uid: true },
    });
    if (!list) {
      throw new NotFoundException('Investor list not found');
    }
  }

  private async requireInvestors(spotlightUid: string, uids: string[]) {
    const participantUids = [...new Set(uids)];
    const investorCount = await this.prisma.spvSpotlightParticipant.count({
      where: {
        spvSpotlightUid: spotlightUid,
        type: TeamPitchParticipantType.INVESTOR,
        uid: { in: participantUids },
      },
    });
    if (investorCount !== participantUids.length) {
      throw new BadRequestException('Every participant must be an investor on this SPV spotlight');
    }
    return participantUids;
  }

  private async withUniqueName<T>(write: () => Promise<T>) {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An investor list with this name already exists on this SPV spotlight');
      }
      throw error;
    }
  }
}
