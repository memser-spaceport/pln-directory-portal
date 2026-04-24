import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class MemberApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(state?: 'PENDING' | 'APPROVED' | 'VERIFIED' | 'REJECTED') {
    return this.prisma.memberApproval.findMany({
      where: state ? { state } : {},
      include: {
        member: {
          select: {
            uid: true,
            name: true,
            email: true,
            accessLevel: true,
            role: true,
            createdAt: true,
          },
        },
        requestedBy: {
          select: { uid: true, name: true, email: true },
        },
        reviewedBy: {
          select: { uid: true, name: true, email: true },
        },
      },
      orderBy: [
        { state: 'asc' },
        { requestedAt: 'desc' },
      ],
    });
  }

  async get(memberUid: string) {
    const approval = await this.prisma.memberApproval.findUnique({
      where: { memberUid },
      include: {
        member: {
          select: {
            uid: true,
            name: true,
            email: true,
            accessLevel: true,
            role: true,
            createdAt: true,
          },
        },
        requestedBy: {
          select: { uid: true, name: true, email: true },
        },
        reviewedBy: {
          select: { uid: true, name: true, email: true },
        },
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!approval) {
      throw new NotFoundException(`Member approval not found for memberUid: ${memberUid}`);
    }

    return approval;
  }

  async create(body: {
    memberUid: string;
    requestedByUid?: string | null;
    reason?: string;
  }) {
    const member = await this.prisma.member.findUnique({
      where: { uid: body.memberUid },
      select: { uid: true },
    });

    if (!member) {
      throw new NotFoundException(`Member not found: ${body.memberUid}`);
    }

    if (body.requestedByUid) {
      const requestedBy = await this.prisma.member.findUnique({
        where: { uid: body.requestedByUid },
        select: { uid: true },
      });

      if (!requestedBy) {
        throw new NotFoundException(`RequestedBy member not found: ${body.requestedByUid}`);
      }
    }

    const existing = await this.prisma.memberApproval.findUnique({
      where: { memberUid: body.memberUid },
      select: { uid: true },
    });

    if (existing) {
      throw new ConflictException(`Approval already exists for member: ${body.memberUid}`);
    }

    const approval = await this.prisma.memberApproval.create({
      data: {
        memberUid: body.memberUid,
        requestedByUid: body.requestedByUid ?? null,
        reason: body.reason ?? null,
        state: 'PENDING',
      },
    });

    await this.prisma.memberApprovalEvent.create({
      data: {
        approvalUid: approval.uid,
        memberUid: body.memberUid,
        fromState: null,
        toState: 'PENDING',
        actorUid: body.requestedByUid ?? null,
        reason: body.reason ?? 'Approval requested',
      },
    });

    return this.get(body.memberUid);
  }

  async review(
    memberUid: string,
    body: {
      state: 'APPROVED' | 'VERIFIED' | 'REJECTED' | 'PENDING';
      reviewedByUid?: string | null;
      reason?: string;
    },
  ) {
    const approval = await this.prisma.memberApproval.findUnique({
      where: { memberUid },
    });

    if (!approval) {
      throw new NotFoundException(`Member approval not found for memberUid: ${memberUid}`);
    }

    if (body.reviewedByUid) {
      const reviewer = await this.prisma.member.findUnique({
        where: { uid: body.reviewedByUid },
        select: { uid: true },
      });

      if (!reviewer) {
        throw new NotFoundException(`Reviewer member not found: ${body.reviewedByUid}`);
      }
    }

    const updated = await this.prisma.memberApproval.update({
      where: { memberUid },
      data: {
        state: body.state,
        reviewedByUid: body.reviewedByUid ?? null,
        reviewedAt: new Date(),
        reason: body.reason ?? null,
      },
    });

    await this.prisma.memberApprovalEvent.create({
      data: {
        approvalUid: updated.uid,
        memberUid,
        fromState: approval.state,
        toState: body.state,
        actorUid: body.reviewedByUid ?? null,
        reason: body.reason ?? null,
      },
    });

    return this.get(memberUid);
  }


  async ensureApprovalExists(memberUid: string, requestedByUid?: string | null) {
    const existing = await this.prisma.memberApproval.findUnique({
      where: { memberUid },
      select: { uid: true },
    });

    if (existing) {
      return existing;
    }

    const approval = await this.prisma.memberApproval.create({
      data: {
        memberUid,
        requestedByUid: requestedByUid ?? null,
        state: 'PENDING',
        reason: 'Auto-created on member creation',
      },
    });

    await this.prisma.memberApprovalEvent.create({
      data: {
        approvalUid: approval.uid,
        memberUid,
        fromState: null,
        toState: 'PENDING',
        actorUid: requestedByUid ?? null,
        reason: 'Auto-created on member creation',
      },
    });

    return approval;
  }

  async assertApproved(memberUid: string) {
    const approval = await this.prisma.memberApproval.findUnique({
      where: { memberUid },
      select: { state: true },
    });

    if (!approval || !['APPROVED', 'VERIFIED'].includes(approval.state)) {
      throw new ForbiddenException(
        `Member ${memberUid} is not approved. Policies and direct permissions can be assigned only to APPROVED or VERIFIED members.`,
      );
    }
  }
}
