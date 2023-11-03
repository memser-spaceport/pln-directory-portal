import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { Prisma } from '@prisma/client';
import { MembersService } from '../members/members.service';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private memberService: MembersService,
    private logger: LogService,
  ) {}

  async createProject(project: Prisma.ProjectUncheckedCreateInput, userEmail: string) {
    try {
      const member:any = await this.getMemberInfo(userEmail);
      await this.checkDirectoryAdminOrTeamLead(member, project.teamUid);
      project.createdBy = member.uid;
      return await this.prisma.project.create({
        data: project
      });
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
      await this.checkDirectoryAdminOrTeamLead(member, project.teamUid);
      return await this.prisma.project.update({
        where: {
          uid,
        },
        data: {
          ...project
        }
      });
    } catch(err) {
      this.handleErrors(err, `${uid}`);
    }
  }

  async getProjects(queryOptions: Prisma.ProjectFindManyArgs) {
    try {
      queryOptions.include = {
        team: { select: { uid: true, name: true, logo: true }},
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
          team: { select: { uid: true, name: true, logo: true }},
          creator: { select: { uid: true, name: true, image: true }},
          logo: true
        }
      });
    } catch(err) {
      this.handleErrors(err, `${uid}`);
    }
  }

  async removeProjectByUid(
    uid: string
  ) {
    try {
      return await this.prisma.project.delete({
        where: { uid }
      });
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

  async checkDirectoryAdminOrTeamLead(member, teamUid) {
    if (this.memberService.checkIfAdminUser(member)) {
      return true;
    }
    const res = await this.memberService.isMemberLeadTeam(member, teamUid);
    if (res) {
      return res;
    } else {
      throw new ForbiddenException(`Member isn't lead to the team ${teamUid}`);
    }
  }
}
