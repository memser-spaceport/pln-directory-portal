import { Controller, Req, Body, Param, UsePipes, UseGuards, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { ZodValidationPipe } from 'nestjs-zod';
import { Request } from 'express';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { apiHome } from 'libs/contracts/src/lib/contract-home';
import { HomeService } from './home.service';
import {
  DiscoveryQuestionQueryParams,
  ResponseDiscoveryQuestionSchemaWithRelations,
  ResponseDiscoveryQuestionSchema,
  CreateDiscoveryQuestionSchemaDto,
  UpdateDiscoveryQuestionSchemaDto,
  TeamQueryParams,
  MemberQueryParams
} from 'libs/contracts/src/schema';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { MembersService } from '../members/members.service';
import { NoCache } from '../decorators/no-cache.decorator';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { HuskyService } from '../husky/husky.service';
import { UserAuthValidateGuard } from '../guards/user-auth-validate.guard';

const server = initNestServer(apiHome);
type RouteShape = typeof server.routeShapes;

@Controller()
export class HomeController {
  constructor(
    private homeService: HomeService,
    private memberService: MembersService,
    private huskyService: HuskyService
  ) { }

  @Api(server.route.getAllFeaturedData)
  @UseGuards(UserAuthValidateGuard)
  @NoCache()
  async getAllFeaturedData(
    @Req() request: Request,
  ) {
    const loggedlnMember = request['userEmail'] ? await this.memberService.findMemberByEmail(request['userEmail']) : null;
    return await this.homeService.fetchAllFeaturedData(loggedlnMember);
  }

  @Api(server.route.getAllDiscoveryQuestions)
  @ApiQueryFromZod(DiscoveryQuestionQueryParams)
  @ApiOkResponseFromZod(ResponseDiscoveryQuestionSchemaWithRelations.array())
  @NoCache()
  async getDiscoveryQuestions(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseDiscoveryQuestionSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return await this.huskyService.fetchDiscoverQuestions(builtQuery);
  }


  @Api(server.route.getDiscoveryQuestion)
  @ApiQueryFromZod(DiscoveryQuestionQueryParams)
  @ApiOkResponseFromZod(ResponseDiscoveryQuestionSchemaWithRelations)
  @NoCache()
  async getDiscoveryQuestion(@Param('slug') slug: string) {
    return await this.huskyService.fetchDiscoverQuestionBySlug(slug);
  }

  @Api(server.route.createDiscoveryQuestion)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  async addDiscoveryQuestion(
    @Body() discoveryQuestion: CreateDiscoveryQuestionSchemaDto,
    @Req() request
  ) {
    const userEmail = request["userEmail"];
    const member: any = await this.memberService.findMemberByEmail(userEmail);
    const result = await this.memberService.checkIfAdminUser(member);
    if (!result) {
      throw new ForbiddenException(`Member with email ${userEmail} isn't admin`);
    }
    return await this.huskyService.createDiscoverQuestion(discoveryQuestion as any, member);
  }

  @Api(server.route.updateDiscoveryQuestion)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  async modifyDiscoveryQuestion(
    @Param('slug') slug: string,
    @Body() discoveryQuestion: UpdateDiscoveryQuestionSchemaDto,
    @Req() request
  ) {
    const userEmail = request["userEmail"];
    const member: any = await this.memberService.findMemberByEmail(userEmail);
    const result = await this.memberService.checkIfAdminUser(member);
    if (!result) {
      throw new ForbiddenException(`Member with email ${userEmail} isn't admin`);
    }
    return await this.huskyService.updateDiscoveryQuestionBySlug(slug, discoveryQuestion as any, member);
  }

  @Api(server.route.updateDiscoveryQuestionShareCountOrViewCount)
  async modifyDiscoveryQuestionShareCountOrViewCount(
    @Param('slug') slug: string,
    @Body() body
  ) {
    const attribute = body.attribute;
    switch (attribute) {
      case "shareCount":
        return this.huskyService.updateDiscoveryQuestionShareCount(slug);
      case "viewCount":
        return this.huskyService.updateDiscoveryQuestionViewCount(slug);
      default:
        throw new BadRequestException(`Invalid attribute: ${attribute}`);
    }
  }

  /**
   * Retrieves a list of teams and projects based on search query.
   * 
   * @param request - HTTP request object containing query parameters
   * @returns Array of projects and teams.
   */
  @Api(server.route.getTeamsAndProjects)
  @ApiQueryFromZod(TeamQueryParams)
  @ApiQueryFromZod(MemberQueryParams)
  @NoCache()
  async getTeamsAndProjects(@Req() request: Request) {
    const queryParams = request.query;
    return this.homeService.fetchTeamsAndProjects(queryParams);
  }
}
