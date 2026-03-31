import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from "../shared/prisma.service";
import { CurrentUserAccessDto } from './rbac.types';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccessForMember(memberUid: string): Promise<CurrentUserAccessDto> {
    const [roleAssignments, directPermissions] = await Promise.all([
      this.prisma.roleAssignment.findMany({
        where: {
          memberUid,
          status: 'ACTIVE',
          revokedAt: null,
        },
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.memberPermission.findMany({
        where: {
          memberUid,
          status: 'ACTIVE',
          revokedAt: null,
        },
        include: {
          permission: true,
        },
      }),
    ]);

    const roleCodes = [...new Set(roleAssignments.map((x) => x.role.code))];

    const permissionCodes = new Set<string>();
    for (const ra of roleAssignments) {
      for (const rp of ra.role.rolePermissions) {
        permissionCodes.add(rp.permission.code);
      }
    }
    for (const mp of directPermissions) {
      permissionCodes.add(mp.permission.code);
    }

    return {
      memberUid,
      roles: roleCodes.sort(),
      permissions: [...permissionCodes].sort(),
    };
  }

  async hasRole(memberUid: string, roleCode: string): Promise<boolean> {
    const count = await this.prisma.roleAssignment.count({
      where: {
        memberUid,
        status: 'ACTIVE',
        revokedAt: null,
        role: {
          code: roleCode,
        },
      },
    });

    return count > 0;
  }

  async hasPermission(memberUid: string, permissionCode: string): Promise<boolean> {
    const [roleBasedCount, directCount] = await Promise.all([
      this.prisma.roleAssignment.count({
        where: {
          memberUid,
          status: 'ACTIVE',
          revokedAt: null,
          role: {
            rolePermissions: {
              some: {
                permission: {
                  code: permissionCode,
                },
              },
            },
          },
        },
      }),
      this.prisma.memberPermission.count({
        where: {
          memberUid,
          status: 'ACTIVE',
          revokedAt: null,
          permission: {
            code: permissionCode,
          },
        },
      }),
    ]);

    return roleBasedCount > 0 || directCount > 0;
  }

  async assertPermission(memberUid: string, permissionCode: string): Promise<void> {
    const allowed = await this.hasPermission(memberUid, permissionCode);
    if (!allowed) {
      throw new ForbiddenException(`Missing permission: ${permissionCode}`);
    }
  }

  async assignRole(memberUid: string, roleCode: string, assignedByMemberUid?: string) {
    const role = await this.prisma.role.findUnique({
      where: { code: roleCode },
    });

    if (!role) {
      throw new NotFoundException(`Role not found: ${roleCode}`);
    }

    const existing = await this.prisma.roleAssignment.findFirst({
      where: {
        memberUid,
        roleUid: role.uid,
        status: 'ACTIVE',
        revokedAt: null,
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.roleAssignment.create({
      data: {
        uid: crypto.randomUUID(),
        memberUid,
        roleUid: role.uid,
        assignedByMemberUid: assignedByMemberUid ?? null,
        status: 'ACTIVE',
      },
    });
  }

  async revokeRole(memberUid: string, roleCode: string) {
    const role = await this.prisma.role.findUnique({
      where: { code: roleCode },
    });

    if (!role) {
      throw new NotFoundException(`Role not found: ${roleCode}`);
    }

    return this.prisma.roleAssignment.updateMany({
      where: {
        memberUid,
        roleUid: role.uid,
        status: 'ACTIVE',
        revokedAt: null,
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });
  }

  async grantPermission(memberUid: string, permissionCode: string, grantedByMemberUid?: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { code: permissionCode },
    });

    if (!permission) {
      throw new NotFoundException(`Permission not found: ${permissionCode}`);
    }

    const existing = await this.prisma.memberPermission.findFirst({
      where: {
        memberUid,
        permissionUid: permission.uid,
        status: 'ACTIVE',
        revokedAt: null,
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.memberPermission.create({
      data: {
        uid: crypto.randomUUID(),
        memberUid,
        permissionUid: permission.uid,
        grantedByMemberUid: grantedByMemberUid ?? null,
        status: 'ACTIVE',
      },
    });
  }

  async revokePermission(memberUid: string, permissionCode: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { code: permissionCode },
    });

    if (!permission) {
      throw new NotFoundException(`Permission not found: ${permissionCode}`);
    }

    return this.prisma.memberPermission.updateMany({
      where: {
        memberUid,
        permissionUid: permission.uid,
        status: 'ACTIVE',
        revokedAt: null,
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });
  }

  async findMemberByEmail(email: string) {
    return this.prisma.member.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        }
      },
      select: {
        uid: true,
        email: true,
        name: true,
      },
    });
  }
}
