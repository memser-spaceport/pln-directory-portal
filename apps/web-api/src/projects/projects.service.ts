/* eslint-disable prettier/prettier */
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { Prisma } from '@prisma/client';
import { MembersService } from '../members/members.service';
import { CacheService } from '../utils/cache/cache.service';
import { AskService } from '../asks/asks.service';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private memberService: MembersService,
    private logger: LogService,
    private cacheService: CacheService,
    private askService: AskService
  ) { }

  async createProject(project: Prisma.ProjectUncheckedCreateInput, userEmail: string) {
    try {
      const member: any = await this.getMemberInfo(userEmail);
      const { contributingTeams, contributions, focusAreas }: any = project;
      project.createdBy = member.uid;
      project['projectFocusAreas'] = { ...await this.createProjectWithFocusAreas(focusAreas, this.prisma) };
      delete project['focusAreas'];
      const result = await this.prisma.project.create({
        data: {
          ...project,
          contributingTeams: {
            connect: contributingTeams?.map(team => { return { uid: team.uid } })
          },
          contributions: {
            create: contributions?.map((contribution) => {
              return contribution;
            })
          }
        }
      });
      await this.cacheService.reset({ service: 'projects'});
      return result;
    } catch (err) {
      this.handleErrors(err);
    }
  }

  async updateProjectByUid(
    uid: string,
    project: Prisma.ProjectUncheckedUpdateInput,
    userEmail: string
  ) {
    try {
      const member: any = await this.getMemberInfo(userEmail);
      const existingData: any = await this.getProjectByUid(uid);
      const contributingTeamsUid = existingData?.contributingTeams?.map(team => team.uid) || [];
      await this.isMemberAllowedToEdit(member, [existingData?.maintainingTeamUid, ...contributingTeamsUid], existingData);
      const { contributingTeams, contributions, focusAreas }: any = project;
      const contributionsToCreate: any = [];
      const contributionUidsToDelete: any = [];
      contributions?.map((contribution) => {
        if (!contribution.uid) {
          contributionsToCreate.push(contribution);
        }
        if (contribution.isDeleted) {
          contributionUidsToDelete.push({ uid: contribution.uid });
        }
      });
      return await this.prisma.$transaction(async (tx) => {
        project['projectFocusAreas'] = { ...await this.updateProjectWithFocusAreas(uid, focusAreas, tx) };
        delete project['focusAreas'];
        const result = await tx.project.update({
          where: {
            uid
          },
          data: {
            ...project,
            contributingTeams: {
              disconnect: contributingTeamsUid?.map(uid => { return { uid } }),
              connect: contributingTeams?.map(team => { return { uid: team.uid } }) || []
            },
            contributions: {
              create: contributionsToCreate,
              deleteMany: contributionUidsToDelete
            }
          }
        });
        await this.cacheService.reset({ service: 'projects'});
        return result;
      });
    } catch (err) {
      this.handleErrors(err, `${uid}`);
    }
  }

  async getProjects(queryOptions: Prisma.ProjectFindManyArgs) {
    try {
      const [projects, projectsCount] = await Promise.all([
        this.prisma.project.findMany(queryOptions),
        this.prisma.project.count({ where: queryOptions.where }),
      ]);
      return { count: projectsCount, projects: projects }
    } catch (err) {
      this.handleErrors(err);
    }
  }

  async getProjectByUid(
    uid: string
  ) {
    try {
      const project = await this.prisma.project.findUniqueOrThrow({
        where: { uid },
        include: {
          maintainingTeam: { select: { uid: true, name: true, logo: true } },
          contributingTeams: { select: { uid: true, name: true, logo: true } },
          contributions: {
            select: {
              uid: true,
              member: {
                select: {
                  uid: true,
                  name: true,
                  image: true,
                  teamMemberRoles: {
                    select: {
                      mainTeam: true,
                      teamLead: true,
                      role: true,
                      team: {
                        select: {
                          uid: true,
                          name: true
                        }
                      }
                    }
                  }
                }
              },
              projectUid: true
            }
          },
          creator: { select: { uid: true, name: true, image: true } },
          logo: true,
          projectFocusAreas: {
            select: {
              focusArea: {
                select: {
                  uid: true,
                  title: true
                }
              }
            }
          },
          asks: {
            select: {
              uid: true,
              title: true,
              description: true,
              tags: true,
              projectUid: true
            }
          }
        }
      });
      project['projectFocusAreas'] = this.removeDuplicateFocusAreas(project?.projectFocusAreas);
      return project;
    } catch (err) {
      this.handleErrors(err, `${uid}`);
    }
  }

  async removeProjectByUid(
    uid: string,
    userEmail: string
  ) {
    const member: any = await this.getMemberInfo(userEmail);
    const existingData = await this.getProjectByUid(uid);
    await this.isMemberAllowedToDelete(member, existingData);
    try {
      const result = await this.prisma.project.update({
        where: { uid },
        data: { isDeleted: true }
      });
      await this.cacheService.reset({ service: 'projects'});
      return result;
    } catch (err) {
      this.handleErrors(err, `${uid}`);
    }
  }

  private handleErrors(error, message?) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          throw new ConflictException('Unique key constraint error on Project:', error.message);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on Project', error.message);
        case 'P2025':
          throw new NotFoundException('Project is not found with uid:' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database field validation error on Project', error.message);
    }
    throw error;
  };

  async getMemberInfo(memberEmail) {
    return await this.memberService.findMemberByEmail(memberEmail)
  };

  async isMemberAllowedToEdit(member, teams, project) {
    const res = await this.memberService.isMemberPartOfTeams(member, teams);
    if (res || this.memberService.checkIfAdminUser(member) || member.uid === project.createdBy) {
      return true;
    } else {
      throw new ForbiddenException(`Member ${member.uid} isn't part of the any of the teams`);
    }
  }

  async isMemberAllowedToDelete(member, project) {
    const res = await this.memberService.isMemberLeadTeam(member, project.maintainingTeamUid);
    if (res || member.uid === project.createdBy || this.memberService.checkIfAdminUser(member)) {
      return true;
    } else {
      throw new ForbiddenException(`Member ${member.uid} isn't creator of the project ${project.uid} or leader of team ${project.maintainingTeamUid}`);
    }
  }

  async createProjectWithFocusAreas(focusAreas, transaction) {
    if (focusAreas && focusAreas.length) {
      const projectFocusAreas: any = [];
      const focusAreaHierarchies = await transaction.focusAreaHierarchy.findMany({
        where: {
          subFocusAreaUid: {
            in: focusAreas.map(area => area.uid)
          }
        }
      });
      focusAreaHierarchies.map(areaHierarchy => {
        projectFocusAreas.push({
          focusAreaUid: areaHierarchy.subFocusAreaUid,
          ancestorAreaUid: areaHierarchy.focusAreaUid
        });
      });
      focusAreas.map(area => {
        projectFocusAreas.push({
          focusAreaUid: area.uid,
          ancestorAreaUid: area.uid
        });
      });
      return {
        createMany: {
          data: projectFocusAreas
        }
      }
    }
  }

  async isFocusAreaModified(projectId, focusAreas, transaction) {
    const projectFocusAreas = await transaction.projectFocusArea.findMany({
      where: {
        projectUid: projectId
      }
    });
    const newFocusAreaUIds = focusAreas.map(area => area.uid);
    const focusAreasUIds = [...new Set(projectFocusAreas.map(area => area.focusAreaUid))];

    if (newFocusAreaUIds.length !== focusAreasUIds.length) {
      return true;
    }

    if (projectFocusAreas.length === 0 && focusAreas.length === 0) {
      return false
    }
    return !focusAreasUIds.every(area => newFocusAreaUIds.includes(area));
  }

  async updateProjectWithFocusAreas(projectId, focusAreas, transaction) {
    const isProjectFocusAreaModified = await this.isFocusAreaModified(projectId, focusAreas, transaction);
    if (isProjectFocusAreaModified) {
      if (focusAreas && focusAreas.length > 0) {
        await transaction.projectFocusArea.deleteMany({
          where: {
            projectUid: projectId
          }
        });
        return await this.createProjectWithFocusAreas(focusAreas, transaction)
      } else {
        await transaction.projectFocusArea.deleteMany({
          where: {
            projectUid: projectId
          }
        });
      }
      return {};
    }
  }

  buildFocusAreaFilters(focusAreas) {
    if (focusAreas?.split(',')?.length > 0) {
      return {
        projectFocusAreas: {
          some: {
            ancestorArea: {
              title: {
                in: focusAreas?.split(',')
              }
            }
          }
        }
      }
    }
    return {};
  }

  removeDuplicateFocusAreas(focusAreas): any {
    const uniqueFocusAreas = {};
    focusAreas.forEach(item => {
      const uid = item.focusArea.uid;
      const title = item.focusArea.title;
      uniqueFocusAreas[uid] = { uid, title };
    });
    return Object.values(uniqueFocusAreas);
  }

  buildProjectFilter(query) {
    const {
      name,
      lookingForFunding,
      team
    } = query;
    const filter: any = [{
      isDeleted: false
    }];
    this.buildNameFilter(name, filter);
    this.buildFundingFilter(lookingForFunding, filter);
    this.buildMaintainingTeamFilter(team, filter);
    this.buildRecentProjectsFilter(query, filter);
    filter.push(this.buildTagFilter(query.tags));
    return {
      AND: filter
    };
  }

  buildNameFilter(name, filter) {
    if (name) {
      filter.push({
        name: {
          contains: name,
          mode: 'insensitive'
        }
      });
    }
  }

  buildFundingFilter(funding, filter) {
    if (funding === "true") {
      filter.push({
        lookingForFunding: true
      });
    }
  }

  buildMaintainingTeamFilter(team, filter) {
    if (team) {
      filter.push({
        maintainingTeamUid: team
      });
    }
  }

  /**
   * Constructs a dynamic filter query for retrieving recent projects based on the 'is_recent' query parameter.
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
  buildRecentProjectsFilter(queryParams, filter?) {
    const { isRecent } = queryParams;
    const recentFilter = {
      createdAt: {
        gte: new Date(Date.now() - (parseInt(process.env.RECENT_RECORD_DURATION_IN_DAYS || '30') * 24 * 60 * 60 * 1000))
      }
    };
    if (isRecent === 'true' && !filter) {
      return recentFilter;
    }
    if (isRecent === 'true' && filter) {
      filter.push(recentFilter);
    }
    return {};
  }

  buildAskTagFilter(queryParams){
    const { askTags } = queryParams;
    let tagFilter={}
    if(askTags){
      const tags = askTags.split(',')
      tagFilter={
        asks: { some: { tags: { hasSome: tags }, }, },
      };
    }
      return tagFilter;
    }

    buildTagFilter(tags){
      let tagFilter={}
      if(tags){
        const filterValue = tags.split(',');
        tagFilter={
          tags: { hasSome : filterValue },
        };
      }
        return tagFilter;
      }

  /**
   * Fetches team names that maintain atleast a single project.
   * 
   * @returns Set of team names.
   */
  async getProjectFilters(queryParams) {
    const maintainingTeams = await this.prisma.team.findMany({
      where: {
        maintainingProjects: {
          some: {},
        }
      },
      select: {
        uid: true,
        name: true,
        logo: {
          select: {
            url: true
          }
        }
      }
    })

    const [askTags, tags] = await Promise.all([
      this.prisma.ask.findMany({
        where: {
          project: queryParams.where,
        },
        select: {
          tags: true,
        },
      }),
      this.prisma.project.findMany({
        where : queryParams.where,
        select: {
          tags: true,
        },
      })
    ])
    
    return {
      askTags: this.askService.formatAskFilterResponse(askTags),
      tags: this.aggregatePropertyCount(tags,'tags')
    }
    // return { maintainedBy: maintainingTeams.map((team) => ({ uid: team.uid, name: team.name, logo: team.logo?.url })) };
  }

  
  /**
   * Aggregates the counts of a specified property from an array of objects.
   *
   * @param responseArray - The array of objects to aggregate the property counts from.
   * @param property - The property whose values need to be counted.
   * @returns An array of objects, each containing a unique property value and its count.
   *
   * @example
   * ```typescript
   * const responseArray = [
   *   { tags: ['a', 'b', 'a'] },
   *   { tags: ['a', 'c'] },
   *   { tags: ['b', 'c'] }
   * ];
   * const property = 'tags';
   * const result = aggregatePropertyCounts(responseArray, property);
   * // result: [
   * //   { value: 'a', count: 3 },
   * //   { value: 'b', count: 2 },
   * //   { value: 'c', count: 2 }
   * // ]
   * ```
   */
  aggregatePropertyCount(responseArray, property) {
    const propertyCounts = responseArray
      .flatMap((item) => item[property]) // Flatten the property array
      .reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1; // Count occurrences
        return acc;
      }, {});
    return Object.entries(propertyCounts).map(([value, count]) => ({ value, count }));
  }

  async addEditProjectAsk(projectUid, requestorEmail, data){
    let res;
    try{
      //checking if the member has edit access
      const member: any = await this.memberService.findMemberByEmail(requestorEmail);
      const existingData: any = await this.getProjectByUid(projectUid);
      const contributingTeamsUid = existingData?.contributingTeams?.map(team => team.uid) || [];
      await this.isMemberAllowedToEdit(
        member,
        [existingData?.maintainingTeamUid, ...contributingTeamsUid],
        existingData
      );

      if (data.uid) {
        if (data.isDeleted) {
          //deleting asks
          res = await this.prisma.ask.delete({
            where: { uid: data.uid },
          });
        } else {
          //updating asks
          res = await this.prisma.ask.update({
            where: { uid: data.uid },
            data: {
              ...data,
            },
          });
        }
      }else{
        //creating asks
        res = await this.prisma.ask.create({
          data: {
            ...data,
            projectUid,
          },
        });
      }
      await this.cacheService.reset({ service: 'projects'});
      return res;
    }catch(err){
      console.error(err);
      throw err;
    }
  }
}
