import { Controller, Req, Body, Param, UsePipes, UseGuards, ForbiddenException, ConflictException } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { ZodValidationPipe } from 'nestjs-zod';
import { Request } from 'express';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { apiHome } from 'libs/contracts/src/lib/contract-home';
import { HomeService } from './home.service';
import { 
  QuestionAndAnswerQueryParams,
  ResponseQuestionAndAnswerSchemaWithRelations,
  ResponseQuestionAndAnswerSchema,
  CreateQuestionAndAnswerSchemaDto,
  UpdateQuestionAndAnswerSchemaDto
} from 'libs/contracts/src/schema';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { MembersService } from '../members/members.service'; 
import { NoCache } from '../decorators/no-cache.decorator';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';

const server = initNestServer(apiHome);
type RouteShape = typeof server.routeShapes;

@Controller()
export class HomeController {
  constructor(
    private homeService: HomeService,
    private memberService: MembersService
  ) {}
  
  @Api(server.route.getAllFeaturedData)
  async getAllFeaturedData() {
    return await this.homeService.fetchAllFeaturedData();
  }

  @Api(server.route.getAllQuestionAndAnswers) 
  @ApiQueryFromZod(QuestionAndAnswerQueryParams)
  @ApiOkResponseFromZod(ResponseQuestionAndAnswerSchemaWithRelations.array())
  @NoCache()
  async getQuestionAndAnswers(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseQuestionAndAnswerSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return await this.homeService.fetchQuestionAndAnswers(builtQuery);
  }


  @Api(server.route.getQuestionAndAnswer) 
  @ApiQueryFromZod(QuestionAndAnswerQueryParams)
  @ApiOkResponseFromZod(ResponseQuestionAndAnswerSchemaWithRelations)
  @NoCache()
  async getQuestionAndAnswer(@Param('slug') slug: string) 
  {
    return await this.homeService.fetchQuestionAndAnswerBySlug(slug);
  }

  @Api(server.route.createQuestionAndAnswer)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  async addQuestionAndAnswer(
    @Body() questionAndAnswer: CreateQuestionAndAnswerSchemaDto,
    @Req() request
  ) {
    const userEmail = request["userEmail"];
    const member: any = await this.memberService.findMemberByEmail(userEmail);
    const result = await this.memberService.checkIfAdminUser(member);
    if (!result) {
      throw new ForbiddenException(`Member with email ${userEmail} isn't admin`);
    }
    return await this.homeService.createQuestionAndAnswer(questionAndAnswer as any, member);
  }

  @Api(server.route.updateQuestionAndAnswer)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  async modifyQuestionAndAnswer(
    @Param('slug') slug: string,
    @Body() questionAndAnswer: UpdateQuestionAndAnswerSchemaDto,
    @Req() request
  ) {
    const userEmail = request["userEmail"];
    const member: any = await this.memberService.findMemberByEmail(userEmail);
    const result = await this.memberService.checkIfAdminUser(member);
    if (!result) {
      throw new ForbiddenException(`Member with email ${userEmail} isn't admin`);
    }
    return await this.homeService.updateQuestionAndAnswerBySlug(slug, questionAndAnswer as any, member);
  }

  @Api(server.route.updateQuestionAndAnswerViewCount)
  async modifyQuestionAndAnswerViewCount(
    @Param('slug') slug: string
  ) {
    return await this.homeService.updateQuestionAndAnswerViewCount(slug);
  }

  @Api(server.route.updateQuestionAndAnswerShareCount)
  async modifyQuestionAndAnswerShareCount(
    @Param('slug') slug: string
  ) {
    return await this.homeService.updateQuestionAndAnswerShareCount(slug);
  }
}
