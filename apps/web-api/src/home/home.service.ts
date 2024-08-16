import { 
  Injectable, 
  InternalServerErrorException, 
  ConflictException, 
  BadRequestException,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LogService } from '../shared/log.service';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { ProjectsService } from '../projects/projects.service';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class HomeService {
  constructor(
    private logger: LogService,
    private memberService: MembersService,
    private teamsService: TeamsService,
    private plEventsService: PLEventsService,
    private projectsService: ProjectsService,
    private prisma: PrismaService
  ) {}

  async fetchAllFeaturedData() {
    try {
      return {
        members: await this.memberService.findAll({
          where: { isFeatured: true },
          include: {
            image: true,
            location: true,
            skills: true,
            teamMemberRoles: {
              include: {
                team: {
                  include: {
                    logo: true,
                  },
                },
              },
            },
          }
        }),
        teams: await this.teamsService.findAll(   {
          where: { isFeatured: true },
          include: {
            logo: true,
          }
        }),
        events: await this.plEventsService.getPLEvents({ where : { isFeatured: true }}),
        projects: await this.projectsService.getProjects({ where : { isFeatured: true }})
      };
    }
    catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException('Failed to fetch featured data');
    }
  }

  async fetchQuestionAndAnswers(
    query: Prisma.QuestionAndAnswerFindManyArgs
  ) {
    try {
      query.include = {
        ...query.include,
        team: {
          select: {
            uid: true,
            logo: true,
            name: true
          }
        },
        project: {
          select: {
            uid: true,
            logo: true,
            name: true
          }
        },
        plevent: {
          select: {
            uid: true,
            name: true,
            logo: true
          }
        }
      }
      return await this.prisma.questionAndAnswer.findMany(query);
    }
    catch (error) {
      this.handleErrors(error);
    }
  }

  async fetchQuestionAndAnswerBySlug(
    slug: string
  ) {
    try {
      return await this.prisma.questionAndAnswer.findUnique({
        where: { slug }
      });
    }
    catch (error) {
      this.handleErrors(error);
    }
  }

  async createQuestionAndAnswer(
    questionAndAnswer: Prisma.QuestionAndAnswerUncheckedCreateInput,
    loggedInMember
  ) {
    try {
      await this.prisma.questionAndAnswer.create({
         data: {
          ... {
            createdBy: loggedInMember.uid,
            modifiedBy: loggedInMember.uid,
            slug: Math.random().toString(36).substring(2, 8)
          },
          ...questionAndAnswer
         } 
      });
      return {
        msg: "success"
      }
    }
    catch (error) {
      this.handleErrors(error);
    }
  }

  async updateQuestionAndAnswerBySlug(
    slug: string, 
    questionAndAnswer: Prisma.QuestionAndAnswerUncheckedUpdateInput,
    loggedInMember
  ) {
    try {
      await this.prisma.questionAndAnswer.update({
        where: { slug },
        data: {
          ... {
            modifiedBy: loggedInMember.uid,
          },
          ...questionAndAnswer
         } 
      });
      return {
        msg: `success`
      };
    }
    catch (error) {
      this.handleErrors(error);
    }
  }

  async updateQuestionAndAnswerViewCount(slug: string) { 
    try {
      await this.prisma.questionAndAnswer.update({
        where: { slug },
        data: {
          viewCount: { increment: 1 }
        }
      });
      return {
        msg: `success`
      };
    }
    catch (error) {
      this.handleErrors(error);
    }
  }

  async updateQuestionAndAnswerShareCount(slug: string) {
    try {
      await this.prisma.questionAndAnswer.update({
        where: { slug },
        data: {
          shareCount: { increment: 1 }
        }
      });
      return {
        msg: `success`
      };
    }
    catch (error) {
      this.handleErrors(error);
    }
  }

  private handleErrors(error, message?) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          throw new ConflictException('Unique key constraint error on Question & Answer:', error.message);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on Question & Answer', error.message);
        case 'P2025':
          throw new NotFoundException('Question and Answer is not found with slug:' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database field validation error on Question & Answer', error.message);
    }
    throw error;
  };
}
