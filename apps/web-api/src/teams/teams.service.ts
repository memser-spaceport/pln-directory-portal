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
import { isEmpty } from 'lodash';
import { HuskyRevalidationService } from '../husky/husky-revalidation.service';
import { CREATE, UPDATE } from '../utils/constants';

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
    private huskyRevalidationService: HuskyRevalidationService
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
      const [teams, teamsCount] = await Promise.all([
        this.prisma.team.findMany(queryOptions),
        this.prisma.team.count({ where: queryOptions.where }),
      ]);
      return { count: teamsCount, teams: teams };
    } catch (err) {
      return this.handleErrors(err);
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
              isHost: true,
            },
            distinct: ['eventUid'],
            select: {
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
        },
      });
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
   * @returns The created team record
   */
  async createTeam(team: Prisma.TeamUncheckedCreateInput, tx: Prisma.TransactionClient): Promise<Team> {
    try {
      const createdTeam = await tx.team.create({
        data: team,
      });
      await this.postCreateActions(createdTeam.uid, CREATE);
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
    tx: Prisma.TransactionClient
  ): Promise<Team> {
    try {
      const updatedTeam = await tx.team.update({
        where: { uid },
        data: team,
      });
      await this.postUpdateActions(updatedTeam.uid);
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
    await this.prisma.$transaction(async (tx) => {
      const team = await this.formatTeam(teamUid, updatedTeam, tx, 'Update');
      result = await this.updateTeamByUid(teamUid, team, tx);
      const toAdd: any[] = [];
      const toDelete: any[] = [];
      if (updatedTeam?.teamMemberRoles?.length > 0) {
        for (const teamMemberRole of updatedTeam.teamMemberRoles) {
          const updatedRole = { ...teamMemberRole };
          delete updatedRole.status;
          switch (teamMemberRole?.status) {
            case 'Update':
              await this.updateTeamMemberRoleEntry(updatedRole, tx);
              break;

            case 'Delete':
              toDelete.push(updatedRole)
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
        await this.deleteTeamMemberRoleEntry(toDelete, tx);
      }
      await this.logParticipantRequest(requestorEmail, updatedTeam, existingTeam.uid, tx);
    });
    this.notificationService.notifyForTeamEditApproval(updatedTeam.name, teamUid, requestorEmail);
    await this.postUpdateActions(result.uid);
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
  private async deleteTeamMemberRoleEntry(teamAndRoles: any[], tx: Prisma.TransactionClient) {
    await tx.teamMemberRole.deleteMany({
      where: {
        OR: teamAndRoles
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
      data: teamAndRoles
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
    const formattedTeam = await this.formatTeam(null, newTeam, tx);
    const createdTeam = await this.createTeam(formattedTeam, tx);
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
  async formatTeam(teamUid: string | null, teamData: Partial<Team>, tx: Prisma.TransactionClient, type = 'Create') {
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
      : type === 'update'
        ? { disconnect: true }
        : undefined;
    return team;
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
   * Executes post-update actions such as resetting the cache and triggering Airtable sync.
   * This ensures that the system is up-to-date with the latest changes.
   */
  private async postUpdateActions(uid: string): Promise<void> {
    await this.cacheService.reset({ service: 'teams' });
    await this.huskyRevalidationService.triggerHuskyRevalidation('teams', uid, UPDATE);
    await this.forestadminService.triggerAirtableSync();
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

  buildAskTagFilter(queryParams, filter?){
    const { askTags } = queryParams;
    let tagFilter={}
    if(askTags){
      //when all is given as value to askTags, all the teams with asks are returned.
      if (askTags === 'all') {
        tagFilter = {
          asks: { some: {}, },
        };
      } else {
        const tags = askTags.split(',')
        tagFilter = {
          asks: { some: { tags: { hasSome: tags }, }, },
        };
      }
    }
    if (filter) {
      filter.push(tagFilter)
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
      })
    ]);


    return {
      industryTags: industryTags.map((tag) => tag.title),
      membershipSources: membershipSources.map((source) => source.title),
      fundingStages: fundingStages.map((stage) => stage.title),
      technologies: technologies.map((tech) => tech.title),
      askTags: this.askService.formatAskFilterResponse(askTags)
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
    if (isHost) {
      return {
        eventGuests: {
          some: {
            isHost: isHost,
          },
        },
      };
    }
    return {};
  }

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
              where: { uid: data.uid }
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
              OR: [
                { isHost: true },
                { isSpeaker: true }
              ]
            }
          }
        },
        select: {
          uid: true, 
          name: true,
          logo: true,
          eventGuests: {
            where: {
              OR: [
                { isHost: true },
                { isSpeaker: true }
              ]
            },
            distinct: ['memberUid'], // Ensures unique members per team
            select: {
              uid: true,
              isHost: true,
              isSpeaker: true,
              member: {
                select: {
                  uid: true,
                  name: true,
                  image: true
                }
              },
              event: {
                select: {
                  uid: true,
                  name: true
                }
              }
            }
          }
        }
      });
    } catch (error) {
      this.logger.error(`error occured while fetching event contributors`, error);
      this.handleErrors(error);
    }
  }

  /**
   * Executes post-create actions such as triggering n8n workflow.
   * This ensures that the system is up-to-date with the latest changes.
   */
  private async postCreateActions(uid: string, action: string): Promise<void> {
    await this.huskyRevalidationService.triggerHuskyRevalidation('teams', uid, action);
    }
  
}
