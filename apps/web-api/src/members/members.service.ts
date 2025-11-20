import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import axios from 'axios';
import * as path from 'path';
import {ApprovalStatus, Member, ParticipantsRequest, ParticipantType, Prisma} from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { AirtableMemberSchema } from '../utils/airtable/schema/airtable-member.schema';
import { FileMigrationService } from '../utils/file-migration/file-migration.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { NotificationService } from '../utils/notification/notification.service';
import { EmailOtpService } from '../otp/email-otp.service';
import { AuthService } from '../auth/auth.service';
import { LogService } from '../shared/log.service';
import { DEFAULT_MEMBER_ROLES } from '../utils/constants';
import { hashFileName } from '../utils/hashing';
import { buildMultiRelationMapping, copyObj } from '../utils/helper/helper';
import { CacheService } from '../utils/cache/cache.service';
import { MembersHooksService } from './members.hooks.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { AccessLevel } from '../../../../libs/contracts/src/schema/admin-member';
import { OfficeHoursService } from '../office-hours/office-hours.service';
import { TeamsService } from '../teams/teams.service';

@Injectable()
export class MembersService {
  constructor(
    private prisma: PrismaService,
    private locationTransferService: LocationTransferService,
    private fileMigrationService: FileMigrationService,
    private emailOtpService: EmailOtpService,
    private authService: AuthService,
    private logger: LogService,
    @Inject(forwardRef(() => ParticipantsRequestService))
    private participantsRequestService: ParticipantsRequestService,
    @Inject(forwardRef(() => NotificationService))
    private notificationService: NotificationService,
    private cacheService: CacheService,
    @Inject(forwardRef(() => TeamsService))
    private teamService: TeamsService,
    private membersHooksService: MembersHooksService,
    @Inject(forwardRef(() => NotificationSettingsService))
    private notificationSettingsService: NotificationSettingsService,
    @Inject(forwardRef(() => OfficeHoursService))
    private officeHoursService: OfficeHoursService
  ) {}

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
      return await tx.member.create({
        data: member,
      });
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Retrieves a list of members based on the provided query options.
   *
   * This method interacts with the Prisma ORM to execute a `findMany` query on the `member` table,
   * using the query options specified in the `Prisma.MemberFindManyArgs` object.
   *
   * @param queryOptions - An object containing the query options to filter, sort, and paginate
   *                       the members. These options are based on Prisma's `MemberFindManyArgs`.
   * @returns A promise that resolves to an array of member records matching the query criteria.
   */
  async findAll(queryOptions: Prisma.MemberFindManyArgs): Promise<{ count: number; members: Member[] }> {
    try {
      const where = {
        ...queryOptions.where,
        accessLevel: {
          notIn: ['L0', 'L1', 'Rejected'],
        },
      };

      const [members, membersCount] = await this.prisma.$transaction([
        this.prisma.member.findMany({ ...queryOptions, where }),
        this.prisma.member.count({ where }),
      ]);
      const filteredMembers = members.map((member: any) => {
        return {
          ...member,
          teamMemberRoles: member.teamMemberRoles?.filter((role) => role?.team?.accessLevel !== 'L0'),
        };
      });

      return { count: membersCount, members: filteredMembers };
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Retrieves a list of members, filtering out those with access levels 'L0' and 'L1',
   * except for the currently logged-in member identified by their email.
   *
   * This method allows combining the custom access-level filter with any additional filters
   * passed via `queryOptions.where`. It ensures that the logged-in member is always included,
   * even if they have an excluded access level.
   *
   * @param queryOptions - Prisma query options to filter, sort, and paginate members (e.g., isFeatured, team filters).
   * @param loginEmail - The email of the currently logged-in member to ensure they are always included in the result.
   * @returns A promise resolving to an object with the count and the filtered list of member records.
   *
   * @example
   * await findAllFiltered({ where: { isFeatured: true } }, 'user@example.com');
   */
  async findAllFiltered(
    queryOptions: Prisma.MemberFindManyArgs,
    loginEmail: string | null
  ): Promise<{ count: number; members: Member[] }> {
    try {
      const accessLevelFilter: Prisma.MemberWhereInput = {
        accessLevel: { notIn: ['L0', 'L1', 'Rejected'] },
      };

      const filters: Prisma.MemberWhereInput[] = [accessLevelFilter];

      if (loginEmail) {
        filters.push({ email: loginEmail });
      }

      queryOptions.where = {
        AND: [
          {
            OR: filters,
          },
          queryOptions.where ?? {},
        ],
      };

      const [members, membersCount] = await Promise.all([
        this.prisma.member.findMany(queryOptions),
        this.prisma.member.count({ where: queryOptions.where }),
      ]);

      return { count: membersCount, members };
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Retrieves members by a list of UIDs.
   * Returns simplified member data with only UID, name, and email.
   *
   * @param memberIds - Array of member UIDs to retrieve
   * @returns A promise that resolves to an array of simplified member records
   */
  async findMembersByIds(
    memberIds: string[]
  ): Promise<Array<{ uid: string; name: string; email: string; accessLevel: string }>> {
    try {
      const members = await this.prisma.member.findMany({
        where: {
          uid: {
            in: memberIds,
          },
          accessLevel: {
            notIn: ['L0', 'L1', 'Rejected'],
          },
          email: {
            not: null,
          },
        },
        select: {
          uid: true,
          name: true,
          email: true,
          accessLevel: true,
        },
      });

      // Filter out any members with null emails (type safety)
      return members.filter(
        (member): member is { uid: string; name: string; email: string; accessLevel: string } => member.email !== null
      );
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Retrieves a member based on unique query options
   * @param queryOptions - Object containing unique field value pairs
   * @returns  A promise resolving to member if found else null
   */
  async findUnique(queryOptions: Prisma.MemberWhereInput): Promise<Member | null> {
    //Ideally this should be findUnique but to handle case insensitive we have done this, we should habdle this with lower case handles when saving
    return await this.prisma.member.findFirst({ where: queryOptions });
  }

  /**
   * This method retrieves the default(Founder, CEO, CTO and COO) and user selected(memberRoles) role's count
   * @param defaultAndUserSelectedRoles An array of role name(default & user selected roles)
   * @param memberRef Array of member UID's
   *   - This member UID's are retrieved from Prisma ORM by applying standard query filters in member & team member role
   * @returns Array of role with count
   */
  private async getRoleCountForDefaultAndUserSelectedRoles(defaultAndUserSelectedRoles, memberRef) {
    try {
      return await this.prisma.$queryRaw`
      SELECT CAST(count(DISTINCT "memberUid") as INTEGER) AS count, role
      FROM (
        SELECT unnest("roleTags") AS role, "memberUid"
        FROM "TeamMemberRole"
      ) AS roles WHERE role IN (SELECT unnest(string_to_array(${defaultAndUserSelectedRoles?.toString()}, ','))) AND
      "memberUid" IN (
        SELECT unnest(string_to_array(${memberRef?.toString()}, ','))
      ) GROUP BY role;
    `;
    } catch (error) {
      this.logger.error('Error while retrieving member role count for default and user selected roles. Error: ', error);
      return {
        statusCode: 500,
        message: 'Error while retrieving member role count for default and user selected roles',
      };
    }
  }

  /**
   * This method retrieves the non default and non user selected(memberRoles) role's count where user search term matches
   * @param defaultAndUserSelectedRoles An array of role name(default & user selected roles)
   * @param memberRef Array of member UID's
   *   - This member UID's are retrieved from Prisma ORM by applying standard query filters in member & team member role
   * @param searchTerm Search text extracted from query params
   * @returns Array of role with count
   */
  private async getRoleCountForExcludedAndNonSelectedRoles(defaultAndUserSelectedRoles, memberRef, searchTerm) {
    try {
      return await this.prisma.$queryRaw`
        SELECT CAST(count(DISTINCT "memberUid") as INTEGER) AS count, role
        FROM (
          SELECT unnest("roleTags") AS role, "memberUid"
          FROM "TeamMemberRole"
        ) AS roles WHERE role NOT IN (SELECT unnest(string_to_array(${defaultAndUserSelectedRoles?.toString()}, ',')))
        AND "memberUid" IN (
          SELECT unnest(string_to_array(${memberRef?.toString()}, ','))
        )
        AND role ILIKE '%' || ${searchTerm} || '%'
        GROUP BY role;
    `;
    } catch (error) {
      this.logger.error('Error while retrieving member role count for excluded and non selected roles. Error: ', error);
      return {
        statusCode: 500,
        message: 'Error while retrieving member role count for excluded and non selected roles',
      };
    }
  }

  /**
   * Retrieves the roles associated with members
   * @param queryOptions
   * @returns
   */
  async getRolesWithCount(queryOptions: Prisma.MemberFindManyArgs, queryParams: any) {
    try {
      const memberRoles = queryParams?.memberRoles?.split(',') || [];
      const searchTerm = queryParams?.searchText || '';
      let members = await this.prisma.member.findMany({
        select: { uid: true },
        where: queryOptions.where,
      });
      members = members?.map((member: any) => member.uid);
      const selectedRoles = Array.from(new Set(Object.keys(DEFAULT_MEMBER_ROLES).concat(memberRoles)));
      const selectedRolesResult: any = await this.getRoleCountForDefaultAndUserSelectedRoles(selectedRoles, members);
      const formattedDefaultRoles: any = [];
      const references = selectedRolesResult.reduce((obj: any, value: any) => {
        obj[value.role] = value;
        return obj;
      }, {});
      selectedRoles.forEach((role: string) => {
        const filtered = references[role];
        const defaultRole = DEFAULT_MEMBER_ROLES[role];
        if (filtered && defaultRole) {
          formattedDefaultRoles.push({ ...defaultRole, ...filtered });
        } else if (filtered && !defaultRole) {
          formattedDefaultRoles.push({ ...filtered });
        } else if (!filtered && defaultRole) {
          formattedDefaultRoles.push({ ...defaultRole, count: 0 });
        }
      });
      if (!searchTerm) {
        return formattedDefaultRoles;
      }
      const result: any = await this.getRoleCountForExcludedAndNonSelectedRoles(selectedRoles, members, searchTerm);
      return [...formattedDefaultRoles, ...result];
    } catch (error) {
      this.logger.error('Error while retrieving member role filters with count. Error: ', error);
      return {
        statusCode: 500,
        message: 'Error while retrieving member role filters with count',
      };
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
      // Detect officeHours change to trigger OH link fix notifications
      const existing = await tx.member.findUnique({ where: { uid }, select: { officeHours: true } });
      const result = await tx.member.update({
        where: { uid },
        data: member,
      });
      await this.cacheService.reset({ service: 'members' });
      // Handle OH link update post-commit best-effort (no transaction dependency)
      if ((member as any)?.officeHours != null && existing?.officeHours !== (member as any)?.officeHours) {
        this.officeHoursService
          .handleLinkUpdated(uid, (member as any)?.officeHours as string)
          .then(() => {
            this.logger.info(`OH link updated for member ${uid}`);
          })
          .catch((e) => {
            this.logger.error('Failed to process OH link update', e);
          });
      }
      return result;
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Retrieves a member record by its UID, with additional relational data.
   * If the member is not found, an exception is thrown.
   *
   * @param uid - The unique identifier (UID) of the member to retrieve.
   * @param queryOptions - Additional query options to customize the search (excluding the 'where' clause).
   * @param tx - An optional Prisma TransactionClient for executing within a transaction.
   * @returns A promise that resolves to the member object, including related data such as image, location,
   *          skills, roles, team roles, and project contributions. Throws an exception if the member is not found.
   */
  async findOne(
    uid: string,
    queryOptions: Omit<Prisma.MemberFindUniqueArgsBase, 'where'> = {},
    tx?: Prisma.TransactionClient
  ): Promise<Member> {
    try {
      const prisma = tx || this.prisma;

      const member = await prisma.member.findUniqueOrThrow({
        where: { uid },
        ...queryOptions,
        include: {
          image: true,
          location: true,
          skills: true,
          memberRoles: true,
          linkedinProfile: true,
          investorProfile: true,
          teamMemberRoles: {
            include: {
              team: {
                include: {
                  logo: true,
                  investorProfile: true,
                },
              },
            },
            where: {
              team: {
                accessLevel: {
                  not: 'L0',
                },
              },
            },
          },
          projectContributions: {
            include: {
              project: {
                include: {
                  logo: true,
                },
              },
            },
          },
          experiences: true,
          eventGuests: {
            where: {
              event: {
                isDeleted: false,
              },
            },
            orderBy: {
              event: {
                startDate: 'desc',
              },
            },
            select: {
              uid: true,
              isHost: true,
              isSpeaker: true,
              isSponsor: true,
              event: {
                select: {
                  uid: true,
                  name: true,
                  type: true,
                  slugURL: true,
                  startDate: true,
                  endDate: true,
                  location: {
                    select: {
                      location: true,
                      timezone: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Only return investor profile for L5 and L6 members
      const memberData = { ...(member as any) };
      if (member.accessLevel !== 'L5' && member.accessLevel !== 'L6') {
        delete memberData.investorProfile;
      }

      return memberData;
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Retrieves a member record by its external ID, with additional relational data.
   *
   * @param externalId - The external ID of the member to find.
   * @returns A promise that resolves to the member object, including associated image, roles, team roles,
   *          and project contributions. If no member is found, it returns `null`.
   */
  async findMemberByExternalId(externalId: string): Promise<Member | null> {
    try {
      return await this.prisma.member.findUnique({
        where: { externalId },
        include: {
          image: true,
          memberRoles: true,
          teamMemberRoles: {
            include: {
              team: true,
            },
          },
          projectContributions: true,
        },
      });
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
      return tx.member.findUniqueOrThrow({
        where: { uid },
        include: {
          image: true,
          location: true,
          skills: true,
          teamMemberRoles: true,
          memberRoles: true,
          projectContributions: true,
        },
      });
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Finds a member by their email address.
   *
   * @param email - The member's email address.
   * @returns The member object if found.
   */
  async findMemberFromEmail(email: string): Promise<Member> {
    try {
      return await this.prisma.member.findUniqueOrThrow({
        where: { email: email.toLowerCase().trim() },
        include: {
          memberRoles: true,
        },
      });
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Retrieves a member by email, including additional data such as roles, teams, and project contributions.
   * Also determines if the member is a Directory Admin.
   *
   * @param userEmail - The email address of the member to retrieve.
   * @returns A promise that resolves to an object containing the member's details, their roles,
   *          and whether they are a Directory Admin. It also returns the teams the member leads.
   *          If the member is not found, it returns `null`.
   */
  async findMemberByEmail(userEmail: string) {
    try {
      const foundMember = await this.prisma.member.findUnique({
        where: {
          email: userEmail.toLowerCase().trim(),
        },
        include: {
          image: true,
          memberRoles: true,
          teamMemberRoles: {
            include: {
              team: true,
            },
          },
          projectContributions: true,
        },
      });
      if (!foundMember) {
        return null;
      }
      const roleNames = foundMember.memberRoles.map((m) => m.name);
      const isDirectoryAdmin = roleNames.includes('DIRECTORYADMIN');
      return {
        ...foundMember,
        isDirectoryAdmin,
        roleNames,
        leadingTeams: foundMember.teamMemberRoles.filter((role) => role.teamLead).map((role) => role.teamUid),
      };
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Sends an OTP (One-Time Password) to the provided email address for verification purposes.
   * This method utilizes the `emailOtpService` to generate and send the OTP.
   *
   * @param newEmailId - The email address to which the OTP should be sent.
   * @returns A promise that resolves when the OTP is successfully sent to the provided email address.
   */
  async sendOtpForEmailChange(newEmailId: string) {
    return await this.emailOtpService.sendEmailOtp(newEmailId);
  }

  /**
   * Updates a member's email address in both the database and the authentication service.
   * This method performs the following operations:
   * - Logs the email change request in the `participantsRequestService` for audit purposes.
   * - Updates the member's email in the database, including associated member roles, images, and team member roles.
   * - Updates the member's email in the authentication service to ensure consistency across services.
   * - Resets the cache to reflect the updated member information.
   * - Logs the successful email update.
   *
   * @param newEmail - The new email address to update.
   * @param oldEmail - The current email address that will be replaced.
   * @param memberInfo - An object containing the member's information, including their unique ID and external ID.
   * @returns A promise that resolves with updated authentication tokens (refresh token, ID token, access token)
   * and the updated member information in the form of `userInfo`.
   *
   * @throws If any operation within the transaction fails, the entire transaction is rolled back.
   */
  async updateMemberEmail(newEmail: string, oldEmail: string, memberInfo) {
    try {
      let newTokens;
      let newMemberInfo;
      await this.prisma.$transaction(async (tx) => {
        await this.participantsRequestService.addRequest(
          {
            status: 'AUTOAPPROVED',
            requesterEmailId: oldEmail,
            referenceUid: memberInfo.uid,
            uniqueIdentifier: oldEmail,
            participantType: 'MEMBER',
            newData: {
              oldEmail: oldEmail,
              email: newEmail,
            },
          },
          null,
          false,
          tx
        );
        newMemberInfo = await tx.member.update({
          where: { email: oldEmail.toLowerCase().trim() },
          data: { email: newEmail.toLowerCase().trim() },
          include: {
            memberRoles: true,
            image: true,
            teamMemberRoles: true,
          },
        });
        newTokens = await this.authService.updateEmailInAuth(newEmail, oldEmail, memberInfo.externalId);
      });
      this.logger.info(`Email has been successfully updated from ${oldEmail} to ${newEmail}`);
      await this.cacheService.reset({ service: 'members' });
      return {
        refreshToken: newTokens.refresh_token,
        idToken: newTokens.id_token,
        accessToken: newTokens.access_token,
        userInfo: this.memberToUserInfo(newMemberInfo),
      };
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Checks if a member exists with the provided email address.
   * The email address is normalized to lowercase and trimmed before querying.
   *
   * @param emailId - The email address to check for an existing member.
   * @returns A boolean value indicating whether the member exists (`true`) or not (`false`).
   */
  async isMemberExistForEmailId(emailId: string): Promise<boolean> {
    const member = await this.findMemberByEmail(emailId);
    return !!member; // Simplified return to directly return boolean
  }

  /**
   * Converts the member entity to a user information object.
   * This method maps necessary member details such as login state, name, email, roles,
   * profile image URL, and teams they lead.
   *
   * @param memberInfo - The member object from the database.
   * @returns A structured user information object containing fields like
   *          isFirstTimeLogin, name, email, profileImageUrl, uid, roles, and leadingTeams.
   */
  private memberToUserInfo(memberInfo) {
    return {
      isFirstTimeLogin: !!memberInfo?.externalId === false,
      name: memberInfo.name,
      email: memberInfo.email,
      profileImageUrl: memberInfo.image?.url ?? null,
      uid: memberInfo.uid,
      roles: memberInfo.memberRoles?.map((r) => r.name) ?? [],
      leadingTeams: memberInfo.teamMemberRoles?.filter((role) => role.teamLead).map((role) => role.teamUid) ?? [],
      accessLevel: memberInfo.accessLevel,
    };
  }

  async setMemberRole(memberUid: string, roleName: string, modifiedByUid?: string) {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
    });

    if (!member) {
      throw new NotFoundException(`Member with uid=${memberUid} not found`);
    }

    const updated = await this.prisma.member.update({
      where: { uid: memberUid },
      data: {
        role: roleName,
        updatedAt: new Date(),
      },
    });

    this.logger.info(
      `Member role changed: uid=${memberUid}, from="${member.role}", to="${roleName}", by=${modifiedByUid}`
    );

    return updated;
  }

  /**
   * Updates the external ID for the member identified by the provided email address.
   * This method normalizes the email address before updating the external ID in the database.
   *
   * @param emailId - The email address of the member whose external ID should be updated.
   * @param externalId - The new external ID to be assigned to the member.
   * @returns The updated member object after the external ID is updated.
   * @throws Error if the member does not exist or the update fails.
   */
  async updateExternalIdByEmail(emailId: string, externalId: string): Promise<Member> {
    try {
      return await this.prisma.member.update({
        where: { email: emailId.toLowerCase().trim() },
        data: { externalId },
      });
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Retrieves a member's GitHub handler based on their UID.
   *
   * @param uid - The UID of the member.
   * @returns The GitHub handler of the member or null if not found.
   */
  private async getMemberGitHubHandler(uid: string): Promise<string | null> {
    try {
      const member = await this.prisma.member.findUnique({
        where: { uid },
        select: { githubHandler: true },
      });
      return member?.githubHandler || null;
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Sends a request to the GitHub GraphQL API to fetch pinned repositories.
   *
   * @param githubHandler - The GitHub username of the member.
   * @returns An array of pinned repositories or an empty array if none are found.
   */
  private async fetchPinnedRepositories(githubHandler: string) {
    const query = {
      query: `{
        user(login: "${githubHandler}") {
          pinnedItems(first: 6, types: REPOSITORY) {
            nodes {
              ... on RepositoryInfo {
                name
                description
                url
                createdAt
                updatedAt
              }
            }
          }
        }
      }`,
    };
    try {
      const response = await axios.post('https://api.github.com/graphql', query, {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      return response?.data?.data?.user?.pinnedItems?.nodes || [];
    } catch (err) {
      this.logger.error('Error fetching pinned repositories from GitHub.', err);
      return [];
    }
  }

  /**
   * Sends a request to the GitHub REST API to fetch recent repositories.
   *
   * @param githubHandler - The GitHub username of the member.
   * @returns An array of recent repositories or an empty array if none are found.
   */
  private async fetchRecentRepositories(githubHandler: string) {
    try {
      const response = await axios.get(`https://api.github.com/users/${githubHandler}/repos?sort=pushed&per_page=50`);
      return (
        response?.data.map((repo) => ({
          name: repo.name,
          description: repo.description,
          url: repo.html_url,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at,
        })) || []
      );
    } catch (err) {
      this.logger.error('Error fetching recent repositories from GitHub.', err);
      return [];
    }
  }

  /**
   * Combines pinned and recent repositories, ensuring no duplicates.
   *
   * @param pinnedRepos - Array of pinned repositories.
   * @param recentRepos - Array of recent repositories.
   * @returns An array of up to 50 combined repositories with pinned ones first.
   */
  private combineRepositories(pinnedRepos, recentRepos) {
    const pinnedRepoNames = new Set(pinnedRepos.map((repo) => repo.name));
    const filteredRecentRepos = recentRepos.filter((repo) => !pinnedRepoNames.has(repo.name));
    return [...pinnedRepos, ...filteredRecentRepos].slice(0, 50);
  }

  /**
   * Fetches a member's GitHub repositories (pinned and recent).
   *
   * @param uid - The UID of the member for whom the GitHub projects are to be fetched.
   * @returns An array of repositories (both pinned and recent), or an error response if something goes wrong.
   */
  async getGitProjects(uid: string) {
    const githubHandler = await this.getMemberGitHubHandler(uid);
    if (!githubHandler) {
      return [];
    }
    try {
      const pinnedRepos = await this.fetchPinnedRepositories(githubHandler);
      const recentRepos = await this.fetchRecentRepositories(githubHandler);
      return this.combineRepositories(pinnedRepos, recentRepos);
    } catch (err) {
      this.logger.error('Error occurred while fetching GitHub projects.', err);
      return {
        statusCode: 500,
        message: 'Internal Server Error.',
      };
    }
  }

  /**
   * Creates a new team from the participants request data.
   * resets the cache, and triggers post-update actions like Airtable synchronization.
   * @param teamParticipantRequest - The request containing the team details.
   * @param requestorEmail - The email of the requestor.
   * @param tx - The transaction client to ensure atomicity
   * @returns The newly created team.
   */
  async createMemberFromParticipantsRequest(
    memberParticipantRequest: ParticipantsRequest,
    tx: Prisma.TransactionClient = this.prisma
  ): Promise<Member> {
    const memberData: any = memberParticipantRequest.newData;
    const { member } = await this.prepareMemberFromParticipantRequest(null, memberData, null, tx);
    await this.mapLocationToMember(memberData, null, member, tx);
    const createdMember = await this.createMember(member, tx);
    await this.membersHooksService.postCreateActions(createdMember, memberParticipantRequest.requesterEmailId);
    return createdMember;
  }

  async createMemberFromSignUpData(memberData: any): Promise<Member> {
    let createdMember: any;
    await this.prisma.$transaction(async (tx) => {
      const { member } = await this.prepareMemberFromParticipantRequest(null, memberData, null, tx);
      member.accessLevel = AccessLevel.L0;
      await this.mapLocationToMember(memberData, null, member, tx);
      createdMember = await this.createMember(member, tx);
      await this.membersHooksService.postCreateActions(createdMember, memberData.email);
    });
    return createdMember;
  }

  async updateMemberFromParticipantsRequest(
    memberUid: string,
    memberParticipantsRequest: ParticipantsRequest,
    requestorEmail: string,
    isDirectoryAdmin = false
  ): Promise<Member> {
    let result;
    await this.prisma.$transaction(async (tx) => {
      const memberData: any = memberParticipantsRequest.newData;
      const existingMember = await this.findMemberByUid(memberUid, tx);
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
      await this.logParticipantRequest(requestorEmail, memberData, existingMember.uid, tx);

      // Handle investor profile updates
      if (investorProfileData) {
        await this.updateMemberInvestorProfile(memberUid, investorProfileData, tx, existingMember.accessLevel);
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
    await this.membersHooksService.postUpdateActions(result, requestorEmail);
    return result;
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
   * Handles investor profile updates for a member
   *
   * @param memberUid - The unique identifier of the member
   * @param investorProfileData - The investor profile data to update
   * @param tx - Transaction client for atomic operations
   * @param memberAccessLevel - The access level of the member to check permissions
   */
  async updateMemberInvestorProfile(
    memberUid: string,
    investorProfileData: any,
    tx: Prisma.TransactionClient,
    memberAccessLevel?: string
  ) {
    // Check if member has permission to update investor profile (L5 or L6)
    if (memberAccessLevel && !['L5', 'L6'].includes(memberAccessLevel)) {
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
          typicalCheckSize: investorProfileData.typicalCheckSize,
          secRulesAccepted: investorProfileData.secRulesAccepted,
          secRulesAcceptedAt,
          type: investorProfileData.type,
          investInStartupStages: investorProfileData.investInStartupStages || [],
          investInFundTypes: investorProfileData.investInFundTypes || [],
        },
      });
    } else {
      // Create new investor profile
      const newInvestorProfile = await tx.investorProfile.create({
        data: {
          investmentFocus: investorProfileData.investmentFocus || [],
          typicalCheckSize: investorProfileData.typicalCheckSize,
          secRulesAccepted: investorProfileData.secRulesAccepted,
          secRulesAcceptedAt,
          type: investorProfileData.type,
          investInStartupStages: investorProfileData.investInStartupStages || [],
          investInFundTypes: investorProfileData.investInFundTypes || [],
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
    const newTeamUids = memberData.teamAndRoles.map((t: any) => t.teamUid);
    // Determine which roles need to be deleted, updated, or created
    const rolesToDelete = existingMember.teamMemberRoles.filter((t: any) => !newTeamUids.includes(t.teamUid));
    const rolesToUpdate = memberData.teamAndRoles.filter((t: any, index: number) => {
      const foundIndex = existingMember.teamMemberRoles.findIndex((v: any) => v.teamUid === t.teamUid);
      if (foundIndex > -1) {
        const foundValue = existingMember.teamMemberRoles[foundIndex];
        if (foundValue.role !== t.role || foundValue.mainTeam !== t.mainTeam) {
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
            : t.role?.split(',').map((item: string) => item.trim());
          return true;
        }
      }
      return false;
    });
    const rolesToCreate = memberData.teamAndRoles.filter((t: any) => !oldTeamUids.includes(t.teamUid));

    let mainTeamIndex = memberData.teamAndRoles.findIndex((t: any) => t.mainTeam === true);

    if (mainTeamIndex === -1) {
      mainTeamIndex = 0;
    }

    // Ensure only one team is marked as mainTeam in the input data
    memberData.teamAndRoles.forEach((team: any, index: number) => {
      team.mainTeam = index === mainTeamIndex;
    });

    // Unset mainTeam for all existing teams that are not the new main team
    if (memberData.teamAndRoles.length > 0) {
      const newMainTeam = memberData.teamAndRoles[mainTeamIndex];
      await tx.teamMemberRole.updateMany({
        where: {
          memberUid,
          teamUid: { not: newMainTeam.teamUid },
          mainTeam: true,
        },
        data: { mainTeam: false },
      });
    }

    // Process deletions, updates, and creations
    await this.deleteTeamMemberRoles(tx, rolesToDelete, memberUid);
    await this.modifyTeamMemberRoles(tx, rolesToUpdate, memberUid);
    await this.createTeamMemberRoles(tx, rolesToCreate, memberUid);

    // Keep all FOUNDER Demo Day participants in sync with the member's current team
    await this.syncFounderParticipantsTeamForMember(memberUid, tx);
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
        role: t.role?.trim(),
        mainTeam: t.mainTeam || false,
        teamLead: false, // Set your default values here if needed
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
            role: roleToUpdate.role?.trim(),
            roleTags: roleToUpdate.roleTags,
            mainTeam: roleToUpdate.mainTeam,
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
          role: t.role?.trim(),
          mainTeam: t.mainTeam || false,
          teamLead: false,
          teamUid: t.teamUid,
          roleTags: t.role?.split(',')?.map((item) => item.trim()),
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
      const updatePromises = contributionIdsToUpdate.map((contribution: any) => {
        // Trim the role field if it exists
        const trimmedContribution = {
          ...contribution,
          ...(contribution.role && { role: contribution.role.trim() }),
        };

        return tx.projectContribution.update({
          where: { uid: contribution.uid },
          data: { ...trimmedContribution },
        });
      });
      await Promise.all(updatePromises);
    }
    if (contributionsToCreate.length > 0) {
      const contributionsToCreateData = contributionsToCreate.map((contribution: any) => ({
        ...contribution,
        memberUid,
        // Trim the role field if it exists
        ...(contribution.role && { role: contribution.role.trim() }),
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
   * Validates if an email change is required and whether the new email is unique.
   * @param isEmailChange - Flag indicating if email is being changed.
   * @param transactionType - Prisma transaction client or Prisma client.
   * @param newEmail - The new email to validate.
   */
  async validateEmailChange(isEmailChange, transactionType, newEmail) {
    if (isEmailChange) {
      const foundUser = await transactionType.member.findUnique({ where: { email: newEmail.toLowerCase().trim() } });
      if (foundUser?.email) {
        throw new BadRequestException('Email already exists. Please try again with a different email.');
      }
    }
  }

  /**
   * Logs the participant request in the participants request table for audit and tracking purposes.
   *
   * @param tx - The transaction client to ensure atomicity
   * @param requestorEmail - Email of the requestor who is updating the team
   * @param newMemberData - The new data being applied to the team
   * @param referenceUid - Unique identifier of the existing team to be referenced
   */
  private async logParticipantRequest(
    requestorEmail: string,
    newMemberData,
    referenceUid: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    await this.participantsRequestService.add(
      {
        status: 'AUTOAPPROVED',
        requesterEmailId: requestorEmail,
        referenceUid,
        uniqueIdentifier: newMemberData?.email || '',
        participantType: 'MEMBER',
        newData: { ...newMemberData },
      },
      tx
    );
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

      const members = await tx.member.findMany({
        where: { uid: { in: memberIds } },
      });
      await Promise.all(
        members.map(async (member) => {
          await this.participantsRequestService.add(
            {
              status: 'AUTOAPPROVED',
              requesterEmailId: userEmail,
              referenceUid: member.uid,
              uniqueIdentifier: member?.email || '',
              participantType: 'MEMBER',
              oldData: {
                isVerified: false,
              },
              newData: {
                isVerified: true,
              },
            },
            tx
          );
        })
      );

      return result;
    });
    await this.cacheService.reset({ service: 'members' });
    return response;
  }

  /**
   * Updates the member's preferences and resets the cache.
   *
   * @param id - The UID of the member.
   * @param preferences - The new preferences data to be updated.
   * @returns The updated member object.
   */
  async updatePreference(id: string, preferences: any): Promise<Member> {
    const updatedMember = await this.updateMemberByUid(id, { preferences });
    await this.cacheService.reset({ service: 'members' });
    return updatedMember;
  }

  /**
   * Retrieves member preferences along with social media handlers.
   *
   * @param uid - The UID of the member.
   * @returns An object containing the member's preferences and handler statuses.
   */
  async getPreferences(uid: string): Promise<any> {
    const member = await this.prisma.member.findUnique({
      where: { uid },
      select: {
        email: true,
        githubHandler: true,
        telegramHandler: true,
        discordHandler: true,
        linkedinHandler: true,
        twitterHandler: true,
        preferences: true,
        isSubscribedToNewsletter: true,
      },
    });
    return this.buildPreferenceResponse(member);
  }

  /**
   * Helper function to build the preference response object.
   *
   * @param member - The member data.
   * @returns The processed preferences and handlers.
   */
  private buildPreferenceResponse(member: any): any {
    const preferences = { ...member.preferences };
    if (!preferences) {
      preferences.isNull = true;
    } else {
      preferences.isNull = false;
    }
    preferences.email = !!member.email;
    preferences.github = !!member.githubHandler;
    preferences.telegram = !!member.telegramHandler;
    preferences.discord = !!member.discordHandler;
    preferences.linkedin = !!member.linkedinHandler;
    preferences.twitter = !!member.twitterHandler;
    preferences.subscription = !!member.isSubscribedToNewsletter;
    return preferences;
  }

  /**
   * Checks if the given member is a team lead for the provided team UID.
   *
   * @param member - The member object.
   * @param teamUid - The UID of the team.
   * @returns True if the member is leading the team, false otherwise.
   */
  async isMemberLeadTeam(member: Member, teamUid: string): Promise<boolean> {
    const userInfo = await this.memberToUserInfo(member);
    return userInfo.leadingTeams.includes(teamUid);
  }

  /**
   * Checks if the given member is a part of the provided teams.
   *
   * @param member - The member object.
   * @param teams - An array of team UIDs.
   * @returns True if the member belongs to any of the provided teams, false otherwise.
   */
  isMemberPartOfTeams(member, teams: string[]): boolean {
    return member.teamMemberRoles.some((role) => teams.includes(role.teamUid));
  }

  /**
   * Checks if the member is an admin.
   *
   * @param member - The member object.
   * @returns True if the member is a directory admin, false otherwise.
   */
  checkIfAdminUser(member): boolean {
    return member.memberRoles.some((role) => role.name === 'DIRECTORYADMIN');
  }

  /**
   * This method constructs a dynamic filter query for retrieving recent members
   * created within a specified number of days, based on the 'recent' query parameter
   * and an environment variable to configure the timeline.
   *
   * @param queryParams - HTTP request query parameters object
   * @returns Constructed query with a 'createdAt' filter if 'recent' is set to 'true',
   *          or an empty object if 'recent' is not provided or set to 'false'.
   */
  buildRecentMembersFilter(queryParams) {
    const { isRecent } = queryParams;
    if (isRecent === 'true') {
      return {
        createdAt: {
          gte: new Date(
            Date.now() - parseInt(process.env.RECENT_RECORD_DURATION_IN_DAYS || '30') * 24 * 60 * 60 * 1000
          ),
        },
      };
    }
    return {};
  }

  /**
   * This method construct the dynamic query to search either by roleTags or
   * by role name from the teamMemberRole table from query params
   * @param queryParams HTTP request query params object
   * @returns Constructed query based on given member role input
   */
  buildRoleFilters(queryParams) {
    const { memberRoles }: any = queryParams;
    const roles = memberRoles?.split(',');
    if (roles?.length > 0) {
      return {
        teamMemberRoles: {
          some: {
            roleTags: { hasSome: roles },
          },
        },
      };
    }
    return {};
  }

  /**
   * This method construct the dynamic query to search the given text in either
   * by member name or by team name from query params
   * @param queryParams HTTP request query params object
   * @returns Constructed query based on given text(name) input
   */
  buildNameFilters(queryParams) {
    const { name__icontains } = queryParams;
    if (name__icontains) {
      return {
        OR: [
          {
            name: {
              contains: name__icontains,
              mode: 'insensitive',
            },
          },
          {
            teamMemberRoles: {
              some: {
                team: {
                  name: {
                    contains: name__icontains,
                    mode: 'insensitive',
                  },
                },
              },
            },
          },
          {
            projectContributions: {
              some: {
                project: {
                  name: {
                    contains: name__icontains,
                    mode: 'insensitive',
                  },
                  isDeleted: false,
                },
              },
            },
          },
        ],
      };
    }
    return {};
  }

  /**
   * Fetches filter tags for members for facilitating easy searching.
   * @param queryParams HTTP request query params object
   * @returns Set of skills, locations that contain at least one member.
   */
  async getMemberFilters(queryParams) {
    const skills = await this.prisma.skill.findMany({
      where: {
        members: {
          some: { ...queryParams.where },
        },
      },
      select: {
        title: true,
      },
    });
    const locations = await this.prisma.location.findMany({
      where: {
        members: {
          some: { ...queryParams.where },
        },
      },
      select: {
        city: true,
        continent: true,
        country: true,
        region: true,
        metroArea: true,
      },
    });

    // Deduplicate cities, countries, and regions using Set
    const uniqueCities = [...new Set(locations.map((location) => location.city).filter(Boolean))];
    const uniqueCountries = [...new Set(locations.map((location) => location.country).filter(Boolean))];
    const uniqueRegions = [...new Set(locations.map((location) => location.continent).filter(Boolean))];
    const uniqueMetroAreas = [...new Set(locations.map((location) => location.metroArea).filter(Boolean))];

    // Return deduplicated skills and locations
    return {
      skills: skills.map((skill) => skill.title),
      cities: uniqueCities,
      countries: uniqueCountries,
      regions: uniqueRegions,
      metroAreas: uniqueMetroAreas,
    };
  }

  /**
   * Updates the member's field if the value has changed.
   *
   * @param member - The member object to check for updates.
   * @param field - The field in the member object that may be updated.
   * @param newValue - The new value to update the field with.
   * @param tx - Optional transaction client.
   * @returns Updated member object if a change was made, otherwise the original member object.
   */
  private async updateFieldIfChanged(
    member: Member,
    field: keyof Member,
    newValue: string,
    tx?: Prisma.TransactionClient
  ): Promise<Member> {
    if (member[field] !== newValue) {
      member = await this.updateMemberByUid(member.uid, { [field]: newValue }, tx);
      await this.cacheService.reset({ service: 'members' });
    }
    return member;
  }

  /**
   * Updates the member's telegram handler if it has changed.
   *
   * @param member - The member object to check for updates.
   * @param telegram - The new telegram handler value.
   * @param tx - Optional transaction client.
   * @returns Updated member object if a change was made, otherwise the original member object.
   */
  async updateTelegramIfChanged(member: Member, telegram: string, tx?: Prisma.TransactionClient): Promise<Member> {
    return await this.updateFieldIfChanged(member, 'telegramHandler', telegram, tx);
  }

  /**
   * Updates the member's office hours if it has changed.
   *
   * @param member - The member object to check for updates.
   * @param officeHours - The new office hours value.
   * @param tx - Optional transaction client.
   * @returns Updated member object if a change was made, otherwise the original member object.
   */
  async updateOfficeHoursIfChanged(
    member: Member,
    officeHours: string,
    tx?: Prisma.TransactionClient
  ): Promise<Member> {
    return await this.updateFieldIfChanged(member, 'officeHours', officeHours, tx);
  }

  /**
   * Advanced member search with filtering
   * @param filters - Filter parameters including office hours, topics, roles, investor filters, and sorting
   * @returns Paginated search results with members and metadata
   */
  async searchMembers(filters: {
    hasOfficeHours?: boolean;
    topics?: string[];
    roles?: string[];
    search?: string;
    sort?: 'name:asc' | 'name:desc';
    page?: number;
    limit?: number;
    // Investor-related filters
    isInvestor?: boolean;
    minTypicalCheckSize?: number;
    maxTypicalCheckSize?: number;
    investmentFocus?: string[];
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    // Base where clause excluding rejected access levels
    const baseWhere: Prisma.MemberWhereInput = {
      accessLevel: {
        notIn: ['L0', 'L1', 'Rejected'],
      },
    };

    const whereConditions: Prisma.MemberWhereInput[] = [baseWhere];

    // Office hours filter
    if (filters.hasOfficeHours) {
      whereConditions.push({
        AND: [
          {
            officeHours: {
              not: null,
            },
          },
          {
            officeHours: {
              not: '',
            },
          },
        ],
      });
    }

    // Topics filter - search across skills, experiences, ohInterest, ohHelpWith
    if (filters.topics && filters.topics.length > 0) {
      // Ensure topics is always an array (query params might come as string)
      const topicsArray = Array.isArray(filters.topics) ? filters.topics : [filters.topics];
      const topicsConditions: Prisma.MemberWhereInput[] = [];

      // Search in skills
      topicsConditions.push({
        skills: {
          some: {
            title: {
              in: topicsArray,
              mode: 'insensitive',
            },
          },
        },
      });

      // Search in member experiences
      topicsConditions.push({
        experiences: {
          some: {
            title: {
              in: topicsArray,
              mode: 'insensitive',
            },
          },
        },
      });

      // Get member IDs that match ohInterest/ohHelpWith topics using raw SQL
      if (topicsArray.length > 0) {
        const [ohInterestMemberIds, ohHelpWithMemberIds] = await Promise.all([
          this.prisma.$queryRaw<{ id: number }[]>`
            SELECT DISTINCT id FROM "Member"
            WHERE ${Prisma.raw(
              topicsArray
                .map(
                  (topic) => `
                  EXISTS (
                    SELECT 1 FROM unnest("ohInterest") AS interest_item
                    WHERE LOWER(interest_item) LIKE LOWER('%${topic.replace(/'/g, "''")}%')
                  )
                `
                )
                .join(' OR ')
            )}
          `,
          this.prisma.$queryRaw<{ id: number }[]>`
            SELECT DISTINCT id FROM "Member"
            WHERE ${Prisma.raw(
              topicsArray
                .map(
                  (topic) => `
                  EXISTS (
                    SELECT 1 FROM unnest("ohHelpWith") AS help_item
                    WHERE LOWER(help_item) LIKE LOWER('%${topic.replace(/'/g, "''")}%')
                  )
                `
                )
                .join(' OR ')
            )}
          `,
        ]);

        const allOhMemberIds = [
          ...ohInterestMemberIds.map((row) => row.id),
          ...ohHelpWithMemberIds.map((row) => row.id),
        ];

        if (allOhMemberIds.length > 0) {
          topicsConditions.push({
            id: {
              in: allOhMemberIds,
            },
          });
        }
      }

      whereConditions.push({
        OR: topicsConditions,
      });
    }

    // Roles filter - search in team roles, experiences, and project contributions
    if (filters.roles && filters.roles.length > 0) {
      // Ensure roles is always an array (query params might come as string)
      const rolesArray = Array.isArray(filters.roles) ? filters.roles : [filters.roles];
      const rolesConditions: Prisma.MemberWhereInput[] = [];

      // Search in team member roles
      rolesConditions.push({
        teamMemberRoles: {
          some: {
            role: {
              in: rolesArray,
              mode: 'insensitive',
            },
          },
        },
      });

      // Search in member experiences (title field)
      rolesConditions.push({
        experiences: {
          some: {
            title: {
              in: rolesArray,
              mode: 'insensitive',
            },
          },
        },
      });

      // Search in project contributions (role field)
      rolesConditions.push({
        projectContributions: {
          some: {
            role: {
              in: rolesArray,
              mode: 'insensitive',
            },
          },
        },
      });

      // Add OR condition to match any of the three sources
      whereConditions.push({
        OR: rolesConditions,
      });
    }

    // Search filter - search by member name and team name
    if (filters.search && filters.search.trim()) {
      const searchTerm = filters.search.trim();
      whereConditions.push({
        OR: [
          {
            name: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
          {
            teamMemberRoles: {
              some: {
                team: {
                  name: {
                    contains: searchTerm,
                    mode: 'insensitive',
                  },
                },
              },
            },
          },
        ],
      });
    }

    // Investor filters
    if (filters.isInvestor) {
      whereConditions.push({
        AND: [
          {
            OR: [
              // Members explicitly marked as investors with L5/L6 access level
              {
                AND: [
                  {
                    isInvestor: true,
                  },
                  {
                    accessLevel: {
                      in: ['L5', 'L6'],
                    },
                  },
                ],
              },
              // Members with L5/L6 access level when isInvestor is null (legacy support)
              {
                AND: [
                  {
                    accessLevel: {
                      in: ['L5', 'L6'],
                    },
                  },
                  {
                    isInvestor: null,
                  },
                ],
              },
            ],
          },
          {
            OR: [
              {
                investorProfile: {
                  secRulesAccepted: true,
                },
              },
              {
                investorProfile: {
                  type: { not: null },
                },
              },
            ],
          },
          // If InvestorProfile.type = 'FUND', member must belong to a team with isFund = true
          {
            OR: [
              // Allow if not FUND type
              {
                investorProfile: {
                  OR: [{ type: { not: 'FUND' } }, { type: { equals: null } }],
                },
              },
              // Or if FUND type, require member to be in a team with isFund = true
              {
                AND: [
                  {
                    investorProfile: {
                      type: 'FUND',
                    },
                  },
                  {
                    teamMemberRoles: {
                      some: {
                        investmentTeam: true,
                        team: {
                          isFund: true,
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
          // If InvestorProfile.type = 'ANGEL', at least one field must be filled
          {
            OR: [
              // Allow if not ANGEL type
              {
                investorProfile: {
                  OR: [{ type: { not: 'ANGEL' } }, { type: { equals: null } }],
                },
              },
              // Or if ANGEL type, at least one field must be filled
              {
                AND: [
                  {
                    investorProfile: {
                      type: 'ANGEL',
                    },
                  },
                  {
                    investorProfile: {
                      OR: [
                        {
                          investInStartupStages: { isEmpty: false },
                        },
                        {
                          typicalCheckSize: { not: null, gt: 0 },
                        },
                        {
                          investmentFocus: { isEmpty: false },
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
          // If InvestorProfile.type = 'ANGEL_AND_FUND', must satisfy at least one of FUND or ANGEL requirements
          {
            OR: [
              // Allow if not ANGEL_AND_FUND type
              {
                investorProfile: {
                  OR: [{ type: { not: 'ANGEL_AND_FUND' } }, { type: { equals: null } }],
                },
              },
              // Or if ANGEL_AND_FUND type, must satisfy at least one requirement
              {
                AND: [
                  {
                    investorProfile: {
                      type: 'ANGEL_AND_FUND',
                    },
                  },
                  {
                    OR: [
                      // FUND requirement: member must be in a team with isFund = true and investmentTeam = true
                      {
                        teamMemberRoles: {
                          some: {
                            investmentTeam: true,
                            team: {
                              isFund: true,
                            },
                          },
                        },
                      },
                      // ANGEL requirement: at least one field must be filled
                      {
                        investorProfile: {
                          OR: [
                            {
                              investInStartupStages: { isEmpty: false },
                            },
                            {
                              typicalCheckSize: { not: null, gt: 0 },
                            },
                            {
                              investmentFocus: { isEmpty: false },
                            },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
    }

    // Typical check size filters
    if (
      (filters.minTypicalCheckSize && Number(filters.minTypicalCheckSize) > 0) ||
      (filters.maxTypicalCheckSize && Number(filters.maxTypicalCheckSize) > 0)
    ) {
      const checkSizeFilter: any = {};

      if (filters.minTypicalCheckSize && Number(filters.minTypicalCheckSize) > 0) {
        checkSizeFilter.gte = Number(filters.minTypicalCheckSize);
      }

      if (filters.maxTypicalCheckSize && Number(filters.maxTypicalCheckSize) > 0) {
        checkSizeFilter.lte = Number(filters.maxTypicalCheckSize);
      }

      whereConditions.push({
        investorProfile: {
          typicalCheckSize: checkSizeFilter,
        },
      });
    }

    // Investment focus filter - using substring matching
    if (filters.investmentFocus && filters.investmentFocus.length > 0) {
      // Ensure investmentFocus is always an array (query params might come as string)
      const focusArray = Array.isArray(filters.investmentFocus) ? filters.investmentFocus : [filters.investmentFocus];

      // Get member IDs that match investment focus using substring matching
      const matchingMemberIds = await this.prisma.$queryRaw<{ id: number }[]>`
        SELECT DISTINCT m.id FROM "Member" m
        INNER JOIN "InvestorProfile" ip ON m."investorProfileId" = ip.uid
        WHERE ${Prisma.raw(
          focusArray
            .map(
              (focus) => `
              EXISTS (
                SELECT 1 FROM unnest(ip."investmentFocus") AS focus_item
                WHERE LOWER(focus_item) LIKE LOWER('%${focus.replace(/'/g, "''")}%')
              )
            `
            )
            .join(' OR ')
        )}
      `;

      if (matchingMemberIds.length > 0) {
        whereConditions.push({
          id: {
            in: matchingMemberIds.map((row) => row.id),
          },
        });
      } else {
        // If no members match, add an impossible condition to return no results
        whereConditions.push({
          id: {
            in: [],
          },
        });
      }
    }

    const where: Prisma.MemberWhereInput = {
      AND: whereConditions,
    };

    // Sorting
    const orderBy: Prisma.MemberOrderByWithRelationInput = {};
    if (filters.sort === 'name:desc') {
      orderBy.name = 'desc';
    } else {
      orderBy.name = 'asc'; // Default to ascending
    }

    try {
      const [members, total] = await Promise.all([
        this.prisma.member.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          select: {
            uid: true,
            name: true,
            accessLevel: true,
            officeHours: true,
            ohStatus: true,
            ohInterest: true,
            ohHelpWith: true,
            openToWork: true,
            scheduleMeetingCount: true,
            role: true,
            image: {
              select: {
                uid: true,
                url: true,
              },
            },
            location: {
              select: {
                uid: true,
                country: true,
                city: true,
              },
            },
            teamMemberRoles: {
              select: {
                role: true,
                mainTeam: true,
                teamLead: true,
                team: {
                  select: {
                    name: true,
                  },
                },
              },
              where: {
                team: {
                  accessLevel: {
                    not: 'L0',
                  },
                },
              },
            },
            skills: {
              select: {
                title: true,
              },
            },
            investorProfile: {
              select: {
                investmentFocus: true,
                investInStartupStages: true,
                investInFundTypes: true,
                type: true,
                typicalCheckSize: true,
                secRulesAccepted: true,
                secRulesAcceptedAt: true,
              },
            },
          },
        }),
        this.prisma.member.count({ where }),
      ]);

      // Filter investorProfile based on access level (only show for L5 and L6 members)
      const filteredMembers = members.map((member) => {
        if (member.accessLevel !== 'L5' && member.accessLevel !== 'L6') {
          return { ...member, investorProfile: null };
        }
        return member;
      });

      return {
        members: filteredMembers,
        total,
        page: Number(page),
        hasMore: page * limit < total,
      };
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Autocomplete topics from skills, experiences, ohInterest, and ohHelpWith
   * @param query - Search query string
   * @param page - Page number for pagination
   * @param limit - Results per page
   * @param hasOfficeHours - Filter by members who have office hours
   * @returns Paginated autocomplete results with counts
   */
  async autocompleteTopics(query: string, page = 1, limit = 20, hasOfficeHours?: boolean) {
    limit = Math.min(limit, 50);
    const skip = (page - 1) * limit;
    const searchQuery = query.toLowerCase();

    try {
      // Build where clause - if no query, get all topics; if query, filter by it
      const titleFilter = query.trim()
        ? {
            contains: searchQuery,
            mode: 'insensitive' as const,
          }
        : undefined;

      // Build member filter for office hours
      const memberFilter: any = {
        accessLevel: {
          notIn: ['L0', 'L1', 'Rejected'],
        },
        ...(hasOfficeHours && {
          AND: [
            {
              officeHours: {
                not: null,
              },
            },
            {
              officeHours: {
                not: '',
              },
            },
          ],
        }),
      };

      // Get skills matching the query with filtered member count
      const skillsPromise = this.prisma.skill.findMany({
        where: {
          ...(titleFilter && { title: titleFilter }),
          members: {
            some: memberFilter,
          },
        },
        select: {
          title: true,
          members: {
            where: memberFilter,
            select: {
              uid: true,
            },
          },
        },
      });

      // Get experiences matching the query with member UIDs
      const experiencesPromise = this.prisma.memberExperience.findMany({
        where: {
          ...(titleFilter && { title: titleFilter }),
          member: memberFilter,
        },
        select: {
          title: true,
          memberUid: true,
        },
      });

      // Get ohInterest and ohHelpWith matching the query using SQL-level filtering
      let ohMemberIds: number[] = [];
      if (query.trim()) {
        // Get member IDs that match the search query in ohInterest or ohHelpWith
        const [ohInterestIds, ohHelpWithIds] = await Promise.all([
          this.prisma.$queryRaw<{ id: number }[]>`
            SELECT DISTINCT id FROM "Member"
            WHERE EXISTS (
              SELECT 1 FROM unnest("ohInterest") AS interest_item
              WHERE LOWER(interest_item) LIKE LOWER(${`%${searchQuery}%`})
            )
          `,
          this.prisma.$queryRaw<{ id: number }[]>`
            SELECT DISTINCT id FROM "Member"
            WHERE EXISTS (
              SELECT 1 FROM unnest("ohHelpWith") AS help_item
              WHERE LOWER(help_item) LIKE LOWER(${`%${searchQuery}%`})
            )
          `,
        ]);

        ohMemberIds = [...ohInterestIds.map((row) => row.id), ...ohHelpWithIds.map((row) => row.id)];
      }

      const ohDataPromise = this.prisma.member.findMany({
        where: {
          ...memberFilter,
          ...(query.trim() &&
            ohMemberIds.length > 0 && {
              id: {
                in: ohMemberIds,
              },
            }),
          // If no query, get members with any ohInterest or ohHelpWith
          ...(!query.trim() && {
            OR: [
              {
                ohInterest: {
                  isEmpty: false,
                },
              },
              {
                ohHelpWith: {
                  isEmpty: false,
                },
              },
            ],
          }),
        },
        select: {
          uid: true,
          ohInterest: true,
          ohHelpWith: true,
        },
      });

      const [skills, experiences, ohData] = await Promise.all([skillsPromise, experiencesPromise, ohDataPromise]);

      // Use a Map to collect unique members per topic
      const topicMemberSets = new Map<string, Set<string>>();

      // Process skills
      skills.forEach((skill) => {
        const topic = skill.title.toLowerCase();
        if (!topicMemberSets.has(topic)) {
          topicMemberSets.set(topic, new Set());
        }
        skill.members.forEach((member) => {
          const memberSet = topicMemberSets.get(topic);
          if (memberSet) {
            memberSet.add(member.uid);
          }
        });
      });

      // Process experiences
      experiences.forEach((exp) => {
        const topic = exp.title.toLowerCase();
        if (!topicMemberSets.has(topic)) {
          topicMemberSets.set(topic, new Set());
        }
        const memberSet = topicMemberSets.get(topic);
        if (memberSet) {
          memberSet.add(exp.memberUid);
        }
      });

      // Process ohInterest and ohHelpWith
      ohData.forEach((member) => {
        member.ohInterest.forEach((interest) => {
          // If no query, include all topics; if query, filter by it
          if (!query.trim() || interest.toLowerCase().includes(searchQuery)) {
            const topic = interest.toLowerCase();
            if (!topicMemberSets.has(topic)) {
              topicMemberSets.set(topic, new Set());
            }
            const memberSet = topicMemberSets.get(topic);
            if (memberSet) {
              memberSet.add(member.uid);
            }
          }
        });
        member.ohHelpWith.forEach((help) => {
          // If no query, include all topics; if query, filter by it
          if (!query.trim() || help.toLowerCase().includes(searchQuery)) {
            const topic = help.toLowerCase();
            if (!topicMemberSets.has(topic)) {
              topicMemberSets.set(topic, new Set());
            }
            const memberSet = topicMemberSets.get(topic);
            if (memberSet) {
              memberSet.add(member.uid);
            }
          }
        });
      });

      // Convert map to array and sort by count descending, then by topic name
      const results = Array.from(topicMemberSets.entries())
        .map(([topic, memberSet]) => ({ topic, count: memberSet.size }))
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.topic.localeCompare(b.topic);
        });

      const paginatedResults = results.slice(skip, skip + limit);

      return {
        results: paginatedResults,
        total: results.length,
        page: Number(page),
        hasMore: skip + limit < results.length,
      };
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Autocomplete roles from team member roles
   * Uses exact matching to ensure consistency with searchMembers endpoint
   * @param query - Search query string
   * @param page - Page number for pagination
   * @param limit - Results per page
   * @param hasOfficeHours - Filter by members who have office hours
   * @returns Paginated autocomplete results with counts
   */
  async autocompleteRoles(query: string, page = 1, limit = 20, hasOfficeHours?: boolean) {
    // Define priority roles that should appear at the top (should be in lower case)
    const priorityRoles = ['founder', 'ceo', 'cto', 'coo'];
    const priorityRolesSet = new Set(priorityRoles);

    limit = Math.min(limit, 50);
    const skip = (page - 1) * limit;

    try {
      // Build member filter for office hours
      const memberFilter: any = {
        accessLevel: {
          notIn: ['L0', 'L1', 'Rejected'],
        },
        ...(hasOfficeHours && {
          AND: [
            {
              officeHours: {
                not: null,
              },
            },
            {
              officeHours: {
                not: '',
              },
            },
          ],
        }),
      };

      // Get all unique member UIDs that match each role from different sources
      // Use normalized role names as keys, but track original case for display
      const roleToMembersMap = new Map<string, Set<string>>();
      const roleDisplayNames = new Map<string, string>(); // normalized -> original case

      // Search in teamMemberRoles
      const teamRoles = await this.prisma.teamMemberRole.findMany({
        where: {
          role: {
            not: null,
            ...(query.trim() && {
              contains: query,
              mode: 'insensitive' as const,
            }),
          },
          member: memberFilter,
        },
        select: {
          role: true,
          memberUid: true,
        },
      });

      // Add team roles (normalize case for grouping)
      teamRoles
        .filter((role) => role.role !== null)
        .forEach((role) => {
          // Normalize the role name for consistent grouping
          const roleStr = role.role as string;
          const normalizedRole = roleStr.toLowerCase();

          // Store the original case for display (first occurrence wins)
          if (!roleToMembersMap.has(normalizedRole)) {
            roleToMembersMap.set(normalizedRole, new Set());
            roleDisplayNames.set(normalizedRole, roleStr);
          }
          const memberSet = roleToMembersMap.get(normalizedRole);
          if (memberSet) {
            memberSet.add(role.memberUid);
          }
        });

      // Search in experiences (title field)
      const experiences = await this.prisma.memberExperience.findMany({
        where: {
          ...(query.trim() && {
            title: {
              contains: query,
              mode: 'insensitive' as const,
            },
          }),
          member: memberFilter,
        },
        select: {
          title: true,
          memberUid: true,
        },
      });

      // Add experience titles (normalize case for grouping)
      experiences
        .filter((exp) => exp.title !== null)
        .forEach((exp) => {
          // Normalize the title for consistent grouping
          const title = exp.title as string;
          const normalizedTitle = title.toLowerCase();

          if (!roleToMembersMap.has(normalizedTitle)) {
            roleToMembersMap.set(normalizedTitle, new Set());
            roleDisplayNames.set(normalizedTitle, title);
          }
          const memberSet = roleToMembersMap.get(normalizedTitle);
          if (memberSet) {
            memberSet.add(exp.memberUid);
          }
        });

      // Search in projectContributions (role field)
      const projectRoles = await this.prisma.projectContribution.findMany({
        where: {
          role: {
            not: null,
            ...(query.trim() && {
              contains: query,
              mode: 'insensitive' as const,
            }),
          },
          member: memberFilter,
        },
        select: {
          role: true,
          memberUid: true,
        },
      });

      // Add project contribution roles (normalize case for grouping)
      projectRoles
        .filter((proj) => proj.role !== null)
        .forEach((proj) => {
          // Normalize the role for consistent grouping
          const role = proj.role as string;
          const normalizedRole = role.toLowerCase();

          if (!roleToMembersMap.has(normalizedRole)) {
            roleToMembersMap.set(normalizedRole, new Set());
            roleDisplayNames.set(normalizedRole, role);
          }
          const memberSet = roleToMembersMap.get(normalizedRole);
          if (memberSet) {
            memberSet.add(proj.memberUid);
          }
        });

      // Convert map to array and categorize results
      const allResults = Array.from(roleToMembersMap.entries()).map(([normalizedRole, memberSet]) => ({
        role: roleDisplayNames.get(normalizedRole) || normalizedRole, // Use original case for display
        count: memberSet.size,
        normalizedRole: normalizedRole,
      }));

      // Separate priority roles from other results
      const priorityResults: Array<{ role: string; count: number; normalizedRole: string }> = [];
      const otherResults: Array<{ role: string; count: number; normalizedRole: string }> = [];

      allResults.forEach((result) => {
        if (priorityRolesSet.has(result.normalizedRole)) {
          priorityResults.push(result);
        } else {
          otherResults.push(result);
        }
      });

      // Sort priority results by the predefined order, other results by count
      priorityResults.sort((a, b) => {
        return priorityRoles.indexOf(a.normalizedRole) - priorityRoles.indexOf(b.normalizedRole);
      });
      otherResults.sort((a, b) => b.count - a.count);

      // Ensure all priority roles are included even if they don't exist in the data yet
      const finalPriorityResults: Array<{ role: string; count: number }> = [];

      // Add priority roles that exist with count > 0
      priorityRoles.forEach((priorityRole) => {
        const found = priorityResults.find((r) => r.normalizedRole === priorityRole);
        if (found && found.count > 0) {
          finalPriorityResults.push({ role: found.role, count: found.count });
        }
      });

      // Combine results: priority roles first, then others
      const results = [...finalPriorityResults, ...otherResults.map(({ role, count }) => ({ role, count }))];

      const paginatedResults = results.slice(skip, skip + limit);

      return {
        results: paginatedResults,
        total: results.length,
        page: Number(page),
        hasMore: skip + limit < results.length,
      };
    } catch (error) {
      return this.handleErrors(error);
    }
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
          throw new ConflictException('Unique key constraint error on Member:', error.message);
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

  async insertManyWithLocationsFromAirtable(airtableMembers: z.infer<typeof AirtableMemberSchema>[]) {
    const skills = await this.prisma.skill.findMany();
    const images = await this.prisma.image.findMany();

    for (const member of airtableMembers) {
      if (!member.fields?.Name) {
        continue;
      }

      let image;

      if (member.fields['Profile picture']) {
        const ppf = member.fields['Profile picture'][0];

        const hashedPpf = ppf.filename ? hashFileName(`${path.parse(ppf.filename).name}-${ppf.id}`) : '';

        image =
          images.find((image) => path.parse(image.filename).name === hashedPpf) ||
          (await this.fileMigrationService.migrateFile({
            id: ppf.id || '',
            url: ppf.url || '',
            filename: ppf.filename || '',
            size: ppf.size || 0,
            type: ppf.type || '',
            height: ppf.height || 0,
            width: ppf.width || 0,
          }));
      }

      const optionalFieldsToAdd = Object.entries({
        email: 'Email',
        githubHandler: 'Github Handle',
        discordHandler: 'Discord handle',
        twitterHandler: 'Twitter',
        officeHours: 'Office hours link',
      }).reduce(
        (optionalFields, [prismaField, airtableField]) => ({
          ...optionalFields,
          ...(member.fields?.[airtableField] && {
            [prismaField]: member.fields?.[airtableField],
          }),
        }),
        {}
      );

      const manyToManyRelations = {
        skills: {
          connect: skills
            .filter((skill) => !!member.fields?.['Skills'] && member.fields?.['Skills'].includes(skill.title))
            .map((skill) => ({ id: skill.id })),
        },
      };

      const { location } = await this.locationTransferService.transferLocation(member);

      await this.prisma.member.upsert({
        where: {
          airtableRecId: member.id,
        },
        update: {
          ...optionalFieldsToAdd,
          ...manyToManyRelations,
        },
        create: {
          airtableRecId: member.id,
          name: member.fields.Name,
          plnFriend: member.fields['Friend of PLN'] || false,
          locationUid: location ? location?.uid : null,
          imageUid: image?.uid,
          ...optionalFieldsToAdd,
          ...manyToManyRelations,
        },
      });
    }
  }

  async findMemberByRole() {
    const member = await this.prisma.member.findFirst({
      where: {
        memberRoles: {
          some: {
            name: 'DIRECTORYADMIN', // Adjust this based on the actual field name in your schema
          },
        },
      },
      select: {
        uid: true,
        email: true,
        name: true,
      },
    });
    return member;
  }

  /**
   * This method construct the dynamic query to search the member by
   * their participation type i.e isHost only, isSpeaker only, or both host and speaker
   * @param queryParams HTTP request query params object
   * @returns Constructed query based on given participation type
   */
  buildParticipationTypeFilter(queryParams) {
    const isHost = queryParams.isHost === 'true';
    const isSpeaker = queryParams.isSpeaker === 'true';
    const isSponsor = queryParams.isSponsor === 'true';
    if (isHost || isSpeaker || isSponsor) {
      return {
        eventGuests: {
          some: {
            isHost: isHost,
            isSpeaker: isSpeaker,
            isSponsor: isSponsor,
          },
        },
      };
    }
    return {};
  }

  async findByExternalId(externalId: string) {
    const member = await this.prisma.member.findFirst({
      where: { externalId },
      include: {
        image: true,
        memberRoles: true,
        teamMemberRoles: {
          include: {
            team: {
              include: { logo: true },
            },
          },
          where: {
            team: {
              accessLevel: {
                not: 'L0',
              },
            },
          },
        },
        investorProfile: true,
      },
    });

    if (member) {
      // Only return investor profile for L5 and L6 members
      if (member.accessLevel !== 'L5' && member.accessLevel !== 'L6') {
        return { ...member, investorProfile: null };
      }
      return member;
    }

    return member;
  }

  /**
   * Retrieves members for NodeBB forum service by UIDs or external IDs.
   * Returns the specific fields needed by the forum service.
   *
   * @param memberIds - Array of member UIDs to retrieve (optional)
   * @param externalIds - Array of external IDs to retrieve (optional)
   * @returns A promise that resolves to an array of member records with forum-specific fields
   */
  async findMembersBulk(memberIds?: string[], externalIds?: string[]): Promise<any[]> {
    try {
      if (!memberIds?.length && !externalIds?.length) {
        return [];
      }

      const whereConditions: any[] = [];

      if (memberIds?.length) {
        whereConditions.push({
          uid: {
            in: memberIds,
          },
        });
      }

      if (externalIds?.length) {
        whereConditions.push({
          externalId: {
            in: externalIds,
          },
        });
      }

      const members = await this.prisma.member.findMany({
        where: {
          OR: whereConditions,
        },
        select: {
          uid: true,
          name: true,
          externalId: true,
          email: true,
          accessLevel: true,
          officeHours: true,
          ohStatus: true,
          image: {
            select: {
              uid: true,
              url: true,
              filename: true,
            },
          },
          memberRoles: {
            select: {
              name: true,
            },
          },
          teamMemberRoles: {
            select: {
              role: true,
              mainTeam: true,
              teamLead: true,
              team: {
                select: {
                  name: true,
                  logo: {
                    select: {
                      uid: true,
                      url: true,
                      filename: true,
                    },
                  },
                },
              },
            },
            where: {
              team: {
                accessLevel: {
                  not: 'L0',
                },
              },
            },
          },
          investorProfile: {
            select: {
              investmentFocus: true,
              investInStartupStages: true,
              investInFundTypes: true,
              type: true,
              typicalCheckSize: true,
              secRulesAccepted: true,
              secRulesAcceptedAt: true,
            },
          },
        },
      });

      // Apply conditional logic to only return investor profile for L5 and L6 members
      return members.map((member) => {
        if (member.accessLevel !== 'L5' && member.accessLevel !== 'L6') {
          return { ...member, investorProfile: null };
        }
        return member;
      });
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  private async syncFounderParticipantsTeamForMember(
    memberUid: string,
    tx: Prisma.TransactionClient
  ): Promise<{ changed: boolean; oldTeamUid: string | null; newTeamUid: string | null }> {
    this.logger.info(`[FounderSync] start memberUid=${memberUid}`);
    // 1) Get all roles for the member (we'll decide the "current team" in code)
    const roles = await tx.teamMemberRole.findMany({
      where: { memberUid },
      select: { teamUid: true, mainTeam: true, startDate: true, id: true },
      // No createdAt in schema -> sort by startDate asc, then by id asc to get stable "first"
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });

    // 2) Decide the target team:
    //    - prefer role with mainTeam === true
    //    - otherwise take the first role (by startDate/id)
    const preferred = roles.find((r) => r.mainTeam === true);
    const newTeamUid = preferred?.teamUid ?? roles[0]?.teamUid ?? null;

    // 3) Load current Demo Day founder participants' team mapping
    const founderParticipants = await tx.demoDayParticipant.findMany({
      where: { memberUid, type: 'FOUNDER', isDeleted: false },
      select: { uid: true, teamUid: true },
    });
    this.logger.info(
      `[FounderSync] resolved team memberUid=${memberUid} preferredMain=${Boolean(preferred)} newTeamUid=${
        newTeamUid ?? 'null'
      }`
    );
    // If there are no FOUNDER participants, nothing to do
    if (founderParticipants.length === 0) {
      this.logger.info(`[FounderSync] no FOUNDER participants — nothing to do memberUid=${memberUid}`);
      return { changed: false, oldTeamUid: null, newTeamUid };
    }

    // 4) Check whether anything actually needs to change
    //    - If newTeamUid is null: we should clear any non-null teamUid
    //    - If newTeamUid is non-null: every participant must have exactly that teamUid
    const allAlreadyCorrect = founderParticipants.every((fp) => fp.teamUid === newTeamUid);

    if (allAlreadyCorrect) {
      this.logger.info(`[FounderSync] already in sync memberUid=${memberUid} teamUid=${newTeamUid ?? 'null'}`);
      return {
        changed: false,
        oldTeamUid: founderParticipants[0]?.teamUid ?? null,
        newTeamUid,
      };
    }

    // 5) Perform minimal update:
    if (newTeamUid) {
      // Set new teamUid for any that are null or different
      const res = await tx.demoDayParticipant.updateMany({
        where: {
          memberUid,
          type: 'FOUNDER',
          isDeleted: false,
          OR: [{ teamUid: null }, { teamUid: { not: newTeamUid } }],
        },
        data: { teamUid: newTeamUid },
      });
      this.logger.info(
        `[FounderSync] updated teamUid for founders memberUid=${memberUid} updatedRows=${res.count} to=${newTeamUid}`
      );
      return {
        changed: res.count > 0,
        oldTeamUid: founderParticipants[0]?.teamUid ?? null,
        newTeamUid,
      };
    } else {
      // No teams now -> clear teamUid on all FOUNDER participants that currently have a value
      const res = await tx.demoDayParticipant.updateMany({
        where: {
          memberUid,
          type: 'FOUNDER',
          isDeleted: false,
          teamUid: { not: null },
        },
        data: { teamUid: null },
      });
      this.logger.info(`[FounderSync] cleared teamUid for founders memberUid=${memberUid} clearedRows=${res.count}`);
      return {
        changed: res.count > 0,
        oldTeamUid: founderParticipants[0]?.teamUid ?? null,
        newTeamUid: null,
      };
    }
  }

  /**
   * Updates a member's investor setting.
   * Only changes the isInvestor flag.
   *
   * @param memberUid - The UID of the member
   * @param isInvestor - Whether the member should be marked as an investor
   * @returns The updated investor setting
   */
  async updateMemberInvestorSetting(memberUid: string, isInvestor: boolean) {
    try {
      const member = await this.prisma.member.findUnique({
        where: { uid: memberUid },
        select: {
          uid: true,
          isInvestor: true,
        },
      });

      if (!member) {
        throw new NotFoundException('Member not found');
      }

      // If already at the requested setting, return as-is
      if (member.isInvestor === isInvestor) {
        return { isInvestor: member.isInvestor ?? false };
      }

      // Update only the member's investor setting
      await this.prisma.member.update({
        where: { uid: memberUid },
        data: {
          isInvestor,
        },
      });

      // Reset cache after update
      await this.cacheService.reset({ service: 'members' });

      this.logger.info(`Member investor setting updated: memberUid=${memberUid}, isInvestor=${isInvestor}`);

      return { isInvestor };
    } catch (error) {
      this.logger.error(`Error updating member investor setting: memberUid=${memberUid}`, error);
      throw error;
    }
  }

  /**
   * Gets a member's investor settings.
   *
   * @param memberUid - The UID of the member
   * @returns The member's investor setting
   */
  async getMemberInvestorSetting(memberUid: string) {
    try {
      const member = await this.prisma.member.findUnique({
        where: { uid: memberUid },
        select: {
          isInvestor: true,
        },
      });

      if (!member) {
        throw new NotFoundException('Member not found');
      }

      return { isInvestor: typeof member.isInvestor === 'boolean' ? member.isInvestor : null };
    } catch (error) {
      this.logger.error(`Error getting member investor setting: memberUid=${memberUid}`, error);
      throw error;
    }
  }

  /**
   * Creates a member (L0) from sign-up data and, if requested,
   * sets Member.role, creates/links a Team, and assigns a free-text team role.
   */
  public async createMemberAndAttach(
    signUpDto: any,
    options: {
      role?: string;
      team?: { uid?: string; name?: string; website?: string } | string;
      isTeamNew?: boolean;
      website?: string | null;
      requestorEmail?: string;
      project?: { projectUid?: string } | string;
    }
  ): Promise<{ uid: string }> {
    // create a new member with accessLevel=L0 (existing flow)
    const member = await this.createMemberFromSignUpData(signUpDto);

    // in one txn — persist Member.role (if provided) and handle team + role
    await this.prisma.$transaction(async (tx) => {
      // persist Member.role from request (even if no team is provided)
      if (options?.role) {
        await tx.member.update({
          where: { uid: member.uid },
          data: { role: options.role.trim() },
        });
      }

      // create/resolve team and upsert TeamMemberRole
      await this.attachTeamAndRoleTx(tx, member.uid, options);
      await this.attachProjectTx(tx, member.uid, options.project, options.role);
    });

    return { uid: member.uid };
  }

  /**
   * Within a transaction: create OR resolve team and upsert TeamMemberRole (free-text role).
   * - If no team provided -> nothing to do.
   * - If isTeamNew -> create Team via TeamsService.createTeam
   * - Else -> resolve by uid or name
   * - Finally -> upsert teamMemberRole (memberUid, teamUid)
   */
  private async attachTeamAndRoleTx(
    tx: Prisma.TransactionClient,
    memberUid: string,
    opts: {
      role?: string;
      team?: { uid?: string; name?: string; website?: string } | string;
      isTeamNew?: boolean;
      website?: string | null;
      requestorEmail?: string;
    }
  ): Promise<void> {
    this.logger.info(
      `[attachTeamAndRoleTx] Start. memberUid=${memberUid}, opts=${JSON.stringify(
        opts
      )}`
    );

    const { team, isTeamNew, role } = opts ?? {};
    if (!team) {
      this.logger.info(
        `[attachTeamAndRoleTx] No team provided → exiting without changes`
      );
      return;
    }

    const norm = this.normalizeTeamInput(team);

    // ==================================================
    // CASE 1: User requests to create a NEW TEAM (isTeamNew = true)
    // ==================================================
    if (isTeamNew) {
      this.logger.info(
        `[attachTeamAndRoleTx] Creating NEW TEAM request instead of direct team creation`
      );

      const name =
        (norm.name && norm.name.trim()) || `team-${memberUid}`; // fallback name
      const website = (norm.website ?? opts.website) || null;

      if (!opts.requestorEmail) {
        this.logger.error(
          `[attachTeamAndRoleTx] Missing requesterEmail → cannot proceed`
        );
        throw new BadRequestException(
          'Requester email is required to create a new team request'
        );
      }

      const requesterEmail = opts.requestorEmail.toLowerCase().trim();

      this.logger.info(
        `[attachTeamAndRoleTx] Validating unique team identifier: ${name}`
      );

      // Ensure team name is unique across Teams + ParticipantsRequest
      await this.participantsRequestService.validateUniqueIdentifier(
        ParticipantType.TEAM,
        name
      );

      this.logger.info(
        `[attachTeamAndRoleTx] Creating ParticipantsRequest: TEAM / PENDING`
      );

      // Create PENDING Team Request (instead of creating team directly)
      await this.participantsRequestService.addRequest(
        {
          participantType: ParticipantType.TEAM,
          status: ApprovalStatus.PENDING,
          requesterEmailId: requesterEmail,
          uniqueIdentifier: name,
          newData: {
            name,
            website: website || undefined,
          } as any,
        } as any,
        undefined, // requesterUser (undefined → no auto-approval)
        false,     // disableNotification = false → send notifications
        tx
      );

      this.logger.info(
        `[attachTeamAndRoleTx] NEW TEAM REQUEST created successfully (PENDING). name=${name}`
      );

      // IMPORTANT:
      // We DO NOT attach a role, because the team is not created yet.
      this.logger.info(
        `[attachTeamAndRoleTx] Exiting — team is pending approval, no TeamMemberRole created`
      );

      return;
    }

    // ==================================================
    // CASE 2: Attach MEMBER to EXISTING TEAM
    // ==================================================
    this.logger.info(
      `[attachTeamAndRoleTx] Attaching member to EXISTING team`
    );

    let targetTeamUid: string;

    // Try lookup by UID
    let existing: { uid: string } | null = null;
    if (norm.uid) {
      this.logger.info(
        `[attachTeamAndRoleTx] Searching team by UID=${norm.uid}`
      );
      existing = await this.teamService
        .findTeamByUid(norm.uid)
        .catch(() => null);
    }

    if (!existing && norm.name) {
      this.logger.info(
        `[attachTeamAndRoleTx] Searching team by NAME=${norm.name}`
      );
      existing = await this.teamService
        .findTeamByName(norm.name)
        .catch(() => null);
    }

    if (!existing) {
      this.logger.error(
        `[attachTeamAndRoleTx] Team not found by uid or name. norm=${JSON.stringify(
          norm
        )}`
      );
      throw new NotFoundException('Existing team not found by uid or name');
    }

    targetTeamUid = existing.uid;

    this.logger.info(
      `[attachTeamAndRoleTx] Existing team resolved. teamUid=${targetTeamUid}`
    );

    // Prepare role
    const finalRole = (role ?? 'member').trim();
    const roleTags = finalRole
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    this.logger.info(
      `[attachTeamAndRoleTx] Upserting TeamMemberRole for memberUid=${memberUid}, teamUid=${targetTeamUid}, role=${finalRole}`
    );

    // Upsert (create or update) role
    await tx.teamMemberRole.upsert({
      where: { memberUid_teamUid: { memberUid, teamUid: targetTeamUid } },
      create: {
        memberUid,
        teamUid: targetTeamUid,
        role: finalRole,
        roleTags,
        mainTeam: false,
        teamLead: false,
      },
      update: {
        role: finalRole,
        roleTags,
      },
    });

    this.logger.info(
      `[attachTeamAndRoleTx] TeamMemberRole updated successfully for teamUid=${targetTeamUid}`
    );
  }

  /** Accepts string (treated as name) or object with { uid|name|website } */
  private normalizeTeamInput(team: { uid?: string; name?: string; website?: string } | string): {
    uid?: string;
    name?: string;
    website?: string;
  } {
    if (typeof team === 'string') {
      return { name: team.trim() };
    }
    return {
      uid: team.uid?.trim(),
      name: team.name?.trim(),
      website: team.website?.trim(),
    };
  }

  private async attachProjectTx(
    tx: Prisma.TransactionClient,
    memberUid: string,
    project?: { projectUid?: string } | string,
    role?: string
  ): Promise<void> {
    if (!project) return;

    const projectUid = typeof project === 'string' ? project.trim() : project.projectUid?.trim();

    if (!projectUid) return;

    const exists = await tx.project.findUnique({
      where: { uid: projectUid },
      select: { uid: true },
    });

    if (!exists) {
      this.logger.info(`attachProjectTx: project ${projectUid} not found, skipping`);
      return;
    }

    await tx.projectContribution.create({
      data: {
        memberUid,
        projectUid,
        role: role ?? null,
      },
    });
  }
}
