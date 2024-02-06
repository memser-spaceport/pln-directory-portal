import { Inject, CACHE_MANAGER, BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { Prisma } from '@prisma/client';
import { MembersService } from '../members/members.service';
import { Cache } from 'cache-manager';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private memberService: MembersService,
    private logger: LogService,
    @Inject(CACHE_MANAGER) private cacheService: Cache

  ) {}

  async createProject(project: Prisma.ProjectUncheckedCreateInput, userEmail: string) {
    try {
      const member:any = await this.getMemberInfo(userEmail);
      const { contributingTeams, contributors } : any = project;
      project.createdBy = member.uid;
      const result = await this.prisma.project.create({
        data: {
          ...project,
          contributingTeams: {
            connect: contributingTeams?.map(team => { return { uid: team.uid }})
          },
          contributors: {
            create: contributors?.map((contributor) => {
              return contributor;
            })
          }
        }
      });
      await this.cacheService.reset();
      return result;
    } catch(err) {
      this.handleErrors(err);
    }
  }

  async updateProjectByUid(
    uid: string,
    project: Prisma.ProjectUncheckedUpdateInput,
    userEmail: string
  ) {
    try {
      const member:any = await this.getMemberInfo(userEmail);
      const existingData = await this.getProjectByUid(uid);
      const contributingTeamsUid = existingData?.contributingTeams?.map(team => team.uid) || [];
      await this.isMemberAllowedToEdit(member, [existingData?.maintainingTeamUid, ...contributingTeamsUid], existingData);
      const { contributingTeams, contributors } : any = project;
      const contributorToCreate:any = [];
      const contributorUidsToDelete:any = [];
      contributors?.map((contributor) => {
        if (!contributor.uid) {
          contributorToCreate.push(contributor);
        }
        if (contributor.isDeleted) {
          contributorUidsToDelete.push({ uid: contributor.uid });
        }
      });
      const result = await this.prisma.project.update({
        where: {
          uid
        },
        data: {
          ...project,
          contributingTeams: {
            disconnect: contributingTeamsUid?.map(uid => { return { uid }}),
            connect: contributingTeams?.map(team => { return { uid: team.uid }}) || []
          },
          contributors: {
            create: contributorToCreate,
            deleteMany: contributorUidsToDelete
          }
        }
      });
      await this.cacheService.reset();
      return result;
    } catch(err) {
      this.handleErrors(err, `${uid}`);
    }
  }

  async getProjects(queryOptions: Prisma.ProjectFindManyArgs) {
    try {
      queryOptions.where = {
        ...queryOptions.where,
        isDeleted: false
      };
      queryOptions.include = {
        maintainingTeam: { select: { uid: true, name: true, logo: true }},
        creator: { select: { uid: true, name: true, image: true }},
        logo: true
      };
      return await this.prisma.project.findMany(queryOptions);
    } catch(err) {
      this.handleErrors(err);
    }
  }

  async getProjectByUid(
    uid: string
  ) {
    try {
      return await this.prisma.project.findUnique({
        where: { uid },
        include: {
          maintainingTeam: { select: { uid: true, name: true, logo: true }},
          contributingTeams: { select: { uid: true, name: true, logo: true }},
          contributors: { 
            select: { 
              uid: true,
              member: { 
                select: { 
                  uid: true, 
                  name: true, 
                  image: true ,
                  teamMemberRoles:{
                    select:{
                      mainTeam:true,
                      teamLead:true,
                      role:true,
                      team:{
                        select:{
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
          creator: { select: { uid: true, name: true, image: true }},
          logo: true
        }
      });
    } catch(err) {
      this.handleErrors(err, `${uid}`);
    }
  }

  async removeProjectByUid(
    uid: string,
    userEmail: string
  ) {
    const member:any = await this.getMemberInfo(userEmail);
    const existingData = await this.getProjectByUid(uid);
    await this.isMemberAllowedToDelete(member, existingData);
    try {
      const result = await this.prisma.project.update({
        where: { uid },
        data: { isDeleted: true }
      });
      await this.cacheService.reset();
      return result;
    } catch(err) {
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

  async isMemberAllowedToEdit(member, teams, project ) {
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
}
