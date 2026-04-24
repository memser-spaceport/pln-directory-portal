import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { MemberApprovalsService } from '../../member-approvals/member-approvals.service';

@Injectable()
export class AccessControlV2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberApprovalsService: MemberApprovalsService,
  ) {}

  async listPolicies() {
    const policies = await this.prisma.policy.findMany({
      include: {
        policyPermissions: { include: { permission: true } },
        _count: { select: { assignments: true, policyPermissions: true } },
      },
      orderBy: [{ role: 'asc' }, { group: 'asc' }, { code: 'asc' }],
    });

    return policies.map((policy) => ({
      uid: policy.uid,
      code: policy.code,
      name: policy.name,
      description: policy.description,
      role: policy.role,
      group: policy.group,
      isSystem: policy.isSystem,
      permissions: policy.policyPermissions.map((pp) => pp.permission.code).sort(),
      assignmentsCount: policy._count.assignments,
      permissionsCount: policy._count.policyPermissions,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    }));
  }

  async getPolicy(code: string) {
    const policy = await this.prisma.policy.findUnique({
      where: { code },
      include: {
        policyPermissions: { include: { permission: true } },
        assignments: {
          include: { member: { select: { uid: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!policy) throw new NotFoundException(`Policy not found: ${code}`);

    return {
      uid: policy.uid,
      code: policy.code,
      name: policy.name,
      description: policy.description,
      role: policy.role,
      group: policy.group,
      isSystem: policy.isSystem,
      permissions: policy.policyPermissions.map((pp) => ({
        uid: pp.permission.uid,
        code: pp.permission.code,
        description: pp.permission.description,
      })),
      assignments: policy.assignments.map((assignment) => ({
        uid: assignment.uid,
        memberUid: assignment.memberUid,
        assignedByUid: assignment.assignedByUid,
        createdAt: assignment.createdAt,
        member: assignment.member,
      })),
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }

  async createPolicy(body: {
    code: string;
    name: string;
    description?: string | null;
    role: string;
    group: string;
    isSystem?: boolean;
    permissionCodes?: string[];
  }) {
    const existing = await this.prisma.policy.findUnique({
      where: { code: body.code },
      select: { uid: true, code: true },
    });

    if (existing) {
      throw new ConflictException(`Policy already exists: ${body.code}`);
    }

    let created;
    try {
      created = await this.prisma.policy.create({
        data: {
          code: body.code,
          name: body.name,
          description: body.description ?? null,
          role: body.role,
          group: body.group,
          isSystem: body.isSystem ?? false,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(`Policy already exists: ${body.code}`);
      }
      throw error;
    }

    if (body.permissionCodes?.length) {
      for (const permissionCode of Array.from(new Set(body.permissionCodes))) {
        await this.addPermissionToPolicy(created.code, permissionCode);
      }
    }

    return this.getPolicy(created.code);
  }

  async updatePolicy(
    code: string,
    body: { name?: string; description?: string | null; role?: string; group?: string; isSystem?: boolean },
  ) {
    await this.ensurePolicy(code);

    await this.prisma.policy.update({
      where: { code },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.group !== undefined ? { group: body.group } : {}),
        ...(body.isSystem !== undefined ? { isSystem: body.isSystem } : {}),
      },
    });

    return this.getPolicy(code);
  }

  async deletePolicy(code: string) {
    const policy = await this.ensurePolicy(code);
    await this.prisma.policy.delete({ where: { uid: policy.uid } });
    return { ok: true };
  }

  async addPermissionToPolicy(policyCode: string, permissionCode: string) {
    const policy = await this.ensurePolicy(policyCode);
    const permission = await this.ensurePermission(permissionCode);

    await this.prisma.policyPermission.upsert({
      where: {
        policyUid_permissionUid: {
          policyUid: policy.uid,
          permissionUid: permission.uid,
        },
      },
      update: {},
      create: {
        policyUid: policy.uid,
        permissionUid: permission.uid,
      },
    });

    return this.getPolicy(policyCode);
  }

  async removePermissionFromPolicy(policyCode: string, permissionCode: string) {
    const policy = await this.ensurePolicy(policyCode);
    const permission = await this.ensurePermission(permissionCode);

    const existing = await this.prisma.policyPermission.findUnique({
      where: {
        policyUid_permissionUid: {
          policyUid: policy.uid,
          permissionUid: permission.uid,
        },
      },
    });

    if (!existing) {
      return { removed: false };
    }

    await this.prisma.policyPermission.delete({
      where: {
        policyUid_permissionUid: {
          policyUid: policy.uid,
          permissionUid: permission.uid,
        },
      },
    });

    return { removed: true };
  }

  async assignPolicy(memberUid: string, policyCode: string, assignedByUid?: string) {
    await this.memberApprovalsService.assertApproved(memberUid);
    const member = await this.ensureMember(memberUid);
    const policy = await this.ensurePolicy(policyCode);
    if (assignedByUid) await this.ensureMember(assignedByUid);

    const assignment = await this.prisma.policyAssignment.upsert({
      where: {
        memberUid_policyUid: {
          memberUid: member.uid,
          policyUid: policy.uid,
        },
      },
      update: {
        assignedByUid: assignedByUid ?? null,
      },
      create: {
        memberUid: member.uid,
        policyUid: policy.uid,
        assignedByUid: assignedByUid ?? null,
      },
      include: {
        policy: true,
      },
    });

    return {
      uid: assignment.uid,
      memberUid: assignment.memberUid,
      policyUid: assignment.policyUid,
      assignedByUid: assignment.assignedByUid,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      policy: assignment.policy
        ? {
            uid: assignment.policy.uid,
            code: assignment.policy.code,
            name: assignment.policy.name,
            description: assignment.policy.description,
            role: assignment.policy.role ?? null,
            group: assignment.policy.group ?? null,
            isSystem: assignment.policy.isSystem,
          }
        : null,
    };
  }

  async revokePolicy(memberUid: string, policyCode: string) {
    const member = await this.ensureMember(memberUid);
    const policy = await this.ensurePolicy(policyCode);

    await this.prisma.policyAssignment.delete({
      where: {
        memberUid_policyUid: {
          memberUid: member.uid,
          policyUid: policy.uid,
        },
      },
    });

    return { ok: true };
  }

  async grantDirectPermission(memberUid: string, permissionCode: string, grantedByUid?: string, reason?: string) {
    await this.memberApprovalsService.assertApproved(memberUid);
    const member = await this.ensureMember(memberUid);
    const permission = await this.ensurePermission(permissionCode);
    if (grantedByUid) await this.ensureMember(grantedByUid);

    return this.prisma.memberPermissionV2.upsert({
      where: {
        memberUid_permissionUid: {
          memberUid: member.uid,
          permissionUid: permission.uid,
        },
      },
      update: {
        grantedByUid: grantedByUid ?? null,
        reason: reason ?? null,
      },
      create: {
        memberUid: member.uid,
        permissionUid: permission.uid,
        grantedByUid: grantedByUid ?? null,
        reason: reason ?? null,
      },
      include: {
        permission: true,
      },
    });
  }

  async revokeDirectPermission(memberUid: string, permissionCode: string) {
    const member = await this.ensureMember(memberUid);
    const permission = await this.ensurePermission(permissionCode);

    const existing = await this.prisma.memberPermissionV2.findUnique({
      where: {
        memberUid_permissionUid: {
          memberUid: member.uid,
          permissionUid: permission.uid,
        },
      },
    });

    if (!existing) {
      return { ok: true, removed: false };
    }

    await this.prisma.memberPermissionV2.delete({
      where: {
        memberUid_permissionUid: {
          memberUid: member.uid,
          permissionUid: permission.uid,
        },
      },
    });

    return { ok: true, removed: true };
  }

  async getMemberAccessByEmail(emailOrUid: string) {
    const member =
      (await this.prisma.member.findUnique({
        where: { email: emailOrUid },
        select: { uid: true },
      })) ||
      (await this.prisma.member.findUnique({
        where: { uid: emailOrUid },
        select: { uid: true },
      }));

    if (!member) throw new NotFoundException(`Member not found for email or uid: ${emailOrUid}`);
    return this.getMemberAccess(member.uid);
  }

  async getMemberAccess(memberUid: string) {
    const member = await this.ensureMember(memberUid);

    const assignments = await this.prisma.policyAssignment.findMany({
      where: { memberUid: member.uid },
      include: {
        policy: {
          include: {
            policyPermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const directPermissionRows = await this.prisma.memberPermissionV2.findMany({
      where: { memberUid: member.uid },
      include: {
        permission: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const policies = assignments.map((assignment) => ({
      uid: assignment.uid,
      code: assignment.policy.code,
      name: assignment.policy.name,
      role: assignment.policy.role,
      group: assignment.policy.group,
      permissions: assignment.policy.policyPermissions.map((pp) => pp.permission.code),
    }));

    const directPermissions = directPermissionRows.map((row) => row.permission.code);

    const effectivePermissions = Array.from(
      new Set([
        ...policies.flatMap((policy) => policy.permissions),
        ...directPermissions,
      ])
    ).sort();

    return {
      memberUid: member.uid,
      policies,
      directPermissions,
      effectivePermissions,
    };
  }

  async hasPermissionByEmail(emailOrUid: string, permissionCode: string) {
    const member =
      (await this.prisma.member.findUnique({
        where: { email: emailOrUid },
        select: { uid: true },
      })) ||
      (await this.prisma.member.findUnique({
        where: { uid: emailOrUid },
        select: { uid: true },
      }));

    if (!member) throw new NotFoundException(`Member not found for email or uid: ${emailOrUid}`);
    return this.hasPermission(member.uid, permissionCode);
  }

  async hasPermission(memberUid: string, permissionCode: string) {
    const access = await this.getMemberAccess(memberUid);

    return {
      memberUid: access.memberUid,
      permissionCode,
      allowed: access.effectivePermissions.includes(permissionCode),
    };
  }

  private async ensurePolicy(code: string) {
    const policy = await this.prisma.policy.findUnique({ where: { code } });
    if (!policy) throw new NotFoundException(`Policy not found: ${code}`);
    return policy;
  }

  private async ensurePermission(code: string) {
    const permission = await this.prisma.permission.findUnique({ where: { code } });
    if (!permission) throw new NotFoundException(`Permission not found: ${code}`);
    return permission;
  }

  private async ensureMember(uid: string) {
    const member = await this.prisma.member.findUnique({ where: { uid } });
    if (!member) throw new NotFoundException(`Member not found: ${uid}`);
    return member;
  }
}
