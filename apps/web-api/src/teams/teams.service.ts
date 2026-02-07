import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import { z } from 'zod';
import { isEmpty } from 'lodash';
import { AskStatus, Member, Prisma, Team } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { AirtableTeamSchema } from '../utils/airtable/schema/airtable-team.schema';
import { FileMigrationService } from '../utils/file-migration/file-migration.service';
import { NotificationService } from '../utils/notification/notification.service';
import { hashFileName } from '../utils/hashing';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';
import { MembersService } from '../members/members.service';
import { LogService } from '../shared/log.service';
import { buildMultiRelationMapping, buildRelationMapping, copyObj } from '../utils/helper/helper';
import { CacheService } from '../utils/cache/cache.service';
import { AskService } from '../asks/asks.service';
import { TeamsHooksService } from './teams.hooks.service';
import { ParticipantsRequest } from './dto/members.dto';
import { SelfUpdatePayload } from './dto/teams.dto';
import { MemberRole, isDirectoryAdmin } from '../utils/constants';

@Injectable()
export class TeamsService {
  constructor(
    private prisma: PrismaService,
    private fileMigrationService: FileMigrationService,
    @Inject(forwardRef(() => MembersService))
    private membersService: MembersService,
    private logger: LogService,
    private forestadminService: ForestAdminService,
    private notificationService: NotificationService,
    private cacheService: CacheService,
    private askService: AskService,
    private teamsHooksService: TeamsHooksService
  ) { }

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
        // accessLevel: {
        //   not: 'L0',
        // },
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
  async updateTeamAccessLevel(teamUid: string, tx?: Prisma.TransactionClient, accessLevel?: string): Promise<Team> {
    const prisma = tx || this.prisma;

    // If caller explicitly passed accessLevel → always use it
    if (accessLevel !== undefined) {
      return prisma.team.update({
        where: { uid: teamUid },
        data: {
          accessLevel,
          accessLevelUpdatedAt: new Date(),
        },
      });
    }

    // If accessLevel wasn't passed
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

    const computedLevel = activeMemberCount > 0 ? 'L1' : null;

    return prisma.team.update({
      where: { uid: teamUid },
      data: {
        accessLevel: computedLevel,
        accessLevelUpdatedAt: new Date(),
      },
    });
  }

