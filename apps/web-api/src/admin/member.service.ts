import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import crypto from 'node:crypto';
import { InvestorProfileType, Location, Member, MemberApprovalState, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { NotificationService } from '../utils/notification/notification.service';
import { LogService } from '../shared/log.service';
import { MemberRole, DEFAULT_MEMBER_ROLES, hasDemoDayAdminRole } from '../utils/constants';
import { buildMultiRelationMapping, copyObj } from '../utils/helper/helper';
import { CacheService } from '../utils/cache/cache.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import {
  CreateMemberDto,
  MemberState,
  RequestMembersDto,
  UpdateMemberDto,
} from '../../../../libs/contracts/src/schema/admin-member';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';
import { MembersHooksService } from '../members/members.hooks.service';
import { ParticipantsRequest } from './members.dto';
import { MEMBER_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { TeamsService } from '../teams/teams.service';

@Injectable()
export class MemberService {
  constructor(
    private prisma: PrismaService,
    private locationTransferService: LocationTransferService,
    private membersHooksService: MembersHooksService,
    private logger: LogService,
    @Inject(forwardRef(() => NotificationService))
    private notificationService: NotificationService,
    private cacheService: CacheService,
    @Inject(forwardRef(() => NotificationSettingsService))
    private notificationSettingsService: NotificationSettingsService,
    private forestAdminService: ForestAdminService,
    @Inject(forwardRef(() => TeamsService))
    private teamService: TeamsService
  ) {}

  private resolveMemberState(approvalState?: MemberApprovalState | null): MemberApprovalState {
    return approvalState ?? MemberApprovalState.PENDING;
  }

  private normalizeMemberStateFromPayload(payload: {
    memberState?: string | null;
    state?: string | null;
  }): MemberApprovalState | null {
    const rawState = payload.memberState ?? payload.state;

    if (!rawState) {
      return null;
    }

    const normalized = rawState.toUpperCase();

    if (normalized === 'PENDING') {
      return MemberApprovalState.PENDING;
    }

    if (normalized === 'APPROVED') {
      return MemberApprovalState.APPROVED;
    }

    if (normalized === 'VERIFIED') {
      return MemberApprovalState.VERIFIED;
    }

    if (normalized === 'REJECTED') {
      return MemberApprovalState.REJECTED;
    }

    throw new BadRequestException(`Unknown memberState: ${rawState}`);
  }

  private async syncMemberApprovalFromPayload(
    tx: Prisma.TransactionClient,
    memberUid: string,
    payload: {
      memberState?: string | null;
      state?: string | null;
    },
    requestedByUid?: string | null,
    reviewedByUid?: string | null,
    reason = 'Synced from member payload'
  ): Promise<void> {
    const explicitMemberState = this.normalizeMemberStateFromPayload(payload);
    const resolvedState = explicitMemberState;

    if (!resolvedState) {
      return;
    }

    await tx.memberApproval.upsert({
      where: { memberUid },
      update: {
        state: resolvedState,
        reason,
        requestedByUid: requestedByUid ?? undefined,
        reviewedByUid: reviewedByUid ?? null,
        reviewedAt: resolvedState === MemberApprovalState.PENDING ? null : new Date(),
      },
      create: {
        memberUid,
        state: resolvedState,
        requestedByUid: requestedByUid ?? null,
        reviewedByUid: reviewedByUid ?? null,
        reason,
        reviewedAt: resolvedState === MemberApprovalState.PENDING ? null : new Date(),
      },
    });

    if (resolvedState === MemberApprovalState.REJECTED) {
      await tx.member.update({
        where: { uid: memberUid },
        data: { deletedAt: new Date(), deletionReason: 'Member state changed to Rejected' },
      });
    }

    if (resolvedState === MemberApprovalState.APPROVED) {
      await tx.member.updateMany({
        where: { uid: memberUid, deletedAt: { not: null } },
        data: { deletedAt: null, deletionReason: null },
      });

      const teamMemberRoles = await this.prisma.teamMemberRole.findMany({
        where: { memberUid },
        select: { team: { select: { uid: true, accessLevel: true } } },
      });

      const teamUidsToUpdate = Array.from(
        new Set(teamMemberRoles?.filter((r) => r.team.accessLevel === 'L0').map((r) => r.team.uid) ?? [])
      );

      if (teamUidsToUpdate.length > 0) {
        await Promise.all(
          teamUidsToUpdate.map((teamUid) => this.teamService.updateTeamAccessLevel(teamUid, undefined, 'L1'))
        );
      }
    }
  }

  private async replaceAccessControl(
    tx: Prisma.TransactionClient,
    memberUid: string,
    payload: {
      roleCodes?: string[];
      policyCodes?: string[];
      permissionCodes?: string[];
      actorUid?: string | null;
    }
  ): Promise<void> {
    const roleCodes = [...new Set((payload.roleCodes ?? []).filter(Boolean))];
    const policyCodes = [...new Set((payload.policyCodes ?? []).filter(Boolean))];
    const permissionCodes = [...new Set((payload.permissionCodes ?? []).filter(Boolean))];

    await tx.policyAssignment.deleteMany({
      where: { memberUid },
    });

    await tx.memberPermissionV2.deleteMany({
      where: { memberUid },
    });

    await tx.roleAssignment.updateMany({
      where: {
        memberUid,
        revokedAt: null,
        status: 'ACTIVE',
      },
      data: {
        revokedAt: new Date(),
        status: 'REVOKED',
      },
    });

    await this.assignAccessControl(tx, memberUid, {
      roleCodes,
      policyCodes,
      permissionCodes,
      actorUid: payload.actorUid ?? null,
    });
  }

  private async assignAccessControl(
    tx: Prisma.TransactionClient,
    memberUid: string,
    payload: {
      roleCodes?: string[];
      policyCodes?: string[];
      permissionCodes?: string[];
      actorUid?: string | null;
    }
  ): Promise<void> {
    const roleCodes = [...new Set((payload.roleCodes ?? []).filter(Boolean))];
    const policyCodes = [...new Set((payload.policyCodes ?? []).filter(Boolean))];
    const permissionCodes = [...new Set((payload.permissionCodes ?? []).filter(Boolean))];

    if (roleCodes.length > 0) {
      const roles = await tx.role.findMany({
        where: { code: { in: roleCodes } },
        select: { uid: true, code: true },
      });

      if (roles.length !== roleCodes.length) {
        const found = new Set(roles.map((r) => r.code));
        const missing = roleCodes.filter((code) => !found.has(code));
        throw new BadRequestException(`Unknown role codes: ${missing.join(', ')}`);
      }

      for (const role of roles) {
        const existing = await tx.roleAssignment.findFirst({
          where: {
            memberUid,
            roleUid: role.uid,
          },
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            uid: true,
            status: true,
            revokedAt: true,
          },
        });

        if (existing) {
          await tx.roleAssignment.update({
            where: {
              uid: existing.uid,
            },
            data: {
              revokedAt: null,
              status: 'ACTIVE',
              assignedByMemberUid: payload.actorUid ?? null,
            },
          });
        } else {
          await tx.roleAssignment.create({
            data: {
              uid: crypto.randomUUID(),
              roleUid: role.uid,
              memberUid,
              assignedByMemberUid: payload.actorUid ?? null,
              status: 'ACTIVE',
            },
          });
        }
      }
    }

    if (policyCodes.length > 0) {
      const policies = await tx.policy.findMany({
        where: { code: { in: policyCodes } },
        select: { uid: true, code: true },
      });

      if (policies.length !== policyCodes.length) {
        const found = new Set(policies.map((p) => p.code));
        const missing = policyCodes.filter((code) => !found.has(code));
        throw new BadRequestException(`Unknown policy codes: ${missing.join(', ')}`);
      }

      for (const policy of policies) {
        const existing = await tx.policyAssignment.findFirst({
          where: {
            memberUid,
            policyUid: policy.uid,
          },
          select: { uid: true },
        });

        if (!existing) {
          await tx.policyAssignment.create({
            data: {
              uid: crypto.randomUUID(),
              memberUid,
              policyUid: policy.uid,
              assignedByUid: payload.actorUid ?? null,
            },
          });
        }
      }
    }

    if (permissionCodes.length > 0) {
      const permissions = await tx.permission.findMany({
        where: { code: { in: permissionCodes } },
        select: { uid: true, code: true },
      });

      if (permissions.length !== permissionCodes.length) {
        const found = new Set(permissions.map((p) => p.code));
        const missing = permissionCodes.filter((code) => !found.has(code));
        throw new BadRequestException(`Unknown permission codes: ${missing.join(', ')}`);
      }

      for (const permission of permissions) {
        const existing = await tx.memberPermissionV2.findFirst({
          where: {
            memberUid,
            permissionUid: permission.uid,
          },
          select: { uid: true },
        });

        if (!existing) {
          await tx.memberPermissionV2.create({
            data: {
              uid: crypto.randomUUID(),
              memberUid,
              permissionUid: permission.uid,
              grantedByUid: payload.actorUid ?? null,
            },
          });
        }
      }
    }
  }

  private mapPermission(
    permission?: { uid: string; code: string; module: string; description?: string | null } | null
  ) {
    if (!permission) {
      return null;
    }

    return {
      uid: permission.uid,
      code: permission.code,
      module: permission.module,
      description: permission.description ?? null,
    };
  }

  private mapPolicy(
    policy?: {
      uid: string;
      code: string;
      name: string;
      description?: string | null;
      role?: string | null;
      group?: string | null;
    } | null
  ) {
    if (!policy) {
      return null;
    }

    return {
      uid: policy.uid,
      code: policy.code,
      name: policy.name,
      description: policy.description ?? null,
      role: policy.role ?? null,
      group: policy.group ?? null,
    };
  }

  private mapRole(role?: { uid: string; code: string; name: string; description?: string | null } | null) {
    if (!role) {
      return null;
    }

    return {
      uid: role.uid,
      code: role.code,
      name: role.name,
      description: role.description ?? null,
    };
  }

  private uniqueByCode<T extends { code: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.code)) {
        return false;
      }
      seen.add(item.code);
      return true;
    });
  }

  /**
   * Get member UIDs that have the member.onboarding permission.
   * Checks both direct permissions (MemberPermissionV2) and policy-based permissions.
   */
  private async getMemberUidsWithOnboardingPermission(memberUids: string[]): Promise<Set<string>> {
    const onboardingPermission = await this.prisma.permission.findUnique({
      where: { code: MEMBER_PERMISSIONS.ONBOARDING },
      select: { uid: true },
    });

    if (!onboardingPermission) {
      return new Set();
    }

    // Get members with direct permission
    const directPermissionMembers = await this.prisma.memberPermissionV2.findMany({
      where: {
        memberUid: { in: memberUids },
        permissionUid: onboardingPermission.uid,
      },
      select: { memberUid: true },
    });

    // Get members with permission via policy assignment
    const policyPermissionMembers = await this.prisma.policyAssignment.findMany({
      where: {
        memberUid: { in: memberUids },
        policy: {
          policyPermissions: {
            some: {
              permissionUid: onboardingPermission.uid,
            },
          },
        },
      },
      select: { memberUid: true },
    });

    return new Set([
      ...directPermissionMembers.map((m) => m.memberUid),
      ...policyPermissionMembers.map((m) => m.memberUid),
    ]);
  }

  /**
   * Check if a specific member has the member.onboarding permission.
   * Works within a transaction context.
   */
  private async memberHasOnboardingPermission(tx: Prisma.TransactionClient, memberUid: string): Promise<boolean> {
    return this.memberHasPermissionCode(tx, memberUid, MEMBER_PERMISSIONS.ONBOARDING);
  }

  private async memberHasPermissionCode(
    tx: Prisma.TransactionClient,
    memberUid: string,
    permissionCode: string
  ): Promise<boolean> {
    const permission = await tx.permission.findUnique({
      where: { code: permissionCode },
      select: { uid: true },
    });

    if (!permission) {
      return false;
    }

    const directPermission = await tx.memberPermissionV2.findFirst({
      where: {
        memberUid,
        permissionUid: permission.uid,
      },
    });

    if (directPermission) {
      return true;
    }

    const policyPermission = await tx.policyAssignment.findFirst({
      where: {
        memberUid,
        policy: {
          policyPermissions: {
            some: {
              permissionUid: permission.uid,
            },
          },
        },
      },
    });

    return !!policyPermission;
  }

  private enrichMemberAccessData<
    T extends {
      memberApproval?: { state?: MemberApprovalState | null } | null;
      memberPermissionsV2?: Array<{
        permission?: { uid: string; code: string; module: string; description?: string | null } | null;
      }> | null;
      policyAssignmentsV2?: Array<{
        policy?: {
          uid: string;
          code: string;
          name: string;
          description?: string | null;
          role?: string | null;
          group?: string | null;
          policyPermissions?: Array<{
            permission?: { uid: string; code: string; module: string; description?: string | null } | null;
          }>;
        } | null;
      }> | null;
      roleAssignments?: Array<{
        role?: {
          uid: string;
          code: string;
          name: string;
          description?: string | null;
          rolePermissions?: Array<{
            permission?: { uid: string; code: string; module: string; description?: string | null } | null;
          }>;
        } | null;
      }> | null;
    }
  >(member: T) {
    const directPermissions = this.uniqueByCode(
      (member.memberPermissionsV2 ?? []).map((item) => this.mapPermission(item.permission)).filter(Boolean) as Array<{
        uid: string;
        code: string;
        module: string;
        description?: string | null;
      }>
    );

    const policies = this.uniqueByCode(
      (member.policyAssignmentsV2 ?? []).map((item) => this.mapPolicy(item.policy)).filter(Boolean) as Array<{
        uid: string;
        code: string;
        name: string;
        description?: string | null;
        role?: string | null;
        group?: string | null;
      }>
    );

    const policyPermissions = this.uniqueByCode(
      (member.policyAssignmentsV2 ?? [])
        .flatMap((assignment) => assignment.policy?.policyPermissions ?? [])
        .map((item) => this.mapPermission(item.permission))
        .filter(Boolean) as Array<{ uid: string; code: string; module: string; description?: string | null }>
    );

    const roles = this.uniqueByCode(
      (member.roleAssignments ?? []).map((item) => this.mapRole(item.role)).filter(Boolean) as Array<{
        uid: string;
        code: string;
        name: string;
        description?: string | null;
      }>
    );

    const rolePermissions = this.uniqueByCode(
      (member.roleAssignments ?? [])
        .flatMap((assignment) => assignment.role?.rolePermissions ?? [])
        .map((item) => this.mapPermission(item.permission))
        .filter(Boolean) as Array<{ uid: string; code: string; module: string; description?: string | null }>
    );

    const effectivePermissions = this.uniqueByCode([...directPermissions, ...policyPermissions, ...rolePermissions]);

    const { memberPermissionsV2, policyAssignmentsV2, roleAssignments, memberApproval, accessLevel, ...safeMember } =
      member as any;

    return {
      ...safeMember,
      memberState: this.resolveMemberState(member.memberApproval?.state),
      permissions: directPermissions,
      permissionCodes: directPermissions.map((p) => p.code),
      policies,
      policyCodes: policies.map((p) => p.code),
      roles,
      roleCodes: roles.map((r) => r.code),
      effectivePermissions,
      effectivePermissionCodes: effectivePermissions.map((p) => p.code),
    };
  }

  /**
   * Creates a new member in the database within a transaction.
   *
   * @param member - The data for the new member to be created
   * @param tx - The transaction client to ensure atomicity
   * @returns The created member record
   */
  async createMember(
    member: Prisma.MemberUncheckedCreateInput,
    tx: Prisma.TransactionClient = this.prisma
  ): Promise<Member> {
    try {
      const createdMember = await tx.member.create({
        data: member,
      });
      await this.notificationSettingsService.createForumNotificationSetting(createdMember.uid).catch((error) => {
        this.logger.error(`Error creating forum notification setting for member ${createdMember.uid}: ${error}`);
      });
      return createdMember;
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Updates the Member data in the database within a transaction.
   *
   * @param uid - Unique identifier of the member being updated
   * @param member - The new data to be applied to the member
   * @param tx - The transaction client to ensure atomicity
   * @returns The updated member record
   */
  async updateMemberByUid(
    uid: string,
    member: Prisma.MemberUncheckedUpdateInput,
    tx: Prisma.TransactionClient = this.prisma
  ): Promise<Member> {
    try {
      const result = await tx.member.update({
        where: { uid },
        data: member,
      });
      await this.cacheService.reset({ service: 'members' });
      return result;
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Fetches existing member data including relationships.
   * @param tx - Prisma transaction client or Prisma client.
   * @param uid - Member UID to fetch.
   */
  async findMemberByUid(uid: string, tx: Prisma.TransactionClient = this.prisma) {
    try {
      const member = await tx.member.findUniqueOrThrow({
        where: { uid },
        include: {
          image: true,
          location: true,
          skills: true,
          teamMemberRoles: true,
          memberRoles: true,
          projectContributions: true,
          memberApproval: {
            select: {
              state: true,
            },
          },
          memberPermissionsV2: {
            select: {
              permission: {
                select: {
                  uid: true,
                  code: true,
                  module: true,
                  description: true,
                },
              },
            },
          },
          policyAssignmentsV2: {
            select: {
              policy: {
                select: {
                  uid: true,
                  code: true,
                  name: true,
                  description: true,
                  role: true,
                  group: true,
                  policyPermissions: {
                    select: {
                      permission: {
                        select: {
                          uid: true,
                          code: true,
                          module: true,
                          description: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          roleAssignments: {
            select: {
              role: {
                select: {
                  uid: true,
                  code: true,
                  name: true,
                  description: true,
                  rolePermissions: {
                    select: {
                      permission: {
                        select: {
                          uid: true,
                          code: true,
                          module: true,
                          description: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      return this.enrichMemberAccessData(member);
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  async updateMemberFromParticipantsRequest(
    memberUid: string,
    memberParticipantsRequest: ParticipantsRequest,
    requestorEmail: string,
    isDirectoryAdmin = false
  ): Promise<Member> {
    const updatePayload = (memberParticipantsRequest as any)?.newData ?? memberParticipantsRequest;

    const onlyStateUpdate =
      Object.keys(updatePayload ?? {}).length > 0 &&
      Object.keys(updatePayload ?? {}).every((key) => ['memberState', 'state'].includes(key));

    if (onlyStateUpdate) {
      await this.prisma.$transaction(async (tx) => {
        await this.syncMemberApprovalFromPayload(
          tx,
          memberUid,
          updatePayload as any,
          memberUid,
          null,
          'Updated from memberState'
        );
      });

      return this.findMemberByUid(memberUid);
    }

    let result;
    let existingMemberBeforeUpdate: any = null;
    await this.prisma.$transaction(async (tx) => {
      const memberData: any = (memberParticipantsRequest as any)?.newData ?? memberParticipantsRequest;
      const existingMember = await this.findMemberByUid(memberUid, tx);
      existingMemberBeforeUpdate = existingMember;
      const isExternalIdAvailable = existingMember.externalId ? true : false;
      const isEmailChanged = await this.checkIfEmailChanged(memberData, existingMember, tx);
      this.logger.info(
        `Member update request - Initiaing update for member uid - ${existingMember.uid}, requestId -> ${memberUid}`
      );
      const { member, investorProfileData } = await this.prepareMemberFromParticipantRequest(
        memberUid,
        memberData,
        existingMember,
        tx,
        'Update'
      );
      await this.mapLocationToMember(memberData, existingMember, member, tx);
      result = await this.updateMemberByUid(
        memberUid,
        {
          ...member,
          ...(isEmailChanged && isExternalIdAvailable && { externalId: null }),
        },
        tx
      );
      await this.updateMemberEmailChange(memberUid, isEmailChanged, isExternalIdAvailable, memberData, existingMember);

      await this.syncMemberApprovalFromPayload(tx, memberUid, memberData as any, memberUid, null, 'Updated by admin');

      await this.replaceAccessControl(tx, memberUid, {
        roleCodes: (memberData as any).roleCodes ?? [],
        policyCodes: (memberData as any).policyCodes ?? [],
        permissionCodes: (memberData as any).permissionCodes ?? [],
        actorUid: null,
      });

      const canManageInvestorProfile = await this.memberHasPermissionCode(
        tx,
        memberUid,
        MEMBER_PERMISSIONS.INVESTOR_MANAGE
      );
      if (investorProfileData) {
        await this.updateMemberInvestorProfile(memberUid, investorProfileData, tx, canManageInvestorProfile);
      }

      if (isEmailChanged && isDirectoryAdmin) {
        this.notificationService.notifyForMemberChangesByAdmin(
          memberData.name,
          memberUid,
          existingMember.email,
          memberData.email
        );
      }
      this.logger.info(`Member update request - completed, requestId -> ${result.uid}, requestor -> ${requestorEmail}`);
    });

    // Send approval/onboarding notification when state changes to APPROVED (outside transaction)
    const memberStatePayload = (memberParticipantsRequest as any)?.newData ?? memberParticipantsRequest;
    if (memberStatePayload?.memberState || memberStatePayload?.state) {
      const newState = this.normalizeMemberStateFromPayload(memberStatePayload);
      const previousState = existingMemberBeforeUpdate?.memberState;

      if (newState === MemberApprovalState.APPROVED && previousState !== MemberApprovalState.APPROVED) {
        const memberEmail = existingMemberBeforeUpdate?.email ?? result?.email;
        const memberName = existingMemberBeforeUpdate?.name ?? result?.name;

        await this.notificationService.notifyForMemberCreationApproval(memberName, memberUid, memberEmail, false);
      }
    }

    await this.membersHooksService.postUpdateActions(result, requestorEmail);
    return this.findMemberByUid(memberUid);
  }

  /**
   * Checks if the email has changed during update and verifies if the new email is already in use.
   *
   * @param transactionType - The Prisma transaction client, used for querying the database.
   * @param dataToProcess - The input data containing the new email.
   * @param existingData - The existing member data, used for comparing the current email.
   * @throws {BadRequestException} - Throws if the email has been changed and the new email is already in use.
   */
  async checkIfEmailChanged(memberData, existingMember, transactionType: Prisma.TransactionClient): Promise<boolean> {
    const isEmailChanged = existingMember.email?.toLowerCase() !== memberData.email?.toLowerCase();
    if (isEmailChanged) {
      const foundUser = await transactionType.member.findUnique({
        where: { email: memberData.email.toLowerCase().trim() },
      });
      if (foundUser && foundUser.email) {
        throw new BadRequestException('Email already exists. Please try again with a different email');
      }
    }
    return isEmailChanged;
  }

  /**
   * prepare member data for creation or update
   *
   * @param memberUid - The unique identifier for the member (used for updates)
   * @param memberData - Raw member data to be formatted
   * @param tx - Transaction client for atomic operations
   * @param type - Operation type ('create' or 'update')
   * @returns - Formatted member data for Prisma query
   */
  async prepareMemberFromParticipantRequest(
    memberUid: string | null,
    memberData,
    existingMember,
    tx: Prisma.TransactionClient,
    type = 'Create'
  ): Promise<{ member: any; investorProfileData: any }> {
    const member: any = {};
    let investorProfileData: any = null;
    const directFields = [
      'name',
      'email',
      'githubHandler',
      'discordHandler',
      'bio',
      'twitterHandler',
      'linkedinHandler',
      'telegramHandler',
      'officeHours',
      'ohInterest',
      'ohHelpWith',
      'moreDetails',
      'plnStartDate',
      'plnFriend',
      'openToWork',
      'isVerified',
      'signUpSource',
      'signUpMedium',
      'signUpCampaign',
      'isUserConsent',
      'isSubscribedToNewsletter',
      'teamOrProjectURL',
      'aboutYou',
      'role',
    ];
    copyObj(memberData, member, directFields);
    member.email = member.email.toLowerCase().trim();
    member['image'] = memberData.imageUid
      ? { connect: { uid: memberData.imageUid } }
      : type === 'Update'
      ? { disconnect: true }
      : undefined;
    member['skills'] = buildMultiRelationMapping('skills', memberData, type);
    if (type === 'Create') {
      if (Array.isArray(memberData.teamAndRoles)) {
        member['teamMemberRoles'] = this.buildTeamMemberRoles(memberData);
      }
      if (Array.isArray(memberData.projectContributions)) {
        member['projectContributions'] = {
          createMany: { data: memberData.projectContributions },
        };
      }
    } else {
      await this.updateProjectContributions(memberData, existingMember, memberUid, tx);
      await this.updateTeamMemberRoles(memberData, existingMember, memberUid, tx);
    }

    // Handle investor profile
    if (memberData.investorProfile && Object.keys(memberData.investorProfile).length > 0) {
      if (type === 'Create') {
        member['investorProfile'] = {
          create: {
            investmentFocus: memberData.investorProfile.investmentFocus || [],
            investInStartupStages: memberData.investorProfile.investInStartupStages || [],
            investInFundTypes: memberData.investorProfile.investInFundTypes || [],
            typicalCheckSize: memberData.investorProfile.typicalCheckSize,
            secRulesAccepted: memberData.investorProfile.secRulesAccepted,
            secRulesAcceptedAt: memberData.investorProfile.secRulesAccepted ? new Date() : null,
            type: memberData.investorProfile.type,
          },
        };
      } else {
        // For updates, we'll handle this separately after member creation/update
        investorProfileData = memberData.investorProfile;
      }
    }

    return { member, investorProfileData };
  }

  /**
   * Handles investor profile updates for a member.
   */
  async updateMemberInvestorProfile(
    memberUid: string,
    investorProfileData: any,
    tx: Prisma.TransactionClient,
    canManageInvestorProfile = false
  ) {
    if (!canManageInvestorProfile) {
      throw new ForbiddenException('Insufficient permissions to update investor profile');
    }

    const existingMember = await tx.member.findUnique({
      where: { uid: memberUid },
      select: { investorProfileId: true, investorProfile: true },
    });

    if (!existingMember) {
      throw new NotFoundException('Member not found');
    }

    const secRulesAcceptedAt =
      investorProfileData.secRulesAccepted &&
      existingMember.investorProfile?.secRulesAccepted !== investorProfileData.secRulesAccepted
        ? new Date()
        : existingMember.investorProfile?.secRulesAcceptedAt;

    if (existingMember.investorProfileId) {
      // Update existing investor profile
      await tx.investorProfile.update({
        where: { uid: existingMember.investorProfileId },
        data: {
          investmentFocus: investorProfileData.investmentFocus || [],
          investInStartupStages: investorProfileData.investInStartupStages || [],
          investInFundTypes: investorProfileData.investInFundTypes || [],
          typicalCheckSize: investorProfileData.typicalCheckSize,
          secRulesAccepted: investorProfileData.secRulesAccepted,
          secRulesAcceptedAt,
          type: investorProfileData.type,
        },
      });
    } else {
      // Create new investor profile
      const newInvestorProfile = await tx.investorProfile.create({
        data: {
          investmentFocus: investorProfileData.investmentFocus || [],
          investInStartupStages: investorProfileData.investInStartupStages || [],
          investInFundTypes: investorProfileData.investInFundTypes || [],
          typicalCheckSize: investorProfileData.typicalCheckSize,
          secRulesAccepted: investorProfileData.secRulesAccepted,
          secRulesAcceptedAt,
          type: investorProfileData.type,
          member: { connect: { uid: memberUid } },
        },
      });

      // Link the investor profile to the member
      await tx.member.update({
        where: { uid: memberUid },
        data: { investorProfileId: newInvestorProfile.uid },
      });
    }
  }

  /**
   * Process and map location data for both create and update operations.
   * It fetches and upserts location details based on the provided city, country, and region,
   * and connects or disconnects the location accordingly.
   *
   * @param memberData - The input data containing location fields (city, country, region).
   * @param existingData - The existing member data, used for comparing locations during updates.
   * @param member - The data object that will be saved with the mapped location.
   * @param tx - The Prisma transaction client, used for upserting location.
   * @returns {Promise<void>} - Resolves once the location has been processed and mapped.
   * @throws {BadRequestException} - Throws if the location data is invalid.
   */
  async mapLocationToMember(
    memberData: any,
    existingMember: any,
    member: any,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const { city, country, region } = memberData;
    if (city || country || region) {
      const result = await this.locationTransferService.fetchLocation(city, country, null, region, null);
      // If the location has a valid placeId, proceed with upsert
      if (result?.location?.placeId) {
        const finalLocation = await tx.location.upsert({
          where: { placeId: result.location.placeId },
          update: result.location,
          create: result.location,
        });
        // Only connect the new location if it's different from the existing one
        if (finalLocation?.uid && existingMember?.location?.uid !== finalLocation.uid) {
          member['location'] = { connect: { uid: finalLocation.uid } };
        }
      } else {
        // If the location is invalid, throw an exception
        throw new BadRequestException('Invalid Location info');
      }
    } else {
      if (existingMember) {
        member['location'] = { disconnect: true };
      }
    }
  }

  /**
   * Main function to process team member role updates by creating, updating, or deleting roles.
   *
   * @param memberData - New data for processing team member roles.
   * @param existingMember - Existing member data used to identify roles for update or deletion.
   * @param referenceUid - The member's reference UID.
   * @param tx - The Prisma transaction client.
   * @returns {Promise<void>}
   */
  async updateTeamMemberRoles(memberData, existingMember, memberUid, tx: Prisma.TransactionClient) {
    const oldTeamUids = existingMember.teamMemberRoles.map((t: any) => t.teamUid);
    const newTeamUids = (memberData.teamAndRoles ?? []).map((t: any) => t.teamUid);
    // Determine which roles need to be deleted, updated, or created
    const rolesToDelete = existingMember.teamMemberRoles.filter((t: any) => !newTeamUids.includes(t.teamUid));
    const rolesToUpdate = (memberData.teamAndRoles ?? []).filter((t: any, index: number) => {
      const foundIndex = existingMember.teamMemberRoles.findIndex((v: any) => v.teamUid === t.teamUid);
      if (foundIndex > -1) {
        const foundValue = existingMember.teamMemberRoles[foundIndex];
        // Check if a role or investmentTeam has changed
        if (foundValue.role !== t.role || foundValue.investmentTeam !== t.investmentTeam) {
          let foundDefaultRoleTag = false;
          // Check if there's a default member role tag
          foundValue.roleTags?.some((tag: any) => {
            if (Object.keys(DEFAULT_MEMBER_ROLES).includes(tag)) {
              foundDefaultRoleTag = true;
              return true;
            }
          });
          // Set roleTags for the new role based on default roleTags or split role string
          memberData.teamAndRoles[index].roleTags = foundDefaultRoleTag
            ? foundValue.roleTags
            : t.role
            ? t.role.split(',').map((item: string) => item.trim())
            : [];
          // Preserve investmentTeam if not explicitly provided
          if (t.investmentTeam === undefined) {
            memberData.teamAndRoles[index].investmentTeam = foundValue.investmentTeam;
          }
          return true;
        }
      }
      return false;
    });
    const rolesToCreate = (memberData.teamAndRoles ?? []).filter((t: any) => !oldTeamUids.includes(t.teamUid));
    // Process deletions, updates, and creations
    await this.deleteTeamMemberRoles(tx, rolesToDelete, memberUid);
    await this.modifyTeamMemberRoles(tx, rolesToUpdate, memberUid);
    await this.createTeamMemberRoles(tx, rolesToCreate, memberUid);
  }

  /**
   * Function to handle the creation of new team member roles.
   *
   * @param tx - The Prisma transaction client.
   * @param rolesToCreate - Array of team roles to create.
   * @param referenceUid - The member's reference UID.
   * @returns {Promise<void>}
   */
  async createTeamMemberRoles(tx: Prisma.TransactionClient, rolesToCreate: any[], memberUid: string) {
    if (rolesToCreate.length > 0) {
      const rolesToCreateData = rolesToCreate.map((t: any) => ({
        role: t.role,
        mainTeam: false, // Set your default values here if needed
        teamLead: false, // Set your default values here if needed
        investmentTeam: t.investmentTeam || false,
        teamUid: t.teamUid,
        memberUid,
        roleTags: t.role?.split(',').map((item: string) => item.trim()), // Properly format roleTags
      }));

      await tx.teamMemberRole.createMany({
        data: rolesToCreateData,
      });
    }
  }

  /**
   * Function to handle deletion of team member roles.
   *
   * @param tx - The Prisma transaction client.
   * @param rolesToDelete - Array of team UIDs to delete.
   * @param referenceUid - The member's reference UID.
   * @returns {Promise<void>}
   */
  async deleteTeamMemberRoles(tx: Prisma.TransactionClient, rolesToDelete, memberUid: string) {
    if (rolesToDelete.length > 0) {
      await tx.teamMemberRole.deleteMany({
        where: {
          teamUid: { in: rolesToDelete.map((t: any) => t.teamUid) },
          memberUid,
        },
      });
    }
  }

  /**
   * Function to handle the update of existing team member roles.
   *
   * @param tx - The Prisma transaction client.
   * @param rolesToUpdate - Array of team roles to update.
   * @param referenceUid - The member's reference UID.
   * @returns {Promise<void>}
   */
  async modifyTeamMemberRoles(tx: Prisma.TransactionClient, rolesToUpdate, memberUid: string): Promise<void> {
    if (rolesToUpdate.length > 0) {
      const updatePromises = rolesToUpdate.map((roleToUpdate: any) =>
        tx.teamMemberRole.update({
          where: {
            memberUid_teamUid: {
              teamUid: roleToUpdate.teamUid,
              memberUid,
            },
          },
          data: {
            role: roleToUpdate.role?.trim() ?? null,
            roleTags: roleToUpdate.roleTags ?? [],
            investmentTeam: roleToUpdate.investmentTeam || false,
          },
        })
      );
      await Promise.all(updatePromises);
    }
  }

  /**
   * Builds the team member roles relational data
   * @param dataToProcess - Raw data containing team and roles
   * @returns - Team member roles relational data for Prisma query
   */
  private buildTeamMemberRoles(memberData) {
    return {
      createMany: {
        data: memberData.teamAndRoles.map((t) => ({
          role: t.role?.trim() ?? null,
          mainTeam: false,
          teamLead: false,
          investmentTeam: t.investmentTeam || false,
          teamUid: t.teamUid,
          roleTags: t.role ? t.role.split(',').map((item) => item.trim()) : [],
        })),
      },
    };
  }

  /**
   * function to handle creation, updating, and deletion of project contributions
   * with fewer database calls by using batch operations.
   *
   * @param memberData - The input data containing the new project contributions.
   * @param existingMember - The existing member data, used to identify contributions to update or delete.
   * @param memberUid - The reference UID for associating the new contributions with the member.
   * @param tx - The Prisma transaction client.
   * @returns {Promise<void>}
   */
  async updateProjectContributions(
    memberData,
    existingMember,
    memberUid: string | null,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const contributionsToCreate = memberData.projectContributions?.filter((contribution) => !contribution.uid) || [];
    const contributionUidsInRequest =
      memberData.projectContributions
        ?.filter((contribution) => contribution.uid)
        .map((contribution) => contribution.uid) || [];
    const contributionIdsToDelete: string[] = [];
    const contributionIdsToUpdate: any = [];
    existingMember.projectContributions?.forEach((existingContribution: any) => {
      if (!contributionUidsInRequest.includes(existingContribution.uid)) {
        contributionIdsToDelete.push(existingContribution.uid);
      } else {
        const newContribution = memberData.projectContributions.find(
          (contribution) => contribution.uid === existingContribution.uid
        );
        if (JSON.stringify(existingContribution) !== JSON.stringify(newContribution)) {
          contributionIdsToUpdate.push(newContribution);
        }
      }
    });
    if (contributionIdsToDelete.length > 0) {
      await tx.projectContribution.deleteMany({
        where: { uid: { in: contributionIdsToDelete } },
      });
    }
    if (contributionIdsToUpdate.length > 0) {
      const updatePromises = contributionIdsToUpdate.map((contribution: any) =>
        tx.projectContribution.update({
          where: { uid: contribution.uid },
          data: { ...contribution },
        })
      );
      await Promise.all(updatePromises);
    }
    if (contributionsToCreate.length > 0) {
      const contributionsToCreateData = contributionsToCreate.map((contribution: any) => ({
        ...contribution,
        memberUid,
      }));
      await tx.projectContribution.createMany({
        data: contributionsToCreateData,
      });
    }
  }

  /**
   * Update member email and handle external account deletion if email changes.
   *
   * @param uidToEdit - The unique identifier of the member being updated.
   * @param isEmailChange - Boolean flag indicating if the email has changed.
   * @param isExternalIdAvailable - Boolean flag indicating if an external ID is available.
   * @param memberData - The object containing the updated member data.
   * @param existingMember - The object containing the existing member data.
   * @returns {Promise<void>}
   */
  async updateMemberEmailChange(
    uidToEdit: string,
    isEmailChange: boolean,
    isExternalIdAvailable: boolean,
    memberData,
    existingMember
  ): Promise<void> {
    try {
      this.logger.info(`Member update request - attributes updated, requestId -> ${uidToEdit}`);
      if (isEmailChange && isExternalIdAvailable) {
        this.logger.info(
          `Member update request - Initiating email change - newEmail: ${memberData.email}, oldEmail: ${existingMember.email}, externalId: ${existingMember.externalId}, requestId -> ${uidToEdit}`
        );
        const clientToken = await this.fetchAccessToken();
        const headers = {
          Authorization: `Bearer ${clientToken}`,
        };
        // Attempt to delete the external account associated with the old email
        await this.deleteExternalAccount(existingMember.externalId, headers, uidToEdit);
        this.logger.info(`Member update request - Email changed, requestId -> ${uidToEdit}`);
      }
    } catch (error) {
      this.logger.error(
        `Member update request - Failed to update email, requestId -> ${uidToEdit}, error -> ${error.message}`
      );
      throw new Error(`Email update failed: ${error.message}`);
    }
  }

  /**
   * Deletes the external account associated with a given external ID.
   *
   * @param externalId - The external ID of the account to be deleted.
   * @param headers - The authorization headers for the request.
   * @param uidToEdit - The unique identifier of the member being updated.
   * @returns {Promise<void>}
   */
  async deleteExternalAccount(externalId: string, headers: any, uidToEdit: string): Promise<void> {
    try {
      await axios.delete(`${process.env.AUTH_API_URL}/admin/accounts/external/${externalId}`, {
        headers: headers,
      });
      this.logger.info(`External account deleted, externalId -> ${externalId}, requestId -> ${uidToEdit}`);
    } catch (error) {
      // Handle cases where the external account is not found (404) and other errors
      if (error?.response?.status === 404) {
        this.logger.error(
          `External account not found for deletion, externalId -> ${externalId}, requestId -> ${uidToEdit}`
        );
      } else {
        this.logger.error(
          `Failed to delete external account, externalId -> ${externalId}, requestId -> ${uidToEdit}, error -> ${error.message}`
        );
        throw error;
      }
    }
  }

  /**
   * Fetches the access token from the authentication service.
   *
   * @returns {Promise<string>} - The client token used for authorization.
   * @throws {Error} - Throws an error if token retrieval fails.
   */
  async fetchAccessToken(): Promise<string> {
    try {
      const response = await axios.post(`${process.env.AUTH_API_URL}/auth/token`, {
        client_id: process.env.AUTH_APP_CLIENT_ID,
        client_secret: process.env.AUTH_APP_CLIENT_SECRET,
        grant_type: 'client_credentials',
        grantTypes: ['client_credentials', 'authorization_code', 'refresh_token'],
      });

      return response.data.access_token;
    } catch (error) {
      throw new Error('Failed to retrieve client token');
    }
  }

  /**
   * Verify the list of members and log into participant request.
   * @param memberIds array of member IDs
   * @param userEmail logged in member email
   * @returns result
   */
  async verifyMembers(memberIds: string[], userEmail): Promise<any> {
    const response = await this.prisma.$transaction(async (tx) => {
      const result = await tx.member.updateMany({
        where: { uid: { in: memberIds } },
        data: {
          isVerified: true,
        },
      });
      if (result.count !== memberIds.length) {
        throw new NotFoundException('One or more member IDs are invalid.');
      }

      // enables recommendation feature for new users
      await this.notificationSettingsService.enableRecommendationsFor(memberIds);

      return result;
    });
    await this.cacheService.reset({ service: 'members' });
    return response;
  }

  /**
   * Replaces HOST-type demo day admin scopes for a given member.
   *
   * Only members with DEMO_DAY_ADMIN role are allowed to have demo day admin scopes.
   * Returns the updated member including roles and demo day admin scopes.
   */
  async updateDemoDayAdminHosts(memberUid: string, hosts: string[]): Promise<Member> {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      include: {
        memberRoles: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (!hasDemoDayAdminRole(member)) {
      // Treat this as a configuration error rather than a permission error
      throw new BadRequestException('Member does not have DEMO_DAY_ADMIN role');
    }

    const normalizedHosts = (hosts || []).map((h) => h.trim()).filter((h) => h.length > 0);

    // Replace all HOST scopes for this member in a single transaction
    await this.prisma.$transaction([
      this.prisma.memberDemoDayAdminScope.deleteMany({
        where: {
          memberUid,
          scopeType: 'HOST',
        },
      }),
      ...normalizedHosts.map((host) =>
        this.prisma.memberDemoDayAdminScope.create({
          data: {
            memberUid,
            scopeType: 'HOST',
            scopeValue: host,
          },
        })
      ),
    ]);

    const enrichedMember = await this.findMemberByUid(memberUid);

    if (!enrichedMember) {
      throw new NotFoundException('Member not found after updating demo day admin hosts');
    }

    return enrichedMember;
  }

  /**
   * Handles database-related errors specifically for the Member entity.
   * Logs the error and throws an appropriate HTTP exception based on the error type.
   *
   * @param {any} error - The error object thrown by Prisma or other services.
   * @param {string} [message] - An optional message to provide additional context,
   *                             such as the member UID when an entity is not found.
   * @throws {ConflictException} - If there's a unique key constraint violation.
   * @throws {BadRequestException} - If there's a foreign key constraint violation or validation error.
   * @throws {NotFoundException} - If a member is not found with the provided UID.
   */
  private handleErrors(error, message?: string) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          const fieldName = (error.meta as any)?.target?.[0] || 'field';
          throw new ConflictException(`This ${fieldName} is already in the system.`);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on Member', error.message);
        case 'P2025':
          throw new NotFoundException('Member not found with uid: ' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database field validation error on Member', error.message);
    } else {
      throw error;
    }
    // TODO: Remove this return statement if future versions allow all error-returning functions to be inferred correctly.
    return error;
  }

  async findMemberByRole() {
    return this.prisma.member.findFirst({
      where: {
        memberRoles: {
          some: {
            name: MemberRole.DIRECTORY_ADMIN,
          },
        },
      },
      select: {
        uid: true,
        email: true,
        name: true,
      },
    });
  }

  async findMembers(params: RequestMembersDto) {
    const { page, limit, memberState, policyCodes, policyGroups, policyRoles } = params;
    const where: Prisma.MemberWhereInput = {};

    if (memberState?.length) {
      where.memberApproval = {
        state: {
          in: memberState as MemberApprovalState[],
        },
      };
    }

    if (policyCodes?.length || policyGroups?.length || policyRoles?.length) {
      where.policyAssignmentsV2 = {
        some: {
          policy: {
            ...(policyCodes?.length ? { code: { in: policyCodes } } : {}),
            ...(policyGroups?.length ? { group: { in: policyGroups } } : {}),
            ...(policyRoles?.length ? { role: { in: policyRoles } } : {}),
          },
        },
      };
    }

    const members = await this.prisma.member.findMany({
      // When no pagination params provided, fetch all members
      ...(page && limit ? { skip: (page - 1) * limit, take: limit } : {}),
      where,
      select: {
        uid: true,
        name: true,
        imageUid: true,
        memberRoles: true,
        image: {
          select: {
            uid: true,
            url: true,
          },
        },
        email: true,
        isSubscribedToNewsletter: true,
        signUpSource: true,
        teamOrProjectURL: true,
        locationUid: true,
        location: {
          select: {
            uid: true,
            city: true,
            country: true,
            region: true,
          },
        },
        teamMemberRoles: {
          select: {
            investmentTeam: true,
            team: {
              select: {
                uid: true,
                name: true,
                accessLevel: true,
              },
            },
          },
        },
        projectContributions: {
          select: {
            uid: true,
            project: {
              select: {
                uid: true,
                name: true,
              },
            },
          },
        },
        linkedinProfile: {
          select: {
            uid: true,
            linkedinHandler: true,
          },
        },
        investorProfile: {
          select: {
            uid: true,
            investmentFocus: true,
            investInStartupStages: true,
            investInFundTypes: true,
            typicalCheckSize: true,
            type: true,
          },
        },
        memberApproval: {
          select: {
            state: true,
          },
        },
        memberPermissionsV2: {
          select: {
            permission: {
              select: {
                uid: true,
                code: true,
                module: true,
                description: true,
              },
            },
          },
        },
        policyAssignmentsV2: {
          select: {
            policy: {
              select: {
                uid: true,
                code: true,
                name: true,
                description: true,
                policyPermissions: {
                  select: {
                    permission: {
                      select: {
                        uid: true,
                        code: true,
                        module: true,
                        description: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        roleAssignments: {
          select: {
            role: {
              select: {
                uid: true,
                code: true,
                name: true,
                description: true,
                rolePermissions: {
                  select: {
                    permission: {
                      select: {
                        uid: true,
                        code: true,
                        module: true,
                        description: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        demoDayAdminScopes: {
          select: {
            memberUid: true,
            scopeType: true,
            scopeValue: true,
            config: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const membersWithHosts = members.map((m) => ({
      ...this.enrichMemberAccessData(m),
      demoDayHosts: m.demoDayAdminScopes?.filter((s) => s.scopeType === 'HOST').map((s) => s.scopeValue) ?? [],
    }));

    const total = await this.prisma.member.count({ where });

    return {
      data: membersWithHosts,
      pagination: {
        total,
        page: page ?? 1,
        limit: limit ?? total,
        pages: limit ? Math.ceil(total / limit) : 1,
      },
    };
  }

  async getMemberStateCounts(): Promise<Record<MemberState, number>> {
    const counts = await this.prisma.memberApproval.groupBy({
      by: ['state'],
      _count: true,
    });

    const result: Record<MemberState, number> = {
      [MemberState.PENDING]: 0,
      [MemberState.VERIFIED]: 0,
      [MemberState.APPROVED]: 0,
      [MemberState.REJECTED]: 0,
    };

    for (const item of counts) {
      result[item.state as MemberState] = item._count;
    }

    return result;
  }

  async updateMemberApprovalState(memberUid: string, memberState: MemberApprovalState): Promise<{ updated: boolean }> {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      include: {
        memberApproval: true,
        teamMemberRoles: {
          select: {
            team: {
              select: {
                uid: true,
                accessLevel: true,
              },
            },
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (member.memberApproval?.state === memberState) {
      return { updated: false };
    }

    this.syncMemberApprovalFromPayload(
      this.prisma,
      memberUid,
      {
        state: memberState,
      },
      memberUid,
      null,
      'Member state changed to ' + memberState
    );

    await this.forestAdminService.triggerAirtableSync();

    return { updated: true };
  }

  async createMemberByAdmin(memberData: CreateMemberDto): Promise<Member> {
    let createdMember: any;
    await this.prisma.$transaction(async (tx) => {
      const aclPayload = memberData as CreateMemberDto & {
        roleCodes?: string[];
        policyCodes?: string[];
        permissionCodes?: string[];
      };

      const location = await this.mapLocationToNewMember(memberData.city, memberData.country, memberData.region, tx);

      const { isVerified = false, plnFriend = false } = this.resolveFlagsFromMemberState(memberData.memberState);

      let investorProfileId: string | null = null;

      if (memberData.investorProfile) {
        // Create investorProfile first and get its id
        const investorProfile = await tx.investorProfile.create({
          data: {
            investmentFocus: memberData.investorProfile.investmentFocus,
            investInStartupStages: memberData.investorProfile.investInStartupStages,
            investInFundTypes: memberData.investorProfile.investInFundTypes,
            typicalCheckSize: memberData.investorProfile.typicalCheckSize,
            secRulesAccepted: memberData.investorProfile.secRulesAccepted,
            type: (memberData.investorProfile.type
              ? memberData.investorProfile.type
              : memberData.teamMemberRoles?.length > 0
              ? 'FUND'
              : 'ANGEL') as InvestorProfileType,
            secRulesAcceptedAt: memberData.investorProfile.secRulesAccepted ? new Date() : null,
          },
        });
        investorProfileId = investorProfile.uid;
      }

      const newMember = {
        name: memberData.name,
        email: memberData.email.toLowerCase().trim(),
        imageUid: memberData.imageUid,
        isVerified,
        plnFriend,
        bio: memberData.bio,
        aboutYou: memberData.aboutYou,
        plnStartDate: memberData.joinDate ? new Date(memberData.joinDate) : null,
        githubHandler: memberData.githubHandler,
        discordHandler: memberData.discordHandler,
        twitterHandler: memberData.twitterHandler,
        linkedinHandler: memberData.linkedinHandler,
        telegramHandler: memberData.telegramHandler,
        officeHours: memberData.officeHours,
        ohInterest: memberData.ohInterest || [],
        ohHelpWith: memberData.ohHelpWith || [],
        teamOrProjectURL: memberData.teamOrProjectURL,
        locationUid: location?.uid || null,
        skills: {
          connect: (memberData.skills ?? []).map((uid) => ({ uid })),
        },
        teamMemberRoles: {
          create: (memberData.teamMemberRoles ?? []).map(({ teamUid, role }) => ({
            role,
            team: {
              connect: { uid: teamUid },
            },
          })),
        },
        notificationSetting: {
          create: {
            recommendationsEnabled: false,
          },
        },
        ...(investorProfileId && { investorProfileId }),
      };

      createdMember = await this.createMember(newMember, tx);

      await this.syncMemberApprovalFromPayload(
        tx,
        createdMember.uid,
        memberData as CreateMemberDto & { memberState?: string | null; state?: string | null },
        createdMember.uid,
        null,
        'Created by admin'
      );

      await this.assignAccessControl(tx, createdMember.uid, {
        roleCodes: aclPayload.roleCodes ?? [],
        policyCodes: aclPayload.policyCodes ?? [],
        permissionCodes: aclPayload.permissionCodes ?? [],
        actorUid: null,
      });

      if ((memberData.memberState ?? MemberState.PENDING) === MemberState.APPROVED) {
        // Check if member has onboarding permission for targeted onboarding flow
        const hasOnboardingPermission = await this.memberHasOnboardingPermission(tx, createdMember.uid);
        await this.notificationService.notifyForMemberCreationApproval(
          createdMember.name,
          createdMember.uid,
          createdMember.email,
          hasOnboardingPermission
        );
      }

      // Create investor profile for L5/L6 members if they don't have one
      await this.createInvestorProfileForHighLevelMembers([createdMember.uid], tx);

      await this.membersHooksService.postCreateActions(createdMember, memberData.email);
    });
    return this.findMemberByUid(createdMember.uid);
  }

  async updateMemberByAdmin(uid: string, dto: UpdateMemberDto): Promise<string> {
    const { country, region, city, skills, teamMemberRoles, joinDate, investorProfile, memberState, ...rest } = dto;

    const data: any = {
      ...rest,
    };

    // NEW: used later for post-transaction handling
    let existingMember: any;
    let isEmailChanged = false;

    let updatedMember;

    await this.prisma.$transaction(async (tx) => {
      this.logger.info(`Admin updateMemberByAdmin - init, uid -> ${uid}`);

      // get existing member (for comparing email and externalId)
      existingMember = await tx.member.findUniqueOrThrow({ where: { uid } });

      const { isVerified, plnFriend } = this.resolveFlagsFromMemberState(memberState);
      if (isVerified !== undefined) {
        data.isVerified = isVerified;
      }
      if (plnFriend !== undefined) {
        data.plnFriend = plnFriend;
      }

      // handle email change with normalization and validation
      if (dto.email) {
        this.logger.info(
          `Admin updateMemberByAdmin - email change requested, uid -> ${uid}, old -> ${existingMember.email}, new -> ${dto.email}`
        );
        isEmailChanged = await this.checkIfEmailChanged({ email: dto.email }, existingMember, tx);
        data.email = dto.email.toLowerCase().trim();
        if (isEmailChanged && existingMember.externalId) {
          // detach external account if email is changed (same as in user flow)
          data.externalId = null;
          this.logger.info(`Admin updateMemberByAdmin - externalId will be cleared due to email change, uid -> ${uid}`);
        }
      }

      if (joinDate) {
        data.plnStartDate = new Date(joinDate);
      }

      if (country || region || city) {
        const location = await this.mapLocationToNewMember(city, country, region, tx);
        data.locationUid = location?.uid ?? '';
      }

      if (skills) {
        data.skills = {
          set: [],
          connect: skills.map((uid) => ({ uid })),
        };
      }

      if (teamMemberRoles) {
        await tx.teamMemberRole.deleteMany({
          where: {
            memberUid: uid,
          },
        });

        data.teamMemberRoles = {
          create: teamMemberRoles.map(({ teamUid, role }) => ({
            role,
            team: {
              connect: { uid: teamUid },
            },
          })),
        };
      }

      await this.syncMemberApprovalFromPayload(
        tx,
        uid,
        { memberState: memberState ?? null },
        uid,
        null,
        'Updated by admin'
      );

      if (investorProfile) {
        const canManageInvestorProfile = await this.memberHasPermissionCode(
          tx,
          uid,
          MEMBER_PERMISSIONS.INVESTOR_MANAGE
        );
        if (!canManageInvestorProfile) {
          throw new ForbiddenException('Insufficient permissions to update investor profile');
        }

        const existingMember = await tx.member.findUnique({
          where: { uid },
          select: { investorProfileId: true, investorProfile: true },
        });

        const secRulesAcceptedAt =
          investorProfile.secRulesAccepted &&
          existingMember?.investorProfile?.secRulesAccepted !== investorProfile.secRulesAccepted
            ? new Date()
            : existingMember?.investorProfile?.secRulesAcceptedAt;

        if (existingMember?.investorProfileId) {
          await tx.investorProfile.update({
            where: { uid: existingMember.investorProfileId },
            data: {
              investmentFocus: investorProfile.investmentFocus,
              typicalCheckSize: investorProfile.typicalCheckSize,
              secRulesAccepted: investorProfile.secRulesAccepted,
              secRulesAcceptedAt,
              investInStartupStages: investorProfile.investInStartupStages,
              investInFundTypes: investorProfile.investInFundTypes,
              type: investorProfile.type as InvestorProfileType,
            },
          });
        } else {
          // Create new investor profile
          const newInvestorProfile = await tx.investorProfile.create({
            data: {
              investmentFocus: investorProfile.investmentFocus,
              typicalCheckSize: investorProfile.typicalCheckSize,
              secRulesAccepted: investorProfile.secRulesAccepted,
              secRulesAcceptedAt,
              investInStartupStages: investorProfile.investInStartupStages,
              investInFundTypes: investorProfile.investInFundTypes,
              type: investorProfile.type as InvestorProfileType,
              memberUid: uid,
            },
          });

          // Link the investor profile to the member
          data.investorProfileId = newInvestorProfile.uid;
        }
      }

      updatedMember = await tx.member.update({
        where: { uid },
        data,
      });

      this.logger.info(
        `Admin updateMemberByAdmin - updated, uid -> ${updatedMember.uid}, isEmailChanged -> ${isEmailChanged}`
      );
    });

    // post-processing of email change (delete external account and log)
    if (isEmailChanged) {
      await this.updateMemberEmailChange(
        uid,
        true,
        Boolean(existingMember?.externalId),
        { email: dto.email },
        existingMember
      );
      this.logger.info(`Admin updateMemberByAdmin - post email-change handled, uid -> ${uid}`);
    }

    return updatedMember.uid;
  }

  private async mapLocationToNewMember(
    city: string | undefined | null,
    country: string | undefined | null,
    region: string | undefined | null,
    tx: Prisma.TransactionClient
  ): Promise<Location | null> {
    if (city || country || region) {
      const result = await this.locationTransferService.fetchLocation(city, country, null, region, null);
      // If the location has a valid placeId, proceed with upsert
      if (result?.location?.placeId) {
        return tx.location.upsert({
          where: { placeId: result.location.placeId },
          update: result.location,
          create: result.location,
        });
      } else {
        throw new BadRequestException('Invalid Location info');
      }
    } else {
      return null; // throw new BadRequestException('Invalid Location info');
    }
  }

  private async createInvestorProfileForHighLevelMembers(
    memberUids: string[],
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const investorPermission = await tx.permission.findUnique({
      where: { code: MEMBER_PERMISSIONS.INVESTOR_MANAGE },
      select: { uid: true },
    });

    if (!investorPermission) {
      return;
    }

    const directPermissionMembers = await tx.memberPermissionV2.findMany({
      where: {
        memberUid: { in: memberUids },
        permissionUid: investorPermission.uid,
      },
      select: { memberUid: true },
    });

    const policyPermissionMembers = await tx.policyAssignment.findMany({
      where: {
        memberUid: { in: memberUids },
        policy: {
          policyPermissions: {
            some: {
              permissionUid: investorPermission.uid,
            },
          },
        },
      },
      select: { memberUid: true },
    });

    const allowedMemberUids = Array.from(
      new Set([...directPermissionMembers.map((m) => m.memberUid), ...policyPermissionMembers.map((m) => m.memberUid)])
    );

    if (!allowedMemberUids.length) {
      return;
    }

    const membersWithoutInvestorProfile = await tx.member.findMany({
      where: {
        uid: { in: allowedMemberUids },
        investorProfileId: null,
      },
      select: {
        uid: true,
      },
    });

    for (const member of membersWithoutInvestorProfile) {
      const newInvestorProfile = await tx.investorProfile.create({
        data: {
          investmentFocus: [],
          investInStartupStages: [],
          investInFundTypes: [],
          member: { connect: { uid: member.uid } },
        },
      });

      await tx.member.update({
        where: { uid: member.uid },
        data: { investorProfileId: newInvestorProfile.uid },
      });
    }
  }

  private resolveFlagsFromMemberState(memberState?: MemberState): { isVerified?: boolean; plnFriend?: boolean } {
    if (!memberState) {
      return {};
    }

    if (memberState === MemberState.APPROVED) {
      return { isVerified: true, plnFriend: false };
    }

    if (memberState === MemberState.VERIFIED) {
      return { isVerified: true, plnFriend: false };
    }

    return { isVerified: false, plnFriend: false };
  }

  /**
   * Replaces all roles for a given member with the provided list of role names.
   *
   * Only directory-level admins should be allowed to call this from controller.
   */
  async updateMemberRolesByUid(memberUid: string, roleNames: string[]) {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      include: { memberRoles: true },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const normalizedRoleNames = (roleNames ?? [])
      .map((name) => name.trim().toUpperCase())
      .filter((name) => name.length > 0);

    // Load existing roles from DB by name
    const roles = await this.prisma.memberRole.findMany({
      where: {
        name: { in: normalizedRoleNames },
      },
    });

    if (roles.length !== normalizedRoleNames.length) {
      const existingNames = roles.map((r) => r.name);
      const missing = normalizedRoleNames.filter((r) => !existingNames.includes(r));
      throw new BadRequestException(`Unknown member roles: ${missing.join(', ')}`);
    }

    // Optional: protect from removing the last DIRECTORY_ADMIN
    // (uncomment if you want safety here)
    // if (member.memberRoles.some((r) => r.name === 'DIRECTORY_ADMIN') &&
    //     !normalizedRoleNames.includes('DIRECTORY_ADMIN')) {
    //   const directoryAdminsCount = await this.prisma.member.count({
    //     where: {
    //       memberRoles: { some: { name: 'DIRECTORY_ADMIN' } },
    //     },
    //   });
    //   if (directoryAdminsCount === 1) {
    //     throw new BadRequestException('Cannot remove the last DIRECTORY_ADMIN');
    //   }
    // }

    await this.prisma.member.update({
      where: { uid: memberUid },
      data: {
        memberRoles: {
          set: [], // clear existing many-to-many
          connect: roles.map((role) => ({ id: role.id })),
        },
      },
    });

    return await this.findMemberByUid(memberUid);
  }

  /**
   * Updates both member roles and demo day admin hosts in a single transaction.
   * This is more efficient than calling updateMemberRolesByUid and updateDemoDayAdminHosts separately.
   *
   * Only directory-level admins should be allowed to call this from controller.
   */
  async updateMemberRolesAndHosts(memberUid: string, roleNames?: string[], hosts?: string[]): Promise<Member> {
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.member.findUnique({
        where: { uid: memberUid },
        include: {
          memberRoles: true,
          demoDayAdminScopes: true,
        },
      });

      if (!member) {
        throw new NotFoundException('Member not found');
      }

      // Update roles if provided
      if (roleNames !== undefined) {
        const normalizedRoleNames = (roleNames ?? [])
          .map((name) => name.trim().toUpperCase())
          .filter((name) => name.length > 0);

        // Load existing roles from DB by name
        const roles = await tx.memberRole.findMany({
          where: {
            name: { in: normalizedRoleNames },
          },
        });

        if (roles.length !== normalizedRoleNames.length) {
          const existingNames = roles.map((r) => r.name);
          const missing = normalizedRoleNames.filter((r) => !existingNames.includes(r));
          throw new BadRequestException(`Unknown member roles: ${missing.join(', ')}`);
        }

        // Update roles
        await tx.member.update({
          where: { uid: memberUid },
          data: {
            memberRoles: {
              set: [],
              connect: roles.map((role) => ({ id: role.id })),
            },
          },
        });
      }

      // Update hosts if provided
      if (hosts !== undefined) {
        // Reload member to get updated roles if roles were updated
        const updatedMember = await tx.member.findUnique({
          where: { uid: memberUid },
          include: {
            memberRoles: true,
          },
        });

        if (!updatedMember) {
          throw new NotFoundException('Member not found after updating roles');
        }

        // Check if member has DEMO_DAY_ADMIN role (only required if hosts are being set)
        if (hosts.length > 0 && !hasDemoDayAdminRole(updatedMember)) {
          throw new BadRequestException('Member must have DEMO_DAY_ADMIN role to have demo day admin hosts');
        }

        const normalizedHosts = (hosts || []).map((h) => h.trim()).filter((h) => h.length > 0);

        // Replace all HOST scopes for this member
        await tx.memberDemoDayAdminScope.deleteMany({
          where: {
            memberUid,
            scopeType: 'HOST',
          },
        });

        if (normalizedHosts.length > 0) {
          await Promise.all(
            normalizedHosts.map((host) =>
              tx.memberDemoDayAdminScope.create({
                data: {
                  memberUid,
                  scopeType: 'HOST',
                  scopeValue: host,
                },
              })
            )
          );
        }
      }
    });

    return await this.findMemberByUid(memberUid);
  }
}
