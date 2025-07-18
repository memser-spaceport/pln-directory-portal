import { Req, Controller, Body, Param, UsePipes, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { ProjectsService } from './projects.service';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { apiProjects } from '../../../../libs/contracts/src/lib/contract-project';
import { CreateProjectDto, UpdateProjectDto } from 'libs/contracts/src/schema/project';
import { NoCache } from '../decorators/no-cache.decorator';
import { ResponseProjectWithRelationsSchema } from 'libs/contracts/src/schema';
import { ZodValidationPipe } from 'nestjs-zod';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { AccessLevelsGuard } from '../guards/access-levels.guard';
import { AccessLevels } from '../decorators/access-levels.decorator';
import { AccessLevel } from '../../../../libs/contracts/src/schema/admin-member';

const server = initNestServer(apiProjects);
type RouteShape = typeof server.routeShapes;

@Controller()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Api(server.route.getProjectFilters)
  @NoCache()
  async getProjectFilters(@Req() req) {
    // return await this.projectsService.getProjectFilters();
    const queryableFields = prismaQueryableFieldsFromZod(ResponseProjectWithRelationsSchema);
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(req.query);
    const { focusAreas, tags }: any = req.query;
    if (tags) {
      delete builtQuery.where.tags;
    }
    builtQuery.where = {
      AND: [
        {
          isDeleted: false,
        },
        builtQuery.where ? builtQuery.where : {},
        this.projectsService.buildFocusAreaFilters(focusAreas),
        this.projectsService.buildRecentProjectsFilter(req.query),
        this.projectsService.buildAskTagFilter(req.query),
        this.projectsService.buildTagFilter(tags),
      ],
    };
    return await this.projectsService.getProjectFilters(builtQuery);
  }

  @Api(server.route.createProject)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation, AccessLevelsGuard)
  @AccessLevels(AccessLevel.L2, AccessLevel.L3, AccessLevel.L4)
  async create(@Body() body: CreateProjectDto, @Req() request): Promise<any> {
    return await this.projectsService.createProject(body as any, request.userEmail);
  }

  @Api(server.route.modifyProject)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation, AccessLevelsGuard)
  @AccessLevels(AccessLevel.L2, AccessLevel.L3, AccessLevel.L4)
  update(@Param('uid') uid: string, @Body() body: UpdateProjectDto, @Req() request) {
    return this.projectsService.updateProjectByUid(uid, body as any, request.userEmail);
  }

  @Api(server.route.getProjects)
  @ApiOkResponseFromZod(ResponseProjectWithRelationsSchema.array())
  async findAll(@Req() req) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseProjectWithRelationsSchema);
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(req.query);
    const { focusAreas, tags }: any = req.query;
    if (tags) {
      delete builtQuery.where.tags;
    }
    builtQuery.where = {
      AND: [
        {
          isDeleted: false,
        },
        builtQuery.where ? builtQuery.where : {},
        this.projectsService.buildFocusAreaFilters(focusAreas),
        this.projectsService.buildRecentProjectsFilter(req.query),
        this.projectsService.buildAskTagFilter(req.query),
        this.projectsService.buildTagFilter(tags),
      ],
    };
    return this.projectsService.getProjects(builtQuery);
  }

  @Api(server.route.getProject)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiOkResponseFromZod(ResponseProjectWithRelationsSchema)
  async findOne(@ApiDecorator() { params: { uid } }: RouteShape['getProject']) {
    const project = await this.projectsService.getProjectByUid(uid);
    if (!project || project.isDeleted) {
      throw new NotFoundException(`Project not found with uid: ${uid}.`);
    }
    return project;
  }

  @Api(server.route.removeProject)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation, AccessLevelsGuard)
  @AccessLevels(AccessLevel.L2, AccessLevel.L3, AccessLevel.L4)
  remove(@Param('uid') uid: string, @Req() request) {
    return this.projectsService.removeProjectByUid(uid, request.userEmail);
  }

  @Api(server.route.patchAskProject)
  @UseGuards(UserTokenValidation, AccessLevelsGuard)
  @AccessLevels(AccessLevel.L2, AccessLevel.L3, AccessLevel.L4)
  async addEditAsk(@Param('uid') projectUid, @Body() body, @Req() req) {
    return await this.projectsService.addEditProjectAsk(projectUid, req.userEmail, body);
  }
}
