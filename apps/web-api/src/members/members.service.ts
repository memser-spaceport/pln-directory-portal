import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  Inject,
  Injectable,
  forwardRef
} from '@nestjs/common';
import { z } from 'zod';
import axios from 'axios';
import * as path from 'path';
import { Prisma, Member, ParticipantsRequest } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { AirtableMemberSchema } from '../utils/airtable/schema/airtable-member.schema';
import { FileMigrationService } from '../utils/file-migration/file-migration.service';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { NotificationService } from '../utils/notification/notification.service';
import { EmailOtpService } from '../otp/email-otp.service';
import { AuthService } from '../auth/auth.service';
import { LogService } from '../shared/log.service';
import { CREATE, DEFAULT_MEMBER_ROLES, UPDATE } from '../utils/constants';
import { hashFileName } from '../utils/hashing';
import { copyObj, buildMultiRelationMapping } from '../utils/helper/helper';
import { CacheService } from '../utils/cache/cache.service';
import { HuskyRevalidationService } from '../husky/husky-revalidation.service';

@Injectable()
export class MembersService {
  constructor(
    private prisma: PrismaService,
    private locationTransferService: LocationTransferService,
    private fileMigrationService: FileMigrationService,
    private emailOtpService: EmailOtpService,
    private authService: AuthService,
    private logger: LogService,
    private forestadminService: ForestAdminService,
    @Inject(forwardRef(() => ParticipantsRequestService))
    private participantsRequestService: ParticipantsRequestService,
    @Inject(forwardRef(() => NotificationService))
    private notificationService: NotificationService,
    private cacheService: CacheService,
    private huskyRevalidationService: HuskyRevalidationService
  ) { }

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
  async findAll(queryOptions: Prisma.MemberFindManyArgs): Promise<{ count: Number, members: Member[] }> {
    try {
      const [members, membersCount] = await Promise.all([
        this.prisma.member.findMany(queryOptions),
        this.prisma.member.count({ where: queryOptions.where }),
      ]);
      return { count: membersCount, members: members }
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
        message: 'Error while retrieving member role count for default and user selected roles'
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
        message: 'Error while retrieving member role count for excluded and non selected roles'
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
        message: 'Error while retrieving member role filters with count'
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
    tx: Prisma.TransactionClient = this.prisma,
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
      return await (tx || this.prisma).member.findUniqueOrThrow({
        where: { uid },
        ...queryOptions,
        include: {
          image: true,
          location: true,
          skills: true,
          memberRoles: true,
          teamMemberRoles: {
            include: {
              team: {
                include: {
                  logo: true,
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
          eventGuests: {
            orderBy: {
              event: {
                startDate: 'desc'
              },
            },
            select: {
              uid: true,
              isHost: true,
              isSpeaker: true,
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
                    }
                  },
                }
              },
            },
          },
        },
      });
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
          teamMemberRoles: true,
          projectContributions: true,
        }
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
          projectContributions: true
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
          memberRoles: true
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
          teamMemberRoles: true,
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
        leadingTeams: foundMember.teamMemberRoles
          .filter((role) => role.teamLead)
          .map((role) => role.teamUid),
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
        await this.participantsRequestService.addRequest({
          status: 'AUTOAPPROVED',
          requesterEmailId: oldEmail,
          referenceUid: memberInfo.uid,
          uniqueIdentifier: oldEmail,
          participantType: 'MEMBER',
          newData: {
            oldEmail: oldEmail,
            email: newEmail
          }
        },
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
          }
        })
        newTokens = await this.authService.updateEmailInAuth(newEmail, oldEmail, memberInfo.externalId)
      });
      this.logger.info(`Email has been successfully updated from ${oldEmail} to ${newEmail}`)
      await this.cacheService.reset({ service: 'members' });
      return {
        refreshToken: newTokens.refresh_token,
        idToken: newTokens.id_token,
        accessToken: newTokens.access_token,
        userInfo: this.memberToUserInfo(newMemberInfo)
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
      leadingTeams: memberInfo.teamMemberRoles?.filter((role) => role.teamLead)
        .map(role => role.teamUid) ?? []
    };
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
      const response = await axios.post(
        'https://api.github.com/graphql',
        query,
        {
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
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
      const response = await axios.get(
        `https://api.github.com/users/${githubHandler}/repos?sort=pushed&per_page=50`
      );
      return response?.data.map((repo) => ({
        name: repo.name,
        description: repo.description,
        url: repo.html_url,
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
      })) || [];
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
    const member = await this.prepareMemberFromParticipantRequest(null, memberData, null, tx);
    await this.mapLocationToMember(memberData, null, member, tx);
    const createdMember = await this.createMember(member, tx);
    await this.postCreateActions(createdMember.uid, CREATE);
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
      this.logger.info(`Member update request - Initiaing update for member uid - ${existingMember.uid}, requestId -> ${memberUid}`)
      const member = await this.prepareMemberFromParticipantRequest(memberUid, memberData, existingMember, tx, 'Update');
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
      if (isEmailChanged && isDirectoryAdmin) {
        this.notificationService.notifyForMemberChangesByAdmin(memberData.name, memberUid, existingMember.email, memberData.email);
      }
      this.logger.info(`Member update request - completed, requestId -> ${result.uid}, requestor -> ${requestorEmail}`)
    });
    await this.postUpdateActions(memberUid, UPDATE);
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
  async checkIfEmailChanged(
    memberData,
    existingMember,
    transactionType: Prisma.TransactionClient,
  ): Promise<boolean> {
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
    type: string = 'Create'
  ) {
    const member: any = {};
    const directFields = [
      'name', 'email', 'githubHandler', 'discordHandler', 'bio',
      'twitterHandler', 'linkedinHandler', 'telegramHandler',
      'officeHours', 'moreDetails', 'plnStartDate', 'plnFriend', 'openToWork',
      'isVerified', 'signUpSource', 'signUpMedium', 'signUpCampaign',
      'isUserConsent', 'isSubscribedToNewsletter', 'teamOrProjectURL',
    ];
    copyObj(memberData, member, directFields);
    member.email = member.email.toLowerCase().trim();
    member['image'] = memberData.imageUid ? { connect: { uid: memberData.imageUid } }
      : type === 'Update' ? { disconnect: true } : undefined;
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
    return member;
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
    tx: Prisma.TransactionClient,
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
  async updateTeamMemberRoles(
    memberData,
    existingMember,
    memberUid,
    tx: Prisma.TransactionClient,
  ) {
    const oldTeamUids = existingMember.teamMemberRoles.map((t: any) => t.teamUid);
    const newTeamUids = memberData.teamAndRoles.map((t: any) => t.teamUid);
    // Determine which roles need to be deleted, updated, or created
    const rolesToDelete = existingMember.teamMemberRoles.filter(
      (t: any) => !newTeamUids.includes(t.teamUid)
    );
    const rolesToUpdate = memberData.teamAndRoles.filter((t: any, index: number) => {
      const foundIndex = existingMember.teamMemberRoles.findIndex(
        (v: any) => v.teamUid === t.teamUid
      );
      if (foundIndex > -1) {
        const foundValue = existingMember.teamMemberRoles[foundIndex];
        if (foundValue.role !== t.role) {
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
    const rolesToCreate = memberData.teamAndRoles.filter(
      (t: any) => !oldTeamUids.includes(t.teamUid)
    );
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
  async createTeamMemberRoles(
    tx: Prisma.TransactionClient,
    rolesToCreate: any[],
    memberUid: string
  ) {
    if (rolesToCreate.length > 0) {
      const rolesToCreateData = rolesToCreate.map((t: any) => ({
        role: t.role,
        mainTeam: false, // Set your default values here if needed
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
  async deleteTeamMemberRoles(
    tx: Prisma.TransactionClient,
    rolesToDelete,
    memberUid: string
  ) {
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
  async modifyTeamMemberRoles(
    tx: Prisma.TransactionClient,
    rolesToUpdate,
    memberUid: string
  ): Promise<void> {
    if (rolesToUpdate.length > 0) {
      const updatePromises = rolesToUpdate.map((roleToUpdate: any) =>
        tx.teamMemberRole.update({
          where: {
            memberUid_teamUid: {
              teamUid: roleToUpdate.teamUid,
              memberUid,
            },
          },
          data: { role: roleToUpdate.role, roleTags: roleToUpdate.roleTags },
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
          role: t.role,
          mainTeam: false,
          teamLead: false,
          teamUid: t.teamUid,
          roleTags: t.role?.split(',')?.map(item => item.trim()),
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
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const contributionsToCreate = memberData.projectContributions?.filter(
      (contribution) => !contribution.uid
    ) || [];
    const contributionUidsInRequest = memberData.projectContributions
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
      this.logger.error(`Member update request - Failed to update email, requestId -> ${uidToEdit}, error -> ${error.message}`);
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
        this.logger.error(`External account not found for deletion, externalId -> ${externalId}, requestId -> ${uidToEdit}`);
      } else {
        this.logger.error(`Failed to delete external account, externalId -> ${externalId}, requestId -> ${uidToEdit}, error -> ${error.message}`);
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
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.participantsRequestService.add({
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
          isVerified: true
        }
      });
      if (result.count !== memberIds.length) {
        throw new NotFoundException('One or more member IDs are invalid.');
      }
      const members = await tx.member.findMany({
        where: { uid: { in: memberIds } }
      })
      await Promise.all(members.map(async (member) => {
        await this.participantsRequestService.add({
          status: 'AUTOAPPROVED',
          requesterEmailId: userEmail,
          referenceUid: member.uid,
          uniqueIdentifier: member?.email || '',
          participantType: 'MEMBER',
          oldData: {
            isVerified: false
          },
          newData: {
            isVerified: true
          },
        },
          tx
        );
      }));

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
   * Executes post-create actions such as resetting the cache and triggering Airtable sync.
   * This ensures that the system is up-to-date with the latest changes.
   */
  private async postCreateActions(uid: string, action: string): Promise<void> {
    await this.cacheService.reset({ service: 'members' });
    await this.huskyRevalidationService.triggerHuskyRevalidation('members', uid, action);
    await this.forestadminService.triggerAirtableSync();
  }

  /**
   * Executes post-update actions such as resetting the cache and triggering Airtable sync.
   * This ensures that the system is up-to-date with the latest changes.
   */
  private async postUpdateActions(uid: string, action: string): Promise<void> {
    await this.cacheService.reset({ service: 'members' });
    await this.huskyRevalidationService.triggerHuskyRevalidation('members', uid, action);
    await this.forestadminService.triggerAirtableSync();
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
        isSubscribedToNewsletter: true
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
          gte: new Date(Date.now() - (parseInt(process.env.RECENT_RECORD_DURATION_IN_DAYS || '30') * 24 * 60 * 60 * 1000))
        }
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
            roleTags: { hasSome: roles }
          }
        }
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
              mode: 'insensitive'
            }
          },
          {
            teamMemberRoles: {
              some: {
                team: {
                  name: {
                    contains: name__icontains,
                    mode: 'insensitive'
                  }
                }
              }
            }
          },
          {
            projectContributions: {
              some: {
                project: {
                  name: {
                    contains: name__icontains,
                    mode: 'insensitive'
                  },
                  isDeleted: false
                }
              }
            }
          }
        ]
      }
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
        metroArea: true
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
      metroAreas: uniqueMetroAreas
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
  async updateTelegramIfChanged(
    member: Member,
    telegram: string,
    tx?: Prisma.TransactionClient
  ): Promise<Member> {
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
          throw new ConflictException(
            'Unique key constraint error on Member:',
            error.message
          );
        case 'P2003':
          throw new BadRequestException(
            'Foreign key constraint error on Member',
            error.message
          );
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


  async insertManyWithLocationsFromAirtable(
    airtableMembers: z.infer<typeof AirtableMemberSchema>[]
  ) {
    const skills = await this.prisma.skill.findMany();
    const images = await this.prisma.image.findMany();

    for (const member of airtableMembers) {
      if (!member.fields?.Name) {
        continue;
      }

      let image;

      if (member.fields['Profile picture']) {
        const ppf = member.fields['Profile picture'][0];

        const hashedPpf = ppf.filename
          ? hashFileName(`${path.parse(ppf.filename).name}-${ppf.id}`)
          : '';

        image =
          images.find(
            (image) => path.parse(image.filename).name === hashedPpf
          ) ||
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
            .filter(
              (skill) =>
                !!member.fields?.['Skills'] &&
                member.fields?.['Skills'].includes(skill.title)
            )
            .map((skill) => ({ id: skill.id })),
        },
      };

      const { location } = await this.locationTransferService.transferLocation(
        member
      );

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
        uid:true,
        email: true,
        name:true
      }
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
    if (isHost || isSpeaker) {
      return {
        eventGuests: {
          some: {
            isHost: isHost,
            isSpeaker: isSpeaker,
          }
        }
      }
    }
    return {};
  }
}
