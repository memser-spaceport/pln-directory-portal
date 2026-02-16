import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { Prisma } from '@prisma/client';

/**
 * Service responsible for retrieving detailed information about core entities.
 * Provides methods to fetch Member, Team, Project, and IRL Event details with complete relationships.
 * Handles database operations and error management for internal data access operations.
 * 
 * For entity association search, delegates to MembersService and TeamsService.
 */
@Injectable()
export class InternalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LogService,
    private readonly membersService: MembersService,
    private readonly teamsService: TeamsService
  ) { }

  /**
   * Fetches the details of a member by their unique identifier.
   * @param uid - The unique identifier of the member.
   * @returns A Promise that resolves to the member details.
   * @throws {NotFoundException} - If the member is not found with the provided UID.
   */
  async getMemberDetails(uid: string) {
    try {
      this.logger.info(`Fetching member details for uid ${uid}`);
      const member = await this.prisma.member.findUnique({
        where: { uid },
        include: {
          image: true,
          memberRoles: true,
          teamMemberRoles: {
            include: {
              team: {
                include: {
                  logo: true,
                  teamFocusAreas: {
                    include: {
                      focusArea: true,
                    },
                  },
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
            include: {
              event: true,
            },
          },
        },
      });

      if (!member) {
        throw new NotFoundException(`Member with uid ${uid} not found`);
      }
      return member;
    } catch (error) {
      this.logger.error(`Error getting member details for uid ${uid}:`, error);
      this.handleErrors(error);
    }
  }

  /**
   * Fetches the details of a team by their unique identifier.
   * @param uid - The unique identifier of the team.
   * @returns A Promise that resolves to the team details.
   * @throws {NotFoundException} - If the team is not found with the provided UID.
   */
  async getTeamDetails(uid: string) {
    try {
      this.logger.info(`Fetching Team details for uid ${uid}`);
      const team = await this.prisma.team.findUnique({
        where: { uid },
        include: {
          logo: true,
          teamMemberRoles: {
            include: {
              member: {
                include: {
                  image: true,
                  memberRoles: true,
                },
              },
            },
          },
          teamFocusAreas: {
            include: {
              focusArea: true,
            },
          },
          fundingStage: true,
          technologies: true,
          industryTags: true,
          asks: true,
          maintainingProjects: {
            include: {
              logo: true,
            },
          },
        },
      });

      if (!team) {
        throw new NotFoundException(`Team with uid ${uid} not found`);
      }

      return team;
    } catch (error) {
      this.logger.error(`Error getting team details for uid ${uid}:`, error);
      this.handleErrors(error);
    }
  }

  /**
   * Fetches the details of a project by their unique identifier.
   * @param uid - The unique identifier of the project.
   * @returns A Promise that resolves to the project details.
   * @throws {NotFoundException} - If the project is not found with the provided UID.
   */
  async getProjectDetails(uid: string) {
    try {
      this.logger.info(`Fetching Project details for uid ${uid}`);
      const project = await this.prisma.project.findUnique({
        where: { uid },
        include: {
          logo: true,
          maintainingTeam: {
            include: {
              logo: true,
              teamMemberRoles: {
                include: {
                  member: {
                    include: {
                      image: true,
                    },
                  },
                },
              },
            },
          },
          contributingTeams: {
            include: {
              logo: true,
            },
          },
          asks: true,
        },
      });

      if (!project) {
        throw new NotFoundException(`Project with uid ${uid} not found`);
      }

      return project;
    } catch (error) {
      this.logger.error(`Error getting project details for uid ${uid}:`, error);
      this.handleErrors(error);
    }
  }

  /**
   * Fetches the details of an IRL event by their unique identifier.
   * @param uid - The unique identifier of the IRL event.
   * @returns A Promise that resolves to the IRL event details.
   * @throws {NotFoundException} - If the IRL event is not found with the provided UID.
   */
  async getIrlEventDetails(uid: string) {
    try {
      this.logger.info(`Fetching IRL Event details for uid ${uid}`);
      const irlEvent = await this.prisma.pLEvent.findUnique({
        where: { uid },
        include: {
          logo: true,
          eventGuests: {
            include: {
              member: {
                include: {
                  image: true,
                  memberRoles: true,
                },
              },
            },
          },
          location: true,
        },
      });

      if (!irlEvent) {
        throw new NotFoundException(`IRL Event with uid ${uid} not found`);
      }

      return irlEvent;
    } catch (error) {
      this.logger.error(`Error getting IRL event details for uid ${uid}:`, error);
      this.handleErrors(error);
    }
  }

  /**
   * Search members using OpenSearch with optional email lookup.
   * 
   * @param params - Search parameters including optional searchTerm and email
   * @returns Array of matching members with normalized confidence scores (0-1)
   */
  async searchMembers(params: { searchTerm?: string; email?: string; limit: number }) {
    try {
      this.logger.info(`InternalsService.searchMembers: searchTerm=${params.searchTerm}, email=${params.email}, limit=${params.limit}`);
      return this.membersService.searchMemberMatches(params);
    } catch (error) {
      this.logger.error(`Error searching members:`, error);
      this.handleErrors(error);
    }
  }

  /**
   * Search teams using OpenSearch.
   *  
   * @param params - Search parameters including team name query
   * @returns Array of matching teams with normalized confidence scores (0-1)
   */
  async searchTeams(params: { searchTerm: string; limit: number }) {  
    this.logger.info(`InternalsService.searchTeams: searchTerm=${params.searchTerm}, limit=${params.limit}`);
    return this.teamsService.searchTeamMatches(params);
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
  }
}