  /**
   * Soft deletes a team by marking it as L0 (inactive).
   * Teams with L0 access level are not visible in queries.
   * Only users with DIRECTORY_ADMIN role can soft delete teams.
   *
   * @param teamUid - Unique identifier for the team to soft delete
   * @returns The updated team with L0 access level
   * @throws {NotFoundException} If the team with the given UID is not found
   */
  async softDeleteTeam(teamUid: string): Promise<Team> {
    try {
      const team = await this.prisma.team.update({
        where: { uid: teamUid },
        data: {
          accessLevel: 'L0',
          accessLevelUpdatedAt: new Date(),
        },
      });

      this.logger.info(`Team ${teamUid} has been soft deleted (marked as L0)`);
      return team;
    } catch (err) {
      return this.handleErrors(err, teamUid);
    }
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
  async findTeamByUid(
    uid: string,
    userEmail?: string,
    queryOptions: Omit<Prisma.TeamFindUniqueArgsBase, 'where'> = {}
  ): Promise<Team> {
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
        if (!userEmail) {
          throw new ForbiddenException('Team is inactive');
        } else {
          await this.validateRequestor(userEmail, team.uid);
        }
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

  async findTeamByNameSafe(name: string): Promise<Team | null> {
    const normalized = String(name || '').trim();
    if (!normalized) {
      return null;
    }

    try {
      return await this.prisma.team.findFirst({
        where: { name: normalized },
      });
    } catch (e) {
      this.logger.error('[findTeamByNameSafe] Failed to find team by name="' + normalized + '"', e as any);
      return null;
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
      'tier',
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
        where: { memberRoles: { some: { name: MemberRole.DIRECTORY_ADMIN } } },
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

    const tierFilter = this.buildTierFilter(queryParams.tiers);
    if (Object.keys(tierFilter).length) filter.push(tierFilter);

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

  buildTierFilter(tiersCsv?: string) {
    if (!tiersCsv) return {};
    const tiers = tiersCsv
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .map((n) => Number(n))
      .filter((n) => !Number.isNaN(n));

    if (tiers.length === 0) return {};
    return { tier: { in: tiers } };
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
  async getTeamFilters(queryParams, userEmail: string | null) {
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

    const canSee = await this.canSeeTiers(userEmail || undefined);
    const tiers = canSee ? await this.getTierCounts(queryParams.where ?? {}) : undefined;

    // Sort funding stages using universal sorting logic
    const sortedFundingStages = this.sortFundingStages(fundingStages.map((stage) => stage.title));

    return {
      industryTags: industryTags.map((tag) => tag.title),
      membershipSources: membershipSources.map((source) => source.title),
      fundingStages: sortedFundingStages,
      technologies: technologies.map((tech) => tech.title),
      askTags: this.askService.formatAskFilterResponse(askTags),
      ...(canSee ? { tiers } : {}),
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
  async getAllPLEventContibutors(queryParams: any = {}) {
    try {
      const search = (queryParams?.search ?? '').toString().trim();

      const filter = (queryParams?.filter ?? 'all')
        .toString()
        .trim()
        .toLowerCase(); // all | host | speaker | sponsor

      const whereGuests =
        filter === 'host'
          ? { isHost: true }
          : filter === 'speaker'
            ? { isSpeaker: true }
            : filter === 'sponsor'
              ? { isSponsor: true }
              : { OR: [{ isHost: true }, { isSpeaker: true }, { isSponsor: true }] };

      let where: any = {
        eventGuests: {
          some: whereGuests,
        },
      };

      if (search) {
        where = {
          AND: [
            {
              eventGuests: {
                some: whereGuests,
              },
            },
            {
              OR: [
                {
                  name: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  eventGuests: {
                    some: {
                      ...whereGuests,
                      member: {
                        name: {
                          contains: search,
                          mode: 'insensitive',
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        };
      }

      return await this.prisma.team.findMany({
        where,
        select: {
          uid: true,
          name: true,
          logo: true,
          eventGuests: {
            where: whereGuests,
            distinct: ['memberUid'],
            select: {
              uid: true,
              isHost: true,
              isSpeaker: true,
              isSponsor: true,
              memberUid: true,
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

    const { role, investmentTeam, isFund, investorProfile, website } = body ?? {};

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
      const wantsPrivileged =
        isFund !== undefined || (investorProfile && Object.keys(investorProfile).length > 0) || website !== undefined;

      if (wantsPrivileged) {
        // Check caller's role in this team: must be teamLead === true
        const myRole = await tx.teamMemberRole.findUnique({
          where: { memberUid_teamUid: { memberUid: requestorMember.uid, teamUid } },
          select: { teamLead: true },
        });
        const hasAccess = requestorMember.isDirectoryAdmin || myRole?.teamLead;

        if (hasAccess) {
          // Update team.isFund if requested
          if (isFund !== undefined) {
            await tx.team.update({ where: { uid: teamUid }, data: { isFund } });
          }

          // Create/update investor profile (no global ACLs here; team lead is enough)
          if (investorProfile) {
            await this.upsertInvestorProfileAsTeamLead(tx, teamUid, investorProfile);
          }

          if (website !== undefined) {
            await tx.team.update({ where: { uid: teamUid }, data: { website } });
          }
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
        data: { investorProfileId: investorProfile.uid, isFund: true },
      });
    } else {
      await tx.team.update({
        where: { uid: teamUid },
        data: { isFund: true },
      });
    }
  }

  /**
   * Advanced team search with filtering
   * @param filters - Filter parameters including isFund, typicalCheckSize range, and investmentFocus
   * @returns Paginated search results with teams and metadata
   */
  async searchTeams(filters: {
    searchBy?: string;
    membershipSources?: string;
    focusAreas?: string;
    fundingStage?: string;
    tags?: string;
    isFund?: boolean | string;
    minTypicalCheckSize?: number | string;
    maxTypicalCheckSize?: number | string;
    investmentFocus?: string[];
    sort?: 'name:asc' | 'name:desc';
    page?: number | string;
    limit?: number | string;
    tiers?: string | number[];
    plnFriend?: string;
  }) {
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    // Base where clause excluding L0 access level
    const baseWhere: Prisma.TeamWhereInput = {
      accessLevel: {
        not: 'L0',
      },
    };

    const whereConditions: Prisma.TeamWhereInput[] = [baseWhere];

    // isFund filter - convert string to boolean
    if (filters.isFund !== undefined) {
      const isFundValue = typeof filters.isFund === 'string' ? filters.isFund === 'true' : filters.isFund;
      whereConditions.push({
        isFund: isFundValue,
      });
    }

    // plnFriend filter - only apply if explicitly specified
    if (filters.plnFriend !== undefined) {
      whereConditions.push({
        plnFriend: filters.plnFriend === 'true',
      });
    }

    // Search filter - search by team name
    if (filters.searchBy && filters.searchBy.trim()) {
      const searchTerm = filters.searchBy.trim();
      whereConditions.push({
        name: {
          contains: searchTerm,
          mode: 'insensitive',
        },
      });
    }

    if (filters.membershipSources && filters.membershipSources.length > 0) {
      whereConditions.push({
        membershipSources: {
          some: {
            title: {
              in: filters.membershipSources.split('|'),
              mode: 'insensitive',
            },
          },
        },
      });
    }

    if (filters.focusAreas && filters.focusAreas.length > 0) {
      console.log('filters.focusAreas', filters.focusAreas);
      whereConditions.push({
        teamFocusAreas: {
          some: {
            ancestorArea: {
              title: {
                in: filters.focusAreas.split('|'),
                mode: 'insensitive',
              },
            },
          },
        },
      });
    }

    if (filters.tags && filters.tags.length > 0) {
      whereConditions.push({
        industryTags: {
          some: {
            title: {
              in: filters.tags.split('|'),
              mode: 'insensitive',
            },
          },
        },
      });
    }

    if (filters.fundingStage && filters.fundingStage.length > 0) {
      whereConditions.push({
        fundingStage: {
          title: {
            in: filters.fundingStage.split('|'),
            mode: 'insensitive',
          },
        },
      });
    }

    // Typical check size filter
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

    if (filters.tiers) {
      const tiersCsv = Array.isArray(filters.tiers) ? filters.tiers.join(',') : (filters.tiers as string);
      const tierWhere = this.buildTierFilter(tiersCsv);
      if (Object.keys(tierWhere).length) {
        whereConditions.push(tierWhere);
      }
    }

    // Investment focus filter - using substring matching
    if (filters.investmentFocus && filters.investmentFocus.length > 0) {
      // Ensure investmentFocus is always an array (query params might come as string)
      const focusArray = Array.isArray(filters.investmentFocus) ? filters.investmentFocus : [filters.investmentFocus];

      // Get team IDs that match investment focus using substring matching
      const matchingTeamIds = await this.prisma.$queryRaw<{ id: number }[]>`
        SELECT DISTINCT t.id FROM "Team" t
        INNER JOIN "InvestorProfile" ip ON t."investorProfileId" = ip.uid
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

      if (matchingTeamIds.length > 0) {
        whereConditions.push({
          id: {
            in: matchingTeamIds.map((row) => row.id),
          },
        });
      } else {
        // If no teams match, add an impossible condition to return no results
        whereConditions.push({
          id: {
            in: [],
          },
        });
      }
    }

    const where: Prisma.TeamWhereInput = {
      AND: whereConditions,
    };

    // Sorting - always include a unique secondary sort (uid) to ensure deterministic pagination
    const orderBy: Prisma.TeamOrderByWithRelationInput[] = [];
    if (filters.sort === 'name:desc') {
      orderBy.push({ name: 'desc' }, { uid: 'asc' });
    } else if (filters.sort === 'name:asc') {
      orderBy.push({ name: 'asc' }, { uid: 'asc' });
    } else {
      orderBy.push({ tier: 'desc' }, { uid: 'asc' }); // Default to descending tier order
    }

    try {
      const [teams, total] = await Promise.all([
        this.prisma.team.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          select: {
            uid: true,
            name: true,
            isFund: true,
            shortDescription: true,
            tier: true,
            website: true,
            logo: {
              select: {
                uid: true,
                url: true,
              },
            },
            investorProfile: {
              select: {
                uid: true,
                investmentFocus: true,
                typicalCheckSize: true,
                investInStartupStages: true,
                type: true,
              },
            },
            industryTags: {
              select: {
                title: true,
              },
            },
            fundingStage: {
              select: {
                title: true,
              },
            },
          },
        }),
        this.prisma.team.count({ where }),
      ]);

      return {
        teams,
        total,
        page,
        hasMore: skip + teams.length < total,
      };
    } catch (error) {
      this.logger.error('Error searching teams:', error);
      throw error;
    }
  }

  async getTierCounts(where: Prisma.TeamWhereInput) {
    const baseWhere: Prisma.TeamWhereInput = {
      accessLevel: { not: 'L0' },
      ...where,
    };

    const grouped = await this.prisma.team.groupBy({
      by: ['tier'],
      where: baseWhere,
      _count: { _all: true },
    });

    const counts: Record<number, number> = { [-1]: 0, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const row of grouped) {
      if (row.tier !== null) {
        const t = (row.tier ?? 0) as number;
        if (t <= 4) counts[t] = row._count._all;
      }
    }

    return [
      { tier: 0, count: counts[0] },
      { tier: 1, count: counts[1] },
      { tier: 2, count: counts[2] },
      { tier: 3, count: counts[3] },
      { tier: 4, count: counts[4] },
      { tier: -1, count: counts[-1] },
    ];
  }

  private async canSeeTiers(actorEmail?: string): Promise<boolean> {
    if (!actorEmail) return false;

    const member = await this.membersService.findMemberByEmail(actorEmail);
    if (!member) return false;

    const memberIsDirectoryAdmin = member.memberRoles
      ? isDirectoryAdmin(member as { memberRoles: Array<{ name: string }> })
      : false;

    return !!member.isTierViewer || memberIsDirectoryAdmin;
  }

  /**
   * Sorts funding stages in the following order:
   * 1. Pre-seed
   * 2. Seed
   * 3. Series A-Z (alphabetically)
   * 4. Others (alphabetically)
   *
   * @param stages - Array of funding stage titles to sort
   * @returns Sorted array of funding stage titles
   */
  private sortFundingStages(stages: string[]): string[] {
    return stages.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();

      // Pre-seed always comes first
      if (aLower === 'pre-seed') return -1;
      if (bLower === 'pre-seed') return 1;

      // Seed comes second
      if (aLower === 'seed') return -1;
      if (bLower === 'seed') return 1;

      // Extract Series letter (e.g., "Series A" -> "A")
      const seriesRegex = /^series\s+([a-z])$/i;
      const aMatch = a.match(seriesRegex);
      const bMatch = b.match(seriesRegex);

      // Both are Series - sort by letter
      if (aMatch && bMatch) {
        return aMatch[1].localeCompare(bMatch[1]);
      }

      // Only a is Series - a comes before b
      if (aMatch) return -1;

      // Only b is Series - b comes before a
      if (bMatch) return 1;

      // Neither is Pre-seed, Seed, or Series - sort alphabetically
      return a.localeCompare(b);
    });
  }

  /**
   * Directly updates team's accessLevel (admin action).
   * Used by back-office to control team visibility and tiering.
   */
  async updateAccessLevel(uid: string, accessLevel: string): Promise<Team> {
    try {
      return await this.prisma.team.update({
        where: { uid },
        data: {
          accessLevel,
          accessLevelUpdatedAt: new Date(),
        },
      });
    } catch (err) {
      return this.handleErrors(err, uid);
    }
  }

  /**
   * Returns teams for back-office.
   * If includeL0 = true → returns all teams, including L0.
   * If includeL0 = false → excludes L0.
   */
  async findAllForAdmin(): Promise<Team[]> {
    try {
      return await this.prisma.team.findMany({
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      return this.handleErrors(err);
    }
  }

  /**
   * Creates a new Team from a "legacy" participants request payload,
   * but WITHOUT using the participants_request table.
   *
   * This is used by the new ParticipantsRequestService.processImmediateRequest()
   * to support the old /v1/participants-request endpoint while:
   *  - directly creating a Team entity
   *  - setting accessLevel = 'L0' (inactive / soft-created)
   *  - optionally attaching the requester as a team member (team lead)
   *
   * @param payload.newData - Raw team data from the request
   * @param payload.requesterEmailId - Email of the requester
   * @param requesterUser - Member entity for the requester (if available)
   */
  async createTeamFromLegacyRequest(
    payload: { newData: any; requesterEmailId?: string },
    requesterUser?: any
  ): Promise<Team> {
    const { newData, requesterEmailId } = payload;

    this.logger.info(
      `[TeamsService.createTeamFromLegacyRequest] Creating team from legacy request, name=${newData?.name}`
    );

    return this.prisma.$transaction(async (tx) => {
      // Reuse existing team formatting logic so industryTags, technologies, etc. work as before
      const { team: formattedTeam, investorProfileData } = await this.formatTeam(
        null,
        newData,
        tx,
        'Create' // keep the semantics consistent with existing code
      );

      // Force L0 access level for newly created teams in this flow
      formattedTeam.accessLevel =
        !requesterUser?.accessLevel || ['L0', 'L1'].includes(requesterUser?.accessLevel) ? 'L0' : 'L1';
      formattedTeam.accessLevelUpdatedAt = new Date();

      const createdTeam = await this.createTeam(formattedTeam, tx, requesterEmailId || newData?.requestorEmail || '');

      // Handle investor profile if present in newData
      if (investorProfileData) {
        this.logger.info(
          `[TeamsService.createTeamFromLegacyRequest] Updating investor profile for team ${createdTeam.uid}`
        );
        await this.updateTeamInvestorProfile(createdTeam.uid, investorProfileData, tx, requesterUser?.accessLevel);
      }

      // Optionally add requester as a team member (team lead, investment team flag, etc.)
      if (requesterUser) {
        const role = newData?.role || 'Lead';
        const investmentTeam = newData?.investmentTeam || false;

        this.logger.info(
          `[TeamsService.createTeamFromLegacyRequest] Adding requester ${requesterUser.uid} as team member for team ${createdTeam.uid}`
        );

        await tx.teamMemberRole.create({
          data: {
            teamUid: createdTeam.uid,
            memberUid: requesterUser.uid,
            role,
            teamLead: true,
            investmentTeam,
          },
        });
      }

      return createdTeam;
    });
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
        tier: -1,
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
}
