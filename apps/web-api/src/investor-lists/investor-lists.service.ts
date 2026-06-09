import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { AddListMemberDto } from './dto/membership.dto';

/** Actor identity threaded onto membership rows for provenance. */
export interface ListMembershipActor {
  uid: string | null;
  email: string | null;
}

@Injectable()
export class InvestorListsService {
  constructor(private readonly prisma: PrismaService) {}

  /** POST /v1/investor-lists/:listId/members — add an investor to a list (idempotent on the unique pair). */
  async addMember(listId: number, dto: AddListMemberDto, actor: ListMembershipActor) {
    if (!dto?.investorId || !dto.investorId.trim()) {
      throw new BadRequestException('investorId is required');
    }
    const investorId = dto.investorId.trim();

    const list = await this.prisma.investorList.findUnique({ where: { id: listId } });
    if (!list) {
      throw new NotFoundException(`Investor list not found: ${listId}`);
    }

    const record = await this.prisma.investorOutreachRecord.findUnique({ where: { investorId } });
    if (!record) {
      throw new NotFoundException(`Investor not found: ${investorId}`);
    }

    try {
      const membership = await this.prisma.investorListMembership.create({
        data: {
          listId,
          investorOutreachRecordId: record.id,
          addedByUid: actor.uid,
          addedByEmail: actor.email,
          note: dto.note ?? null,
        },
      });
      return { id: membership.id, listId, investorId };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Investor ${investorId} is already a member of list ${listId}`);
      }
      throw e;
    }
  }

  /** DELETE /v1/investor-lists/:listId/members/:investorId — remove an investor from a list. */
  async removeMember(listId: number, investorId: string) {
    const record = await this.prisma.investorOutreachRecord.findUnique({ where: { investorId } });
    if (!record) {
      throw new NotFoundException(`Investor not found: ${investorId}`);
    }

    const result = await this.prisma.investorListMembership.deleteMany({
      where: { listId, investorOutreachRecordId: record.id },
    });
    if (result.count === 0) {
      throw new NotFoundException(`Investor ${investorId} is not a member of list ${listId}`);
    }
    return { listId, investorId, removed: true };
  }
}
