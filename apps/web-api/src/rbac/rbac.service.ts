import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from "../shared/prisma.service";
import { CurrentUserAccessDto } from './rbac.types';
import { AVAILABLE_SCOPES } from './rbac.constants';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  private validateScopes(scopes: string[]): void {
    const invalid = scopes.filter((s) => !AVAILABLE_SCOPES.includes(s as any));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid scope(s): ${invalid.join(', ')}. Allowed: ${AVAILABLE_SCOPES.join(', ')}`);
    }
  }

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

    const permissionScopesMap = new Map<string, Set<string>>();
    for (const ra of roleAssignments) {
      for (const rp of ra.role.rolePermissions) {
        const code = rp.permission.code;
        if (!permissionScopesMap.has(code)) {
          permissionScopesMap.set(code, new Set());
        }
        for (const s of rp.scopes) {
          permissionScopesMap.get(code)!.add(s);
        }
      }
    }
    for (const mp of directPermissions) {
      const code = mp.permission.code;
      if (!permissionScopesMap.has(code)) {
        permissionScopesMap.set(code, new Set());
      }
      for (const s of mp.scopes) {
        permissionScopesMap.get(code)!.add(s);
      }
    }

    const permissions = [...permissionScopesMap.entries()]
      .map(([name, scopes]) => ({ name, scopes: [...scopes].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      memberUid,
      roles: roleCodes.sort(),
      permissions,
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

  async grantPermission(memberUid: string, permissionCode: string, grantedByMemberUid?: string, scopes?: string[]) {
    if (scopes?.length) this.validateScopes(scopes);

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
        scopes: scopes ?? [],
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

  async getScopesForPermission(memberUid: string, permissionCode: string): Promise<string[]> {
    const [roleAssignments, directPermissions] = await Promise.all([
      this.prisma.roleAssignment.findMany({
        where: {
          memberUid,
          status: 'ACTIVE',
          revokedAt: null,
          role: {
            rolePermissions: {
              some: {
                permission: { code: permissionCode },
              },
            },
          },
        },
        include: {
          role: {
            include: {
              rolePermissions: {
                where: { permission: { code: permissionCode } },
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
          permission: { code: permissionCode },
        },
      }),
    ]);

    const allScopes = new Set<string>();
    for (const ra of roleAssignments) {
      for (const rp of ra.role.rolePermissions) {
        for (const s of rp.scopes) allScopes.add(s);
      }
    }
    for (const mp of directPermissions) {
      for (const s of mp.scopes) allScopes.add(s);
    }

    return [...allScopes].sort();
  }

  async updateMemberPermissionScopes(memberUid: string, permissionCode: string, scopes: string[]) {
    this.validateScopes(scopes);

    const permission = await this.prisma.permission.findUnique({
      where: { code: permissionCode },
    });

    if (!permission) {
      throw new NotFoundException(`Permission not found: ${permissionCode}`);
    }

    const result = await this.prisma.memberPermission.updateMany({
      where: {
        memberUid,
        permissionUid: permission.uid,
        status: 'ACTIVE',
        revokedAt: null,
      },
      data: { scopes },
    });

    if (result.count === 0) {
      throw new NotFoundException(`Active permission grant not found for member`);
    }

    return { updated: result.count };
  }

  async updateRolePermissionScopes(roleCode: string, permissionCode: string, scopes: string[]) {
    this.validateScopes(scopes);

    const role = await this.prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) {
      throw new NotFoundException(`Role not found: ${roleCode}`);
    }

    const permission = await this.prisma.permission.findUnique({ where: { code: permissionCode } });
    if (!permission) {
      throw new NotFoundException(`Permission not found: ${permissionCode}`);
    }

    return this.prisma.rolePermission.update({
      where: {
        roleUid_permissionUid: {
          roleUid: role.uid,
          permissionUid: permission.uid,
        },
      },
      data: { scopes },
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

  /**
   * Get detailed access info for a member including role permissions
   */
  async getMemberAccessDetails(memberUid: string) {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      include: {
        image: true,
        projectContributions: {
          include: {
            project: true,
          },
        },
        roleAssignments: {
          where: {
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
        },
        memberPermissions: {
          where: {
            status: 'ACTIVE',
            revokedAt: null,
          },
          include: {
            permission: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException(`Member not found: ${memberUid}`);
    }

    // Build role details with permissions
    const roles = member.roleAssignments.map((ra) => ({
      uid: ra.role.uid,
      code: ra.role.code,
      name: ra.role.name,
      description: ra.role.description,
      permissions: ra.role.rolePermissions.map((rp) => ({
        uid: rp.permission.uid,
        code: rp.permission.code,
        description: rp.permission.description,
        scopes: rp.scopes,
      })),
    }));

    // Build direct permissions list
    const directPermissions = member.memberPermissions.map((mp) => ({
      uid: mp.permission.uid,
      code: mp.permission.code,
      description: mp.permission.description,
      scopes: mp.scopes,
    }));

    // Build all permissions with source info
    const permissionMap = new Map<string, { permission: any; viaRoles: string[]; isDirect: boolean; scopes: Set<string> }>();

    // Add role-based permissions
    for (const role of roles) {
      for (const perm of role.permissions) {
        const existing = permissionMap.get(perm.code);
        if (existing) {
          existing.viaRoles.push(role.name);
          for (const s of perm.scopes) existing.scopes.add(s);
        } else {
          permissionMap.set(perm.code, {
            permission: perm,
            viaRoles: [role.name],
            isDirect: false,
            scopes: new Set(perm.scopes),
          });
        }
      }
    }

    // Add/override with direct permissions
    for (const perm of directPermissions) {
      const existing = permissionMap.get(perm.code);
      if (existing) {
        existing.isDirect = true;
        for (const s of perm.scopes) existing.scopes.add(s);
      } else {
        permissionMap.set(perm.code, {
          permission: perm,
          viaRoles: [],
          isDirect: true,
          scopes: new Set(perm.scopes),
        });
      }
    }

    return {
      member: {
        uid: member.uid,
        name: member.name,
        email: member.email,
        image: member.image,
        projectContributions: member.projectContributions,
      },
      roles,
      directPermissions,
      allPermissions: Array.from(permissionMap.values()).map((p) => ({
        ...p.permission,
        viaRoles: p.viaRoles,
        isDirect: p.isDirect,
        scopes: [...p.scopes].sort(),
      })),
    };
  }

  /**
   * Search members for dropdowns (lightweight)
   */
  async searchMembers(query: string, limit: number = 20) {
    const members = await this.prisma.member.findMany({
      where: {
        OR: [
          {
            name: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            email: {
              contains: query,
              mode: 'insensitive',
            },
          },
        ],
      },
      take: limit,
      select: {
        uid: true,
        name: true,
        email: true,
        image: {
          select: {
            url: true,
          },
        },
      },
    });

    return members;
  }

  /**
   * List members with RBAC info, search, filter, pagination
   */
  async listMembers(params: {
    search?: string;
    roleCode?: string;
    excludeRoleCode?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, roleCode, excludeRoleCode, page = 1, limit = 10 } = params;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          email: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (roleCode) {
      where.roleAssignments = {
        some: {
          status: 'ACTIVE',
          revokedAt: null,
          role: {
            code: roleCode,
          },
        },
      };
    }

    if (excludeRoleCode) {
      where.roleAssignments = {
        none: {
          status: 'ACTIVE',
          revokedAt: null,
          role: {
            code: excludeRoleCode,
          },
        },
      };
    }

    // Get total count
    const total = await this.prisma.member.count({ where });

    // Get members with their RBAC data
    const members = await this.prisma.member.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        name: 'asc',
      },
      include: {
        image: true,
        projectContributions: {
          include: {
            project: true,
          },
        },
        roleAssignments: {
          where: {
            status: 'ACTIVE',
            revokedAt: null,
          },
          include: {
            role: true,
          },
        },
        memberPermissions: {
          where: {
            status: 'ACTIVE',
            revokedAt: null,
          },
          include: {
            permission: true,
          },
        },
      },
    });

    // Transform to response format
    const transformedMembers = members.map((member) => ({
      uid: member.uid,
      name: member.name,
      email: member.email,
      image: member.image,
      projectContributions: member.projectContributions,
      roles: member.roleAssignments.map((ra) => ({
        uid: ra.role.uid,
        code: ra.role.code,
        name: ra.role.name,
      })),
      directPermissions: member.memberPermissions.map((mp) => ({
        uid: mp.permission.uid,
        code: mp.permission.code,
        description: mp.permission.description,
      })),
    }));

    return {
      members: transformedMembers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * List all roles with member and permission counts
   */
  async listRoles() {
    // Get roles with their permissions
    const roles = await this.prisma.role.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    // Get member counts for each role separately
    const memberCounts = await Promise.all(
      roles.map(async (role) => {
        const count = await this.prisma.roleAssignment.count({
          where: {
            roleUid: role.uid,
            status: 'ACTIVE',
            revokedAt: null,
          },
        });
        return { roleUid: role.uid, count };
      })
    );

    const countMap = new Map(memberCounts.map((mc) => [mc.roleUid, mc.count]));

    return roles.map((role) => ({
      uid: role.uid,
      code: role.code,
      name: role.name,
      description: role.description,
      memberCount: countMap.get(role.uid) ?? 0,
      permissionCount: role.rolePermissions.length,
      permissions: role.rolePermissions.map((rp) => ({
        uid: rp.permission.uid,
        code: rp.permission.code,
        description: rp.permission.description,
        scopes: rp.scopes,
      })),
    }));
  }

  /**
   * Get role details with members and permissions
   */
  async getRoleDetails(
    roleCode: string,
    params?: { page?: number; limit?: number; search?: string }
  ) {
    const { page = 1, limit = 20, search } = params ?? {};
    const skip = (page - 1) * limit;

    // Get role with permissions
    const role = await this.prisma.role.findUnique({
      where: { code: roleCode },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role not found: ${roleCode}`);
    }

    // Build search filter for member
    const memberWhere: any = {};
    if (search) {
      memberWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get total count of members with this role (with search filter)
    const totalMembers = await this.prisma.roleAssignment.count({
      where: {
        roleUid: role.uid,
        status: 'ACTIVE',
        revokedAt: null,
        member: search ? memberWhere : undefined,
      },
    });

    // Get paginated members with this role
    const assignments = await this.prisma.roleAssignment.findMany({
      where: {
        roleUid: role.uid,
        status: 'ACTIVE',
        revokedAt: null,
        member: search ? memberWhere : undefined,
      },
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        member: {
          include: {
            image: true,
            projectContributions: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    return {
      uid: role.uid,
      code: role.code,
      name: role.name,
      description: role.description,
      permissions: role.rolePermissions.map((rp) => ({
        uid: rp.permission.uid,
        code: rp.permission.code,
        description: rp.permission.description,
        scopes: rp.scopes,
      })),
      members: assignments.map((ra: any) => ({
        uid: ra.member.uid,
        name: ra.member.name,
        email: ra.member.email,
        image: ra.member.image,
        projectContributions: ra.member.projectContributions,
      })),
      pagination: {
        page,
        limit,
        total: totalMembers,
        totalPages: Math.ceil(totalMembers / limit),
      },
    };
  }

  /**
   * List all permissions with role and member counts
   */
  async listPermissions() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: {
        code: 'asc',
      },
      include: {
        rolePermissions: {
          include: {
            role: true,
          },
        },
        memberPermissions: {
          where: {
            status: 'ACTIVE',
            revokedAt: null,
          },
          include: {
            member: true,
          },
        },
      },
    });

    // Get all role UIDs to fetch member counts in bulk
    const allRoleUids = new Set<string>();
    for (const permission of permissions) {
      for (const rp of permission.rolePermissions) {
        allRoleUids.add(rp.role.uid);
      }
    }

    // Fetch member counts for all roles in a single query
    const roleMemberCounts = await this.prisma.roleAssignment.groupBy({
      by: ['roleUid'],
      where: {
        roleUid: { in: Array.from(allRoleUids) },
        status: 'ACTIVE',
        revokedAt: null,
      },
      _count: {
        memberUid: true,
      },
    });

    // Create a map of roleUid to member count
    const roleMemberCountMap = new Map<string, number>();
    for (const rc of roleMemberCounts) {
      roleMemberCountMap.set(rc.roleUid, rc._count.memberUid);
    }

    // Fetch all member UIDs per role for calculating unique members
    const roleAssignments = await this.prisma.roleAssignment.findMany({
      where: {
        roleUid: { in: Array.from(allRoleUids) },
        status: 'ACTIVE',
        revokedAt: null,
      },
      select: {
        roleUid: true,
        memberUid: true,
      },
    });

    // Create a map of roleUid to member UIDs
    const roleToMembersMap = new Map<string, Set<string>>();
    for (const assignment of roleAssignments) {
      if (!roleToMembersMap.has(assignment.roleUid)) {
        roleToMembersMap.set(assignment.roleUid, new Set());
      }
      roleToMembersMap.get(assignment.roleUid)!.add(assignment.memberUid);
    }

    return permissions.map((permission) => {
      // Get unique roles that have this permission with member counts
      const roles = permission.rolePermissions.map((rp) => ({
        uid: rp.role.uid,
        code: rp.role.code,
        name: rp.role.name,
        memberCount: roleMemberCountMap.get(rp.role.uid) || 0,
        scopes: rp.scopes,
      }));

      // Get unique members with direct permission
      const directMembers = permission.memberPermissions.map((mp) => ({
        uid: mp.member.uid,
        name: mp.member.name,
        email: mp.member.email,
      }));

      // Calculate total unique members (direct + from roles)
      const allMemberUids = new Set<string>(directMembers.map((m) => m.uid));
      for (const rp of permission.rolePermissions) {
        const membersInRole = roleToMembersMap.get(rp.role.uid);
        if (membersInRole) {
          for (const memberUid of membersInRole) {
            allMemberUids.add(memberUid);
          }
        }
      }

      return {
        uid: permission.uid,
        code: permission.code,
        description: permission.description,
        roleCount: roles.length,
        roles,
        directMemberCount: directMembers.length,
        directMembers,
        totalMemberCount: allMemberUids.size,
      };
    });
  }

  /**
   * Get permission details with roles and members
   */
  async getPermissionDetails(
    permissionCode: string,
    params?: { page?: number; limit?: number; search?: string; filter?: 'all' | 'direct' | 'viaRoles' }
  ) {
    const { page = 1, limit = 20, search, filter = 'all' } = params ?? {};

    // Get permission
    const permission = await this.prisma.permission.findUnique({
      where: { code: permissionCode },
    });

    if (!permission) {
      throw new NotFoundException(`Permission not found: ${permissionCode}`);
    }

    // Get roles with this permission
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { permissionUid: permission.uid },
      include: {
        role: true,
      },
    });

    // Get member counts for each role
    const rolesWithCounts = await Promise.all(
      rolePermissions.map(async (rp) => {
        const memberCount = await this.prisma.roleAssignment.count({
          where: {
            roleUid: rp.role.uid,
            status: 'ACTIVE',
            revokedAt: null,
          },
        });
        return {
          uid: rp.role.uid,
          code: rp.role.code,
          name: rp.role.name,
          description: rp.role.description,
          memberCount,
          scopes: rp.scopes,
        };
      })
    );

    // Get direct member permissions
    const directMemberPermissions = await this.prisma.memberPermission.findMany({
      where: {
        permissionUid: permission.uid,
        status: 'ACTIVE',
        revokedAt: null,
      },
      include: {
        member: {
          include: {
            image: true,
            projectContributions: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    // Get all members with this permission via roles
    const roleUids = rolePermissions.map((rp) => rp.role.uid);
    const roleAssignments = await this.prisma.roleAssignment.findMany({
      where: {
        roleUid: { in: roleUids },
        status: 'ACTIVE',
        revokedAt: null,
      },
      include: {
        role: true,
        member: {
          include: {
            image: true,
            projectContributions: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    // Build members list with source info
    const memberMap = new Map<string, any>();

    // Add members from roles
    for (const assignment of roleAssignments) {
      const existing = memberMap.get(assignment.memberUid);
      if (existing) {
        if (!existing.viaRoles.includes(assignment.role.name)) {
          existing.viaRoles.push(assignment.role.name);
        }
      } else {
        memberMap.set(assignment.memberUid, {
          uid: assignment.member.uid,
          name: assignment.member.name,
          email: assignment.member.email,
          image: assignment.member.image,
          projectContributions: assignment.member.projectContributions,
          viaRoles: [assignment.role.name],
          isDirect: false,
        });
      }
    }

    // Add/override with direct permissions
    for (const mp of directMemberPermissions) {
      const existing = memberMap.get(mp.member.uid);
      if (existing) {
        existing.isDirect = true;
      } else {
        memberMap.set(mp.member.uid, {
          uid: mp.member.uid,
          name: mp.member.name,
          email: mp.member.email,
          image: mp.member.image,
          projectContributions: mp.member.projectContributions,
          viaRoles: [],
          isDirect: true,
        });
      }
    }

    // Get all members and apply search/filter/pagination
    let allMembers = Array.from(memberMap.values());

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      allMembers = allMembers.filter(
        (m) =>
          m.name?.toLowerCase().includes(searchLower) ||
          m.email?.toLowerCase().includes(searchLower)
      );
    }

    // Apply type filter
    if (filter === 'direct') {
      allMembers = allMembers.filter((m) => m.isDirect);
    } else if (filter === 'viaRoles') {
      allMembers = allMembers.filter((m) => m.viaRoles.length > 0);
    }

    const totalMembers = allMembers.length;
    const skip = (page - 1) * limit;
    const paginatedMembers = allMembers.slice(skip, skip + limit);

    return {
      uid: permission.uid,
      code: permission.code,
      description: permission.description,
      roles: rolesWithCounts,
      members: paginatedMembers,
      directMembers: directMemberPermissions.map((mp: any) => ({
        uid: mp.member.uid,
        name: mp.member.name,
        email: mp.member.email,
        image: mp.member.image,
        projectContributions: mp.member.projectContributions,
      })),
      pagination: {
        page,
        limit,
        total: totalMembers,
        totalPages: Math.ceil(totalMembers / limit),
      },
    };
  }
}
