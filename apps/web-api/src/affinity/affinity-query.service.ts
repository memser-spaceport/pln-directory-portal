import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { toMemberAffinityResponse } from './affinity.mapper';

const companyInclude = {
  listMemberships: true,
  team: { select: { uid: true, name: true, website: true } },
} as const;

@Injectable()
export class AffinityQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async getByMemberUid(memberUid: string) {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      select: { uid: true },
    });
    if (!member) {
      throw new NotFoundException(`Member not found: ${memberUid}`);
    }

    const person = await this.prisma.affinityPerson.findFirst({
      where: { memberUid },
      include: {
        listMemberships: { orderBy: { listName: 'asc' } },
        primaryCompany: { include: companyInclude },
        organizations: {
          include: { company: { include: companyInclude } },
          orderBy: [{ isCurrent: 'desc' }, { updatedAt: 'desc' }],
        },
      },
    });

    if (!person) {
      throw new NotFoundException(`No Affinity profile linked to member: ${memberUid}`);
    }

    return toMemberAffinityResponse(memberUid, person);
  }
}
