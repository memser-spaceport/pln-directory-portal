import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TeamPitchParticipantType } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';

const LIST_SELECT = Prisma.validator<Prisma.SpvSpotlightInvestorListSelect>()({
  uid: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  entries: { select: { email: true }, orderBy: { id: 'asc' } },
});

type ListRecord = Prisma.SpvSpotlightInvestorListGetPayload<{ select: typeof LIST_SELECT }>;

function toListResponse(list: ListRecord) {
  const { entries, ...rest } = list;
  return { ...rest, emails: entries.map((entry) => entry.email) };
}

function normalizeEmails(emails: string[]) {
  return [...new Set(emails.map((email) => email.trim().toLowerCase()))];
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
    const emails = await this.readInvestorEmails(spotlightUid, input.participantUids);
    const list = await this.withUniqueName(() =>
      this.prisma.spvSpotlightInvestorList.create({
        data: {
          spvSpotlightUid: spotlightUid,
          name: input.name,
          entries: { create: emails.map((email) => ({ email })) },
        },
        select: LIST_SELECT,
      })
    );
    return toListResponse(list);
  }

  async update(spotlightUid: string, listUid: string, input: { name?: string; emails?: string[] }) {
    await this.requireList(spotlightUid, listUid);
    const emails = input.emails && normalizeEmails(input.emails);
    const list = await this.withUniqueName(() =>
      this.prisma.spvSpotlightInvestorList.update({
        where: { uid: listUid },
        data: {
          name: input.name,
          entries: emails && {
            deleteMany: { email: { notIn: emails } },
            createMany: { data: emails.map((email) => ({ email })), skipDuplicates: true },
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

  private async readInvestorEmails(spotlightUid: string, participantUids: string[]) {
    const investors = await this.prisma.spvSpotlightParticipant.findMany({
      where: {
        spvSpotlightUid: spotlightUid,
        type: TeamPitchParticipantType.INVESTOR,
        uid: { in: participantUids },
      },
      select: { uid: true, member: { select: { email: true } } },
    });
    const emailByUid = new Map(investors.map((investor) => [investor.uid, investor.member.email]));
    const emails = normalizeEmails(
      participantUids.map((uid) => emailByUid.get(uid)).filter((email): email is string => !!email)
    );
    if (!emails.length) {
      throw new BadRequestException('None of the participants is an investor with an email on this SPV spotlight');
    }
    return emails;
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
