import {
  Injectable,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import * as path from 'path';
import { z } from 'zod';
import { isEmpty } from 'lodash';
import { Prisma, Team, Member, ParticipantsRequest, AskStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { AirtableTeamSchema } from '../utils/airtable/schema/airtable-team.schema';
import { FileMigrationService } from '../utils/file-migration/file-migration.service';
import { NotificationService } from '../utils/notification/notification.service';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { hashFileName } from '../utils/hashing';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';
import { MembersService } from '../members/members.service';
import { LogService } from '../shared/log.service';
import { copyObj, buildMultiRelationMapping, buildRelationMapping } from '../utils/helper/helper';
import { CacheService } from '../utils/cache/cache.service';
import { AskService } from '../asks/asks.service';
import { TeamsHooksService } from './teams.hooks.service';

@Injectable()
export class TeamsService {
  constructor(
    private prisma: PrismaService,
    private fileMigrationService: FileMigrationService,
    @Inject(forwardRef(() => ParticipantsRequestService))
    private participantsRequestService: ParticipantsRequestService,
    @Inject(forwardRef(() => MembersService))
    private membersService: MembersService,
    private logger: LogService,
    private forestadminService: ForestAdminService,
    private notificationService: NotificationService,
    private cacheService: CacheService,
    private askService: AskService,
    private teamsHooksService: TeamsHooksService
  ) {}

  /**
   * Find all teams based on provided query options.
   * Allows flexibility in filtering, sorting, and pagination through Prisma.TeamFindManyArgs.
   *
   * @param queryOptions - Prisma query options to customize the result set
   *   (filter, pagination, sorting, etc.)
   * @returns A list of teams that match the query options
   */
  async findAll(queryOptions: Prisma.TeamFindManyArgs): Promise<{ count: number; teams: Team[] }> {
    try {
      const whereClause = {
        ...queryOptions.where,
        accessLevel: {
          not: 'L0',
        },
      };

      const [teams, teamsCount] = await Promise.all([
        this.prisma.team.findMany({
          ...queryOptions,
          where: whereClause,
        }),
        this.prisma.team.count({ where: whereClause }),
      ]);
      return { count: teamsCount, teams: teams };
    } catch (err) {
      return this.handleErrors(err);
    }
  }

  /**
   * Updates a team's access level based on whether it has active members.
   * L0 teams have no active members (no one has logged in).
   * L1 teams have at least one active member.
   *
   * @param teamUid - Unique identifier for the team
   * @param tx - Optional transaction client
   * @returns The updated team
   */
  async updateTeamAccessLevel(teamUid: string, tx?: Prisma.TransactionClient): Promise<Team> {
    const prisma = tx || this.prisma;
    const activeMemberCount = await prisma.teamMemberRole.count({
      where: {
        teamUid,
        member: {
          externalId: {
            not: null, // Member has authenticated at least once
          },
        },
      },
    });

    return await prisma.team.update({
      where: { uid: teamUid },
      data: {
        accessLevel: activeMemberCount > 0 ? 'L1' : undefined,
        accessLevelUpdatedAt: new Date(),
      },
    });
  }

  /**
   * Find a single team by its unique identifier (UID).
   * Retrieves detailed information about the team,
   * including related data like projects, technologies, and team focus areas.
   *
   * @param uid - Unique identifier for the team
   * @param queryOptions - Additional Prisma query options (excluding 'where') for
   *   customizing the result set
   * @returns The team object with all related information or throws an error if not found
   * @throws {NotFoundException} If the team with the given UID is not found
   */
  async findTeamByUid(uid: string, queryOptions: Omit<Prisma.TeamFindUniqueArgsBase, 'where'> = {}): Promise<Team> {
    try {
      const team = await this.prisma.team.findUniqueOrThrow({
        where: { uid },
        ...queryOptions,
        include: {
          fundingStage: true,
          industryTags: true,
          logo: true,
          membershipSources: true,
          technologies: true,
          maintainingProjects: {
            orderBy: { name: 'asc' },
            include: {
              logo: { select: { url: true, uid: true } },
              maintainingTeam: { select: { name: true, logo: { select: { url: true, uid: true } } } },
              contributingTeams: true,
            },
          },
          contributingProjects: {
            orderBy: { name: 'asc' },
            include: {
              logo: { select: { url: true, uid: true } },
              maintainingTeam: { select: { name: true, logo: { select: { url: true, uid: true } } } },
              contributingTeams: true,
            },
          },
          teamFocusAreas: {
            select: {
              focusArea: { select: { uid: true, title: true } },
            },
          },
          eventGuests: {
            orderBy: {
              event: {
                startDate: 'desc',
              },
            },
            where: {
              OR: [{ isHost: true }, { isSponsor: true }],
            },
            distinct: ['eventUid'],
            select: {
              isHost: true,
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
          asks: {
            select: {
              uid: true,
              title: true,
              tags: true,
              description: true,
              teamUid: true,
              status: true,
              closedAt: true,
              closedReason: true,
              closedComment: true,
              closedByUid: true,
              closedBy: {
                select: {
                  uid: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
          investorProfile: true,
        },
      });
      if (team.accessLevel === 'L0') {
        throw new ForbiddenException('Team is inactive');
      }
      team.teamFocusAreas = this.removeDuplicateFocusAreas(team.teamFocusAreas);
      return team;
    } catch (err) {
      return this.handleErrors(err, uid);
    }
  }

  /**
   * Find a team by its name.
   *
   * @param name - The name of the team to find
   * @returns The team object if found, otherwise null
   */
  async findTeamByName(name: string): Promise<Team> {
    try {
      return this.prisma.team.findUniqueOrThrow({
        where: { name },
      });
    } catch (err) {
      return this.handleErrors(err);
    }
  }

  /**
   * Creates a new team in the database within a transaction.
   *
   * @param team - The data for the new team to be created
   * @param tx - The transaction client to ensure atomicity
   * @param requestorEmail - Email of the person creating the team
   * @returns The created team record
   */
  async createTeam(
    team: Prisma.TeamUncheckedCreateInput,
    tx: Prisma.TransactionClient,
    requestorEmail: string
  ): Promise<Team> {
    try {
      const teamData = {
        ...team,
        accessLevel: team.accessLevel || 'L1',
        accessLevelUpdatedAt: new Date(),
      };

      const createdTeam = await tx.team.create({
        data: teamData,
      });
      await this.teamsHooksService.postCreateActions(createdTeam, requestorEmail);
      return createdTeam;
    } catch (err) {
      return this.handleErrors(err);
    }
  }

  /**
   * Updates the team data in the database within a transaction.
   *
   * @param teamUid - Unique identifier of the team being updated
   * @param team - The new data to be applied to the team
   * @param tx - The transaction client to ensure atomicity
   * @returns The updated team record
   */
  async updateTeamByUid(
    uid: string,
    team: Prisma.TeamUncheckedUpdateInput,
    tx: Prisma.TransactionClient,
    requestorEmail: string
  ): Promise<Team> {
    try {
      const updatedTeam = await tx.team.update({
        where: { uid },
        data: team,
      });
      await this.teamsHooksService.postUpdateActions(updatedTeam, requestorEmail);
      return updatedTeam;
    } catch (err) {
      return this.handleErrors(err, `${uid}`);
    }
  }

  /**
   * Updates the existing team with new information.
   * updates the team, logs the update in the participants request table,
   * resets the cache, and triggers post-update actions like Airtable synchronization.
   *
   * @param teamUid - Unique identifier of the team to be updated
   * @param teamParticipantRequest - Data containing the updated team information
   * @param requestorEmail - Email of the person making the request
   * @returns A success message if the operation is successful
   */
  async updateTeamFromParticipantsRequest(
    teamUid: string,
    teamParticipantRequest: ParticipantsRequest,
    requestorEmail: string
  ): Promise<Team> {
    const updatedTeam: any = teamParticipantRequest.newData;
    const existingTeam = await this.findTeamByUid(teamUid);
    let result;
    this.logger.info(`Going to update information about the '${teamUid}' team`);
    const requestor = await this.membersService.findMemberByEmail(requestorEmail);
    await this.prisma.$transaction(async (tx) => {
      const { team, investorProfileData } = await this.formatTeam(teamUid, updatedTeam, tx, 'Update');
      result = await this.updateTeamByUid(teamUid, team, tx, requestorEmail);
      const toAdd: any[] = [];
      const toDelete: { teamUid: string; memberUid: string }[] = [];
      this.logger.info(`Team data roles to update: ${JSON.stringify(updatedTeam.teamMemberRoles)}`);
      if (updatedTeam?.teamMemberRoles?.length > 0) {
        for (const teamMemberRole of updatedTeam.teamMemberRoles) {
          const updatedRole = { ...teamMemberRole };
          delete updatedRole.status;
          switch (teamMemberRole?.status) {
            case 'Update':
              await this.updateTeamMemberRoleEntry(updatedRole, tx);
              break;

            case 'Delete':
              toDelete.push(updatedRole);
              break;

            case 'Add':
              toAdd.push(updatedRole);
              break;

            default:
              break;
          }
        }
      }
      if (!isEmpty(toAdd)) {
        await this.addNewTeamMemberRoleEntry(toAdd, tx);
      }
      if (!isEmpty(toDelete)) {
        this.logger.info(`Going to delete members ${toDelete.map((r) => r.memberUid).join(', ')} from the ${teamUid}`);
        await this.deleteTeamMemberRoleEntry(toDelete, tx);
      }

      // Handle investor profile updates
      if (investorProfileData) {
        await this.updateTeamInvestorProfile(teamUid, investorProfileData, tx, requestor.accessLevel);
      }

      await this.logParticipantRequest(requestorEmail, updatedTeam, existingTeam.uid, tx);
    });
    await this.notificationService.notifyForTeamEditApproval(updatedTeam.name, teamUid, requestorEmail);
    return result;
  }

  /**
   * Updates multiple team member roles in the database.
   *
   * @param teamAndRoles - Array of objects containing `memberUid` and `teamUid` as identifiers, along with update data.
   * @param tx - Prisma transaction client for atomic execution.
   */
  private async updateTeamMemberRoleEntry(teamAndRole: any, tx: Prisma.TransactionClient) {
    await tx.teamMemberRole.update({
      where: {
        memberUid_teamUid: { memberUid: teamAndRole?.memberUid, teamUid: teamAndRole?.teamUid },
      },
      data: teamAndRole,
    });
  }

  /**
   * Deletes multiple team member roles in a single query using `deleteMany`.
   * Ensures deletion only occurs when both `memberUid` and `teamUid` match.
   *
   * @param teamAndRoles - Array of objects containing `memberUid` and `teamUid` pairs to delete.
   * @param tx - Prisma transaction client for atomic execution.
   */
  private async deleteTeamMemberRoleEntry(
    teamAndRoles: { teamUid: string; memberUid: string }[],
    tx: Prisma.TransactionClient
  ) {
    await tx.teamMemberRole.deleteMany({
      where: {
        OR: teamAndRoles.map((role) => ({
          teamUid: role.teamUid,
          memberUid: role.memberUid,
        })),
      },
    });
  }

  /**
   * Inserts multiple new team member roles in a single batch operation using `createMany`.
   *
   * @param teamAndRoles - Array of new team member role objects to be added.
   * @param tx - Prisma transaction client for atomic execution.
   */
  private async addNewTeamMemberRoleEntry(teamAndRoles: any[], tx: Prisma.TransactionClient) {
    await tx.teamMemberRole.createMany({
      data: teamAndRoles,
    });
  }

  /**
   * Creates a new team from the participants request data.
   * resets the cache, and triggers post-update actions like Airtable synchronization.
   * @param teamParticipantRequest - The request containing the team details.
   * @param requestorEmail - The email of the requestor.
   * @returns The newly created team.
   */
  async createTeamFromParticipantsRequest(
    teamParticipantRequest: ParticipantsRequest,
    tx: Prisma.TransactionClient
  ): Promise<Team> {
    const newTeam: any = teamParticipantRequest.newData;
    this.logger.info(`Creating team from participant request with data: ${JSON.stringify(newTeam)}`);
    const { team: formattedTeam, investorProfileData } = await this.formatTeam(null, newTeam, tx);
    this.logger.info(`Formatted team data, investorProfileData: ${JSON.stringify(investorProfileData)}`);
    const createdTeam = await this.createTeam(formattedTeam, tx, teamParticipantRequest.requesterEmailId);

    // Handle investor profile creation for teams
    if (investorProfileData) {
      this.logger.info(`Creating investor profile for team ${createdTeam.uid}`);
      await this.updateTeamInvestorProfile(createdTeam.uid, investorProfileData, tx);
    } else {
      this.logger.info(`No investor profile data to process for team ${createdTeam.uid}`);
    }

    return createdTeam;
  }

  /**
   * Format team data for creation or update
   *
   * @param teamUid - The unique identifier for the team (used for updates)
   * @param teamData - Raw team data to be formatted
   * @param tx - Transaction client for atomic operations
   * @param type - Operation type ('create' or 'update')
   * @returns - Formatted team data for Prisma query
   */
  async formatTeam(
    teamUid: string | null,
    teamData: Partial<Team> & {
      investorProfile?: {
        investmentFocus?: string[];
        typicalCheckSize?: string;
        investInStartupStages?: string[];
        investInFundTypes?: string[];
      };
    },
    tx: Prisma.TransactionClient,
    type = 'Create'
  ): Promise<{ team: any; investorProfileData: any }> {
    const team: any = {};
    const directFields = [
      'name',
      'blog',
      'contactMethod',
      'twitterHandler',
      'linkedinHandler',
      'telegramHandler',
      'officeHours',
      'shortDescription',
      'plnFriend',
      'website',
      'airtableRecId',
      'longDescription',
      'moreDetails',
      'isFund',
    ];
    copyObj(teamData, team, directFields);
    // Handle one-to-one or one-to-many mappings
    team['fundingStage'] = buildRelationMapping('fundingStage', teamData);
    team['industryTags'] = buildMultiRelationMapping('industryTags', teamData, type);
    team['technologies'] = buildMultiRelationMapping('technologies', teamData, type);
    team['membershipSources'] = buildMultiRelationMapping('membershipSources', teamData, type);
    if (type === 'create') {
      team['teamFocusAreas'] = await this.createTeamWithFocusAreas(teamData, tx);
    }
    if (teamUid) {
      team['teamFocusAreas'] = await this.updateTeamWithFocusAreas(teamUid, teamData, tx);
    }
    team['logo'] = teamData.logoUid
      ? { connect: { uid: teamData.logoUid } }
      : type === 'Update'
      ? { disconnect: true }
      : undefined;

    // Handle investor profile
    let investorProfileData: any;
    if (teamData.investorProfile && Object.keys(teamData.investorProfile).length > 0) {
      this.logger.info(
        `Processing investor profile for team creation/update: ${JSON.stringify(teamData.investorProfile)}`
      );
      if (type === 'create') {
        team['investorProfile'] = {
          create: {
            investmentFocus: teamData.investorProfile.investmentFocus || [],
            typicalCheckSize: teamData.investorProfile.typicalCheckSize,
            investInStartupStages: teamData.investorProfile.investInStartupStages || [],
            investInFundTypes: teamData.investorProfile.investInFundTypes || [],
          },
        };
        this.logger.info(`Added investor profile to team object for creation`);
      } else {
        // For updates, we'll handle this separately after team creation/update
        investorProfileData = teamData.investorProfile;
        this.logger.info(`Set investor profile data for separate update processing`);
      }
    } else {
      this.logger.info(`No investor profile data found in teamData: ${JSON.stringify(teamData.investorProfile)}`);
    }

    return { team, investorProfileData };
  }

  /**
   * Handles investor profile updates for a team
   *
   * @param teamUid - The unique identifier of the team
   * @param investorProfileData - The investor profile data to update
   * @param tx - Transaction client for atomic operations
   * @param requestorAccessLevel - The access level of the requestor to check permissions
   */
  async updateTeamInvestorProfile(
    teamUid: string,
    investorProfileData: any,
    tx: Prisma.TransactionClient,
    requestorAccessLevel?: string
  ) {
    this.logger.info(
      `updateTeamInvestorProfile called for team ${teamUid} with data: ${JSON.stringify(investorProfileData)}`
    );
    // Check if requestor has permission to update investor profile (L5, L6, or directory admin)
    if (requestorAccessLevel && !['L5', 'L6'].includes(requestorAccessLevel)) {
      // Check if they're a directory admin
      const requestor = await tx.member.findFirst({
        where: { memberRoles: { some: { name: 'DIRECTORYADMIN' } } },
      });
      if (!requestor) {
        throw new ForbiddenException('Insufficient permissions to update investor profile');
      }
    }

    const team = await tx.team.findUnique({
      where: { uid: teamUid },
      select: { investorProfileId: true },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    if (team.investorProfileId) {
      // Update existing investor profile
      await tx.investorProfile.update({
        where: { uid: team.investorProfileId },
        data: {
          investmentFocus: investorProfileData.investmentFocus || [],
          typicalCheckSize: investorProfileData.typicalCheckSize,
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
          investInStartupStages: investorProfileData.investInStartupStages || [],
          investInFundTypes: investorProfileData.investInFundTypes || [],
          teamUid: teamUid,
        },
      });

      // Link the investor profile to the team
      await tx.team.update({
        where: { uid: teamUid },
        data: { investorProfileId: newInvestorProfile.uid },
      });
    }
  }

  /**
   * Validates the permissions of the requestor. The requestor must either be an admin or the leader of the team.
   *
   * @param requestorEmail - The email of the person requesting the update
   * @param teamUid - The unique identifier of the team being updated
   * @returns The requestor's member data if validation passes
   * @throws {UnauthorizedException} If the requestor is not found
   * @throws {ForbiddenException} If the requestor does not have sufficient permissions
   */
  async validateRequestor(requestorEmail: string, teamUid: string): Promise<Member> {
    const requestor = await this.membersService.findMemberByEmail(requestorEmail);
    if (!requestor.isDirectoryAdmin && !requestor.leadingTeams.includes(teamUid)) {
      throw new ForbiddenException('Requestor does not have permission to update this team');
    }
    return requestor;
  }

  /**
   * Validating if the requestor is either an admin or a member of the team.
   *
   * @param requestorEmail - The email of the person requesting the update
   * @param teamUid - The unique identifier of the team being updated
   * @returns The requestor's member data if validation passes
   * @throws {UnauthorizedException} If the requestor is not found
   * @throws {ForbiddenException} If the requestor does not have sufficient permissions
   */
  async isTeamMemberOrAdmin(requestorEmail: string, teamUid: string): Promise<Member> {
    const requestor = await this.membersService.findMemberByEmail(requestorEmail);
    const isPartOfTheTeam = requestor?.teamMemberRoles?.find((teams) => teams.teamUid === teamUid);
    if (!requestor.isDirectoryAdmin && !isPartOfTheTeam) {
      throw new ForbiddenException('Requestor does not have permission to update this team');
    }
    return requestor;
  }

  /**
   * Removes duplicate focus areas from the team object based on their UID.
   * Ensures that each focus area is unique in the result set.
   *
   * @param focusAreas - An array of focus areas associated with the team
   * @returns A deduplicated array of focus areas
   */
  private removeDuplicateFocusAreas(focusAreas): any {
    const uniqueFocusAreas = {};
    focusAreas.forEach((item) => {
      const { uid, title } = item.focusArea;
      uniqueFocusAreas[uid] = { uid, title };
    });
    return Object.values(uniqueFocusAreas);
  }

  /**
   * Logs the participant request in the participants request table for audit and tracking purposes.
   *
   * @param requestorEmail - Email of the requestor who is updating the team
   * @param newTeamData - The new data being applied to the team
   * @param referenceUid - Unique identifier of the existing team to be referenced
   * @param tx - The transaction client to ensure atomicity
   */
  private async logParticipantRequest(
    requestorEmail: string,
    newTeamData,
    referenceUid: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    await this.participantsRequestService.add(
      {
        status: 'AUTOAPPROVED',
        requesterEmailId: requestorEmail,
        referenceUid,
        uniqueIdentifier: newTeamData?.name || '',
        participantType: 'TEAM',
        newData: { ...newTeamData },
      },
      tx
    );
  }

  /**
   * Creates focus area mappings for a new team.
   *
   * @param team - The team object containing focus areas
   * @param transaction - The transaction client for atomic operations
   * @returns - Data for bulk insertion of focus areas
   */
  async createTeamWithFocusAreas(team, transaction: Prisma.TransactionClient) {
    if (team.focusAreas && team.focusAreas.length > 0) {
      const teamFocusAreas: any = [];
      const focusAreaHierarchies = await transaction.focusAreaHierarchy.findMany({
        where: {
          subFocusAreaUid: {
            in: team.focusAreas.map((area) => area.uid),
          },
        },
      });
      focusAreaHierarchies.map((areaHierarchy) => {
        teamFocusAreas.push({
          focusAreaUid: areaHierarchy.subFocusAreaUid,
          ancestorAreaUid: areaHierarchy.focusAreaUid,
        });
      });
      team.focusAreas.map((area) => {
        teamFocusAreas.push({
          focusAreaUid: area.uid,
          ancestorAreaUid: area.uid,
        });
      });
      return {
        createMany: {
          data: teamFocusAreas,
        },
      };
    }
    return {};
  }

  /**
   * Updates focus areas for an existing team.
   *
   * @param teamUid - The unique identifier of the team
   * @param team - The team object containing new focus areas
   * @param transaction - The transaction client for atomic operations
   * @returns - Data for bulk insertion of updated focus areas
   */
  async updateTeamWithFocusAreas(teamUid: string, team, transaction: Prisma.TransactionClient) {
    await transaction.teamFocusArea.deleteMany({
      where: { teamUid },
    });
    if (!team.focusAreas || team.focusAreas.length === 0) {
      return {};
    }
    return await this.createTeamWithFocusAreas(team, transaction);
  }

  /**
   * Builds filter for focus areas by splitting the input and matching ancestor titles.
   * @param focusAreas - Comma-separated focus area titles
   * @returns - Prisma filter for teamFocusAreas
   */
  buildFocusAreaFilters(focusAreas) {
    if (focusAreas?.split(',')?.length > 0) {
      return {
        teamFocusAreas: {
          some: {
            ancestorArea: {
              title: {
                in: focusAreas?.split(','),
              },
            },
          },
        },
      };
    }
    return {};
  }

  /**
   * Constructs the team filter based on multiple query parameters.
   * @param queryParams - Query parameters from the request
   * @returns - Prisma AND filter combining all conditions
   */
  buildTeamFilter(queryParams) {
    const { name, plnFriend, industryTags, technologies, membershipSources, fundingStage, officeHours, isHost } =
      queryParams;
    const filter: any = [];
    this.buildNameAndPLNFriendFilter(name, plnFriend, filter);
    this.buildIndustryTagsFilter(industryTags, filter);
    this.buildTechnologiesFilter(technologies, filter);
    this.buildMembershipSourcesFilter(membershipSources, filter);
    this.buildFundingStageFilter(fundingStage, filter);
    this.buildOfficeHoursFilter(officeHours, filter);
    this.buildRecentTeamsFilter(queryParams, filter);
    this.buildAskTagFilter(queryParams, filter);
    filter.push(this.buildParticipationTypeFilter(queryParams));
    return {
      AND: filter,
    };
  }

  /**
   * Adds name and PLN friend filter conditions to the filter array.
   * @param name - Team name to search for (case-insensitive)
   * @param plnFriend - Boolean to filter teams that are PLN friends
   * @param filter - Filter array to be appended to
   */
  buildNameAndPLNFriendFilter(name, plnFriend, filter) {
    if (name) {
      filter.push({
        name: {
          contains: name,
          mode: 'insensitive',
        },
      });
    }
    if (!(plnFriend === 'true')) {
      filter.push({
        plnFriend: false,
      });
    }
  }

  /**
   * Adds industry tags filter to the filter array.
   * @param industryTags - Comma-separated industry tags
   * @param filter - Filter array to be appended to
   */
  buildIndustryTagsFilter(industryTags, filter) {
    const tags = industryTags?.split(',').map((tag) => tag.trim());
    if (tags?.length > 0) {
      tags.map((tag) => {
        filter.push({
          industryTags: {
            some: {
              title: {
                in: tag,
              },
            },
          },
        });
      });
    }
  }

  /**
   * Adds technology tags filter to the filter array.
   * @param technologies - Comma-separated technology tags
   * @param filter - Filter array to be appended to
   */
  buildTechnologiesFilter(technologies, filter) {
    const tags = technologies?.split(',').map((tech) => tech.trim());
    if (tags?.length > 0) {
      tags.map((tag) => {
        filter.push({
          technologies: {
            some: {
              title: {
                in: tag,
              },
            },
          },
        });
      });
    }
  }

  /**
   * Adds membership sources filter to the filter array.
   * @param membershipSources - Comma-separated membership source titles
   * @param filter - Filter array to be appended to
   */
  buildMembershipSourcesFilter(membershipSources, filter) {
    const sources = membershipSources?.split(',').map((source) => source.trim());
    if (sources?.length > 0) {
      sources.map((source) => {
        filter.push({
          membershipSources: {
            some: {
              title: {
                in: source,
              },
            },
          },
        });
      });
    }
  }

  /**
   * Adds funding stage filter to the filter array.
   * @param fundingStage - Title of the funding stage
   * @param filter - Filter array to be appended to
   */
  buildFundingStageFilter(fundingStage, filter) {
    if (fundingStage?.length > 0) {
      filter.push({
        fundingStage: {
          title: fundingStage.trim(),
        },
      });
    }
  }

  /**
   * Adds office hours filter to the filter array.
   * @param officeHours - Boolean to check if teams have office hours
   * @param filter - Filter array to be appended to
   */
  buildOfficeHoursFilter(officeHours, filter) {
    if (officeHours === 'true') {
      filter.push({
        officeHours: { not: null },
      });
    }
  }

  /**
   * Constructs a dynamic filter query for retrieving recent teams based on the 'is_recent' query parameter.
   * If 'is_recent' is set to 'true', it creates a 'createdAt' filter to retrieve records created within a
   * specified number of days. The number of days is configured via an environment variable.
   *
   * If a filter array is passed, it pushes the 'createdAt' filter to the existing filters.
   *
   * @param queryParams - HTTP request query parameters object
   * @param filter - Optional existing filter array to which the recent filter will be added if provided
   * @returns The constructed query with a 'createdAt' filter if 'is_recent' is 'true',
   *          or an empty object if 'is_recent' is not provided or set to 'false'.
   */
  buildRecentTeamsFilter(queryParams, filter?) {
    const { isRecent } = queryParams;
    const recentFilter = {
      createdAt: {
        gte: new Date(Date.now() - parseInt(process.env.RECENT_RECORD_DURATION_IN_DAYS || '30') * 24 * 60 * 60 * 1000),
      },
    };
    if (isRecent === 'true' && !filter) {
      return recentFilter;
    }
    if (isRecent === 'true' && filter) {
      filter.push(recentFilter);
    }
    return {};
  }

  buildAskTagFilter(queryParams, filter?) {
    const { askTags } = queryParams;
    let tagFilter = {};
    if (askTags) {
      //when all is given as value to askTags, all the teams with asks are returned.
      if (askTags === 'all') {
        tagFilter = {
          asks: { some: {} },
        };
      } else {
        const tags = askTags.split(',');
        tagFilter = {
          asks: { some: { tags: { hasSome: tags } } },
        };
      }
    }
    if (filter) {
      filter.push(tagFilter);
    } else {
      return tagFilter;
    }
  }

  /**
   * Handles database-related errors specifically for the Team entity.
   * Logs the error and throws an appropriate HTTP exception based on the error type.
   *
   * @param {any} error - The error object thrown by Prisma or other services.
   * @param {string} [message] - An optional message to provide additional context,
   *                             such as the team UID when an entity is not found.
   * @throws {ConflictException} - If there's a unique key constraint violation.
   * @throws {BadRequestException} - If there's a foreign key constraint violation or validation error.
   * @throws {NotFoundException} - If a team is not found with the provided UID.
   */
  private handleErrors(error, message?: string) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          throw new ConflictException('Unique key constraint error on Team:', error.message);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on Team', error.message);
        case 'P2025':
          throw new NotFoundException('Team not found with uid: ' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database field validation error on Team', error.message);
    } else {
      throw error;
    }
    // TODO: Remove this return statement if future versions allow all error-returning functions to be inferred correctly.
    return error;
  }

  async insertManyFromAirtable(airtableTeams: z.infer<typeof AirtableTeamSchema>[]) {
    const fundingStages = await this.prisma.fundingStage.findMany();
    const industryTags = await this.prisma.industryTag.findMany();
    const technologies = await this.prisma.technology.findMany();
    const membershipSources = await this.prisma.membershipSource.findMany();
    const images = await this.prisma.image.findMany();

    for (const team of airtableTeams) {
      const optionalFieldsToAdd = Object.entries({
        blog: 'Blog',
        website: 'Website',
        twitterHandler: 'Twitter',
        shortDescription: 'Short description',
        contactMethod: 'Preferred Method of Contact',
        longDescription: 'Long description',
        plnFriend: 'Friend of PLN',
      }).reduce(
        (optionalFields, [prismaField, airtableField]) => ({
          ...optionalFields,
          ...(team.fields?.[airtableField] && {
            [prismaField]: team.fields?.[airtableField],
          }),
        }),
        {}
      );

      const oneToManyRelations = {
        fundingStageUid:
          fundingStages.find((fundingStage) => fundingStage.title === team.fields?.['Funding Stage'])?.uid || null,
      };

      const manyToManyRelations = {
        industryTags: {
          connect: industryTags
            .filter((tag) => !!team.fields?.['Tags lookup'] && team.fields?.['Tags lookup'].includes(tag.title))
            .map((tag) => ({ id: tag.id })),
        },
        membershipSources: {
          connect: membershipSources
            .filter(
              (program) =>
                !!team.fields?.['Accelerator Programs'] && team.fields?.['Accelerator Programs'].includes(program.title)
            )
            .map((tag) => ({ id: tag.id })),
        },
        technologies: {
          connect: technologies
            .filter(
              (tech) =>
                (team.fields?.['Filecoin User'] && tech.title === 'Filecoin') ||
                (team.fields?.['IPFS User'] && tech.title === 'IPFS')
            )
            .map((tech) => ({ id: tech.id })),
        },
      };

      let image;

      if (team.fields.Logo) {
        const logo = team.fields.Logo[0];

        const hashedLogo = logo.filename ? hashFileName(`${path.parse(logo.filename).name}-${logo.id}`) : '';
        image =
          images.find((image) => path.parse(image.filename).name === hashedLogo) ||
          (await this.fileMigrationService.migrateFile({
            id: logo.id ? logo.id : '',
            url: logo.url ? logo.url : '',
            filename: logo.filename ? logo.filename : '',
            size: logo.size ? logo.size : 0,
            type: logo.type ? logo.type : '',
            height: logo.height ? logo.height : 0,
            width: logo.width ? logo.width : 0,
          }));
      }

      await this.prisma.team.upsert({
        where: { airtableRecId: team.id },
        update: {
          ...optionalFieldsToAdd,
          ...oneToManyRelations,
          ...manyToManyRelations,
        },
        create: {
          airtableRecId: team.id,
          name: team.fields.Name,
          plnFriend: team.fields['Friend of PLN'] || false,
          logoUid: image && image.uid ? image.uid : undefined,
          ...optionalFieldsToAdd,
          ...oneToManyRelations,
          ...manyToManyRelations,
          ...(team.fields?.['Created'] && {
            createdAt: new Date(team.fields['Created']),
          }),
          ...(team.fields?.['Last Modified'] && {
            updatedAt: new Date(team.fields['Last Modified']),
          }),
        },
      });
    }
  }

  /**
   * Fetches filter tags for teams for felicitating ease searching.
   *
   * @returns Set of industry tags, membership sources, funding stages
   * and technologies that contains atleast one team.
   */
  async getTeamFilters(queryParams) {
    const [industryTags, membershipSources, fundingStages, technologies, askTags] = await Promise.all([
      this.prisma.industryTag.findMany({
        where: {
          teams: {
            some: { ...queryParams.where },
          },
        },
        select: {
          title: true,
        },
      }),

      this.prisma.membershipSource.findMany({
        where: {
          teams: {
            some: { ...queryParams.where },
          },
        },
        select: {
          title: true,
        },
      }),

      this.prisma.fundingStage.findMany({
        where: {
          teams: {
            some: { ...queryParams.where },
          },
        },
        select: {
          title: true,
        },
      }),

      this.prisma.technology.findMany({
        where: {
          teams: {
            some: { ...queryParams.where },
          },
        },
        select: {
          title: true,
        },
      }),

      this.prisma.ask.findMany({
        where: {
          team: queryParams.where,
        },
        select: {
          tags: true,
        },
      }),
    ]);

    return {
      industryTags: industryTags.map((tag) => tag.title),
      membershipSources: membershipSources.map((source) => source.title),
      fundingStages: fundingStages.map((stage) => stage.title),
      technologies: technologies.map((tech) => tech.title),
      askTags: this.askService.formatAskFilterResponse(askTags),
    };
  }

  /**
   * This method construct the dynamic query to search the member by
   * their participation type for host only
   * @param queryParams HTTP request query params object
   * @returns Constructed query based on given participation type
   */
  buildParticipationTypeFilter(queryParams) {
    const isHost = queryParams.isHost === 'true';
    const isSponsor = queryParams.isSponsor === 'true';
    if (isHost || isSponsor) {
      return {
        eventGuests: {
          some: {
            isHost: isHost,
            isSponsor: isSponsor,
          },
        },
      };
    }
    return {};
  }

  // TODO: Remove this endpoint after frontend integration with new ask api
  async addEditTeamAsk(teamUid, teamName, requesterEmailId, data) {
    let addEditResponse;

    try {
      //get existing asks related to teamuid
      const teamAsks = await this.prisma.ask.findMany({
        where: { teamUid },
      });

      await this.prisma.$transaction(async (tx) => {
        if (data.uid) {
          if (data.isDeleted) {
            //deleting asks
            addEditResponse = await this.prisma.ask.delete({
              where: { uid: data.uid },
            });
          } else {
            //updating asks
            addEditResponse = await this.prisma.ask.update({
              where: { uid: data.uid },
              data: {
                ...data,
                closedAt: data.status === AskStatus.CLOSED ? new Date() : null,
              },
            });
          }
        } else {
          //inserting asks
          addEditResponse = await tx.ask.create({
            data: {
              ...data,
              teamUid: teamUid,
            },
          });
        }

        const teamAsksAfter = await tx.ask.findMany({
          where: { teamUid },
        });

        //logging into participant request
        await this.participantsRequestService.add(
          {
            status: 'AUTOAPPROVED',
            requesterEmailId,
            referenceUid: teamUid,
            uniqueIdentifier: teamName,
            participantType: 'TEAM',
            newData: teamAsksAfter as any,
            oldData: teamAsks as any,
          },
          tx
        );
      });

      //notifying the team edit
      // this.notificationService.notifyForTeamEditApproval(teamName, teamUid, requesterEmailId);

      //reseting cache
      await this.cacheService.reset({ service: 'teams' });

      //syncing up to airtable
      await this.forestadminService.triggerAirtableSync();
    } catch (err) {
      console.error(err);
    }
    return addEditResponse;
  }

  /**
   * Retrieves all contributors for PL events.
   * @returns An array of contributors with their details.
   */
  async getAllPLEventContibutors() {
    try {
      return await this.prisma.team.findMany({
        where: {
          eventGuests: {
            some: {
              OR: [{ isHost: true }, { isSpeaker: true }, { isSponsor: true }],
            },
          },
        },
        select: {
          uid: true,
          name: true,
          logo: true,
          eventGuests: {
            where: {
              OR: [{ isHost: true }, { isSpeaker: true }, { isSponsor: true }],
            },
            distinct: ['memberUid'], // Ensures unique members per team
            select: {
              uid: true,
              isHost: true,
              isSpeaker: true,
              isSponsor: true,
              member: {
                select: {
                  uid: true,
                  name: true,
                  image: true,
                },
              },
              event: {
                select: {
                  uid: true,
                  name: true,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(`error occured while fetching event contributors`, error);
      this.handleErrors(error);
    }
  }

  /*
     Creates/updates member's TeamMemberRole for the given team,
     and (if caller is team lead) updates team.isFund and investor profile.
     - Any user: can set role/investmentTeam (upsert their TeamMemberRole)
     - Team lead only: can set team.isFund and team.investorProfile (create if missing)
   */
  async updateTeamMemberRoleAndInvestorProfile(teamUid: string, body: SelfUpdatePayload, requestorEmail: string) {
    // Resolve the calling member by email
    const requestorMember = await this.membersService.findMemberByEmail(requestorEmail);
    if (!requestorMember) {
      throw new ForbiddenException('Requestor not found');
    }

    if (!requestorMember.isDirectoryAdmin && body.memberUid && requestorMember.uid !== body.memberUid) {
      throw new ForbiddenException('Only directory admin can update other members role');
    }

    const member =
      requestorMember.uid === body.memberUid || !body.memberUid
        ? requestorMember
        : await this.membersService.findMemberByUid(body.memberUid);
    if (!member) throw new NotFoundException('Member not found');

    const { role, investmentTeam, isFund, investorProfile } = body ?? {};

    return await this.prisma.$transaction(async (tx) => {
      const teamExists = await tx.team.findUnique({
        where: { uid: teamUid },
        select: { uid: true },
      });
      if (!teamExists) {
        throw new NotFoundException('Team not found');
      }

      await tx.teamMemberRole.updateMany({
        where: { memberUid: member.uid, teamUid: { not: teamUid } },
        data: {
          investmentTeam: false,
        },
      });

      // 1) Upsert caller's TeamMemberRole (open to any authenticated member)
      if (role !== undefined || investmentTeam !== undefined) {
        await tx.teamMemberRole.upsert({
          where: { memberUid_teamUid: { memberUid: member.uid, teamUid } },
          create: {
            memberUid: member.uid,
            teamUid,
            ...(role !== undefined ? { role } : {}),
            ...(investmentTeam !== undefined ? { investmentTeam } : {}),
          },
          update: {
            ...(role !== undefined ? { role } : {}),
            ...(investmentTeam !== undefined ? { investmentTeam } : {}),
          },
        });
      }

      // 2) Privileged fields require team lead
      const wantsPrivileged = isFund !== undefined || (investorProfile && Object.keys(investorProfile).length > 0);

      if (wantsPrivileged) {
        // Check caller's role in this team: must be teamLead === true
        const myRole = await tx.teamMemberRole.findUnique({
          where: { memberUid_teamUid: { memberUid: requestorMember.uid, teamUid } },
          select: { teamLead: true },
        });
        if (!myRole?.teamLead && !requestorMember.isDirectoryAdmin) {
          throw new ForbiddenException('Only team lead or directory admin can update investor settings');
        }

        // Update team.isFund if requested
        if (isFund !== undefined) {
          await tx.team.update({ where: { uid: teamUid }, data: { isFund } });
        }

        // Create/update investor profile (no global ACLs here; team lead is enough)
        if (investorProfile) {
          await this.upsertInvestorProfileAsTeamLead(tx, teamUid, investorProfile);
        }
      }

      // Return a minimal, fresh snapshot after mutations
      const [team, tmRole] = await Promise.all([
        tx.team.findUnique({ where: { uid: teamUid }, include: { investorProfile: true } }),
        tx.teamMemberRole.findUnique({ where: { memberUid_teamUid: { memberUid: member.uid, teamUid } } }),
      ]);

      return {
        teamUid,
        memberUid: member.uid,
        team: {
          isFund: team?.isFund ?? null,
          investorProfile: team?.investorProfile ?? null,
        },
        teamMemberRole: tmRole,
      };
    });
  }

  /* Creates or updates team's investor profile.
     PRECONDITION: caller is already verified as a team lead for this team.
     - If investorProfile exists -> update it
     - If not -> create it and link to the team
   */
  private async upsertInvestorProfileAsTeamLead(
    tx: Prisma.TransactionClient,
    teamUid: string,
    investorProfileData: {
      investmentFocus?: string[];
      investInStartupStages?: string[];
      investInFundTypes?: string[];
      typicalCheckSize?: number | null;
    }
  ) {
    // Fetch team to check existence and current investorProfileId link
    const team = await tx.team.findUnique({
      where: { uid: teamUid },
      select: { uid: true, name: true, investorProfileId: true },
    });
    if (!team) throw new NotFoundException('Team not found');

    // Always upsert investor profile — avoids duplicate key error
    const investorProfile = await tx.investorProfile.upsert({
      where: { teamUid: teamUid },
      create: {
        teamUid,
        investmentFocus: investorProfileData.investmentFocus ?? [],
        typicalCheckSize: investorProfileData.typicalCheckSize ?? null,
        investInStartupStages: investorProfileData.investInStartupStages ?? [],
        investInFundTypes: investorProfileData.investInFundTypes ?? [],
      },
      update: {
        investmentFocus: investorProfileData.investmentFocus ?? [],
        typicalCheckSize: investorProfileData.typicalCheckSize ?? null,
        investInStartupStages: investorProfileData.investInStartupStages ?? [],
        investInFundTypes: investorProfileData.investInFundTypes ?? [],
      },
    });

    // Link the profile to the team if missing
    if (!team.investorProfileId) {
      await tx.team.update({
        where: { uid: teamUid },
        data: { investorProfileId: investorProfile.uid },
      });
    }
  }
}
