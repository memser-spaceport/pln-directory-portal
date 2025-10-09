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
import { InvestorProfileType, Location, Member, ParticipantsRequest, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { NotificationService } from '../utils/notification/notification.service';
import { LogService } from '../shared/log.service';
import { DEFAULT_MEMBER_ROLES } from '../utils/constants';
import { buildMultiRelationMapping, copyObj } from '../utils/helper/helper';
import { CacheService } from '../utils/cache/cache.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import {
  AccessLevel,
  AccessLevelCounts,
  CreateMemberDto,
  RequestMembersDto,
  UpdateAccessLevelDto,
  UpdateMemberDto,
} from '../../../../libs/contracts/src/schema/admin-member';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';
import { MembersHooksService } from '../members/members.hooks.service';

@Injectable()
export class MemberService {
  constructor(
    private prisma: PrismaService,
    private locationTransferService: LocationTransferService,
    private membersHooksService: MembersHooksService,
    private logger: LogService,
    @Inject(forwardRef(() => ParticipantsRequestService))
    private participantsRequestService: ParticipantsRequestService,
    @Inject(forwardRef(() => NotificationService))
    private notificationService: NotificationService,
    private cacheService: CacheService,
    @Inject(forwardRef(() => NotificationSettingsService))
    private notificationSettingsService: NotificationSettingsService,
    private forestAdminService: ForestAdminService
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
    const newTeamUids = memberData.teamAndRoles.map((t: any) => t.teamUid);
    // Determine which roles need to be deleted, updated, or created
    const rolesToDelete = existingMember.teamMemberRoles.filter((t: any) => !newTeamUids.includes(t.teamUid));
    const rolesToUpdate = memberData.teamAndRoles.filter((t: any, index: number) => {
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
            : t.role?.split(',').map((item: string) => item.trim());
          // Preserve investmentTeam if not explicitly provided
          if (t.investmentTeam === undefined) {
            memberData.teamAndRoles[index].investmentTeam = foundValue.investmentTeam;
          }
          return true;
        }
      }
      return false;
    });
    const rolesToCreate = memberData.teamAndRoles.filter((t: any) => !oldTeamUids.includes(t.teamUid));
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
            role: roleToUpdate.role,
            roleTags: roleToUpdate.roleTags,
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
          role: t.role,
          mainTeam: false,
          teamLead: false,
          investmentTeam: t.investmentTeam || false,
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

  async findMemberByAccessLevels(params: RequestMembersDto) {
    const { accessLevel, page, limit } = params;

    const members = await this.prisma.member.findMany({
      where: {
        accessLevel: { in: accessLevel },
      },
      select: {
        uid: true,
        name: true,
        imageUid: true,
        image: {
          select: {
            uid: true,
            url: true,
          },
        },
        email: true,
        isSubscribedToNewsletter: true,
        accessLevel: true,
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
        accessLevelUpdatedAt: true,
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
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: 'asc' },
    });

    const total = await this.prisma.member.count({
      where: {
        accessLevel: { in: accessLevel },
      },
    });

    return {
      data: members,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getAccessLevelCounts(): Promise<AccessLevelCounts> {
    const counts = await this.prisma.member.groupBy({
      by: ['accessLevel'],
      _count: true,
    });

    // Initialize all levels with 0, then populate real values
    const allLevels = Object.values(AccessLevel);
    const result = allLevels.reduce((acc, level) => {
      acc[level as AccessLevel] = 0;
      return acc;
    }, {} as Record<AccessLevel, number>);

    for (const item of counts) {
      result[item.accessLevel as AccessLevel] = item._count;
    }

    return result;
  }

  async updateAccessLevel({ memberUids, accessLevel }: UpdateAccessLevelDto): Promise<{ updatedCount: number }> {
    // Fetch members whose current access level is L0, L1, or Rejected
    const notApprovedMembers = await this.prisma.member.findMany({
      where: {
        uid: { in: memberUids },
        accessLevel: { in: ['L0', 'L1', 'Rejected'] },
      },
      select: {
        uid: true,
        name: true,
        email: true,
        accessLevel: true,
      },
    });

    // Resolve isVerified and plnFriend flags based on new access level
    const { isVerified, plnFriend } = this.resolveFlagsFromAccessLevel(accessLevel as AccessLevel);
    const now = new Date();

    // Determine if soft delete or restore logic should be applied
    const updateData: Prisma.MemberUpdateManyArgs['data'] = {
      accessLevel,
      accessLevelUpdatedAt: now,
      isVerified,
      plnFriend,
    };

    if (accessLevel === AccessLevel.REJECTED) {
      // Soft delete if access level is set to REJECTED
      updateData.deletedAt = now;
      updateData.deletionReason = 'Access level changed to Rejected';
    } else {
      // Restore if access level is changed from REJECTED to something else
      updateData.deletedAt = null;
      updateData.deletionReason = null;
    }

    // Update access level and associated flags
    const result = await this.prisma.member.updateMany({
      where: {
        uid: { in: memberUids },
      },
      data: updateData,
    });

    // Create investor profiles for L5/L6 members who don't have one
    await this.createInvestorProfileForHighLevelMembers(memberUids, this.prisma);

    // Notify users based on the new access level
    if (result.count > 0) {
      // Send approval emails for L2, L3, L4
      if ([AccessLevel.L2, AccessLevel.L3, AccessLevel.L4].includes(accessLevel as AccessLevel)) {
        for (const member of notApprovedMembers) {
          if (!member.email) {
            this.logger.error(
              `Missing email for member with uid ${member.uid}. Can't send an approval notification email`
            );
          } else {
            // Send onboarding email for L4 members, approval email for L2/L3
            const isOnboarding = accessLevel === AccessLevel.L4;
            await this.notificationService.notifyForMemberCreationApproval(
              member.name,
              member.uid,
              member.email,
              isOnboarding
            );
          }
        }

        // Enable recommendations only for L4
        if (accessLevel === AccessLevel.L4) {
          await this.notificationSettingsService.enableRecommendationsFor(memberUids);
        }
      }

      // Send rejection emails for members marked as Rejected
      if (accessLevel === AccessLevel.REJECTED) {
        for (const member of notApprovedMembers) {
          if (!member.email) {
            this.logger.error(
              `Missing email for member with uid ${member.uid}. Can't send a rejection notification email`
            );
          } else {
            await this.notificationService.notifyForRejection(member.name, member.email);
          }
        }
      }

      // Trigger external sync
      await this.forestAdminService.triggerAirtableSync();
    }

    return { updatedCount: result.count };
  }

  async createMemberByAdmin(memberData: CreateMemberDto): Promise<Member> {
    let createdMember: any;
    await this.prisma.$transaction(async (tx) => {
      const location = await this.mapLocationToNewMember(memberData.city, memberData.country, memberData.region, tx);

      const { isVerified, plnFriend } = this.resolveFlagsFromAccessLevel(memberData.accessLevel as AccessLevel);

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
        accessLevel: memberData.accessLevel,
        isVerified,
        plnFriend,
        bio: memberData.bio,
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
          connect: memberData.skills.map((uid) => ({ uid })),
        },
        teamMemberRoles: {
          create: memberData.teamMemberRoles.map(({ teamUid, role }) => ({
            role,
            team: {
              connect: { uid: teamUid },
            },
          })),
        },
        notificationSetting: {
          create: {
            // Set onboarding notification attempts for L4 members
            ...(memberData.accessLevel === AccessLevel.L4
              ? {
                  onboardingAttempts: 1,
                  lastOnboardingSentAt: new Date(),
                }
              : {}),
            recommendationsEnabled: memberData.accessLevel === AccessLevel.L4,
          },
        },
        ...(investorProfileId && { investorProfileId }),
      };

      createdMember = await this.createMember(newMember, tx);

      if ([AccessLevel.L2, AccessLevel.L3, AccessLevel.L4].includes(memberData.accessLevel as AccessLevel)) {
        await this.notificationService.notifyForMemberCreationApproval(
          createdMember.name,
          createdMember.uid,
          createdMember.email,
          memberData.accessLevel === AccessLevel.L4
        );
      }

      // Create investor profile for L5/L6 members if they don't have one
      await this.createInvestorProfileForHighLevelMembers([createdMember.uid], tx);

      await this.membersHooksService.postCreateActions(createdMember, memberData.email);
    });
    return createdMember;
  }

  async updateMemberByAdmin(uid: string, dto: UpdateMemberDto): Promise<string> {
    const { country, region, city, skills, teamMemberRoles, joinDate, investorProfile, ...rest } = dto;

    const data: any = {
      ...rest,
    };

    if (dto.accessLevel) {
      const { isVerified, plnFriend } = this.resolveFlagsFromAccessLevel(dto.accessLevel as AccessLevel);
      data.isVerified = isVerified;
      data.plnFriend = plnFriend;
    }

    let updatedMember;

    await this.prisma.$transaction(async (tx) => {
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

      // Handle investor profile updates
      if (investorProfile) {
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
          // Update existing investor profile
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
    });

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

  async getAccessLevelByMemberEmail(email: string): Promise<string | null> {
    try {
      const member = await this.prisma.member.findUnique({
        where: { email: email },
        select: { accessLevel: true },
      });

      return member?.accessLevel ?? null;
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * Automatically create investor profile for L5/L6 members if they don't have one.
   *
   * @param memberUids - Array of member UIDs to check and potentially create profiles for
   * @param tx - Transaction client for atomic operations
   */
  private async createInvestorProfileForHighLevelMembers(
    memberUids: string[],
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const membersWithoutInvestorProfile = await tx.member.findMany({
      where: {
        uid: { in: memberUids },
        investorProfileId: null,
        accessLevel: { in: ['L5', 'L6'] },
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

  private resolveFlagsFromAccessLevel(accessLevel: AccessLevel): { isVerified: boolean; plnFriend: boolean } {
    switch (accessLevel) {
      case AccessLevel.L4:
      case AccessLevel.L5:
      case AccessLevel.L6:
        return { isVerified: true, plnFriend: false };
      case AccessLevel.L3:
        return { isVerified: true, plnFriend: true };
      case AccessLevel.L2:
      default:
        return { isVerified: false, plnFriend: false };
    }
  }
}
