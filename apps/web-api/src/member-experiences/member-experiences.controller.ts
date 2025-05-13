import { 
  Body, 
  Controller, 
  UseGuards, 
  UsePipes, 
  NotFoundException,
  Req,
} from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { MemberExperiencesService } from './member-experiences.service';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { 
  CreateMemberExperienceDto, 
  ResponseMemberExperienceSchema,
  ResponseMemberExperienceWithRelationsSchema
} from '../../../../libs/contracts/src/schema/member-experience';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { ZodValidationPipe } from 'nestjs-zod';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { apiMemberExperiences } from '../../../../libs/contracts/src/lib/contract-member-experience';

const server = initNestServer(apiMemberExperiences);
type RouteShape = typeof server.routeShapes;

@Controller()
export class MemberExperiencesController {
  constructor(private readonly memberExperiencesService: MemberExperiencesService,
  ) {}

  @Api(server.route.createMemberExperience)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  async create(
    @Body() body: CreateMemberExperienceDto
  ){
    return await this.memberExperiencesService.create(body as any);
  }

  @Api(server.route.getMemberExperience)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiOkResponseFromZod(ResponseMemberExperienceWithRelationsSchema)
  async findOne(
    @ApiDecorator() { params: { uid } }: RouteShape['getMemberExperience']
  ) {
    return await this.memberExperiencesService.findOne(uid);
  }

  @Api(server.route.getMemberExperienceByMemberUid)
  @ApiParam({ name: 'memberUid', type: 'string' })
  @ApiOkResponseFromZod(ResponseMemberExperienceWithRelationsSchema)
  async getMemberExperienceByMemberUid(@ApiDecorator() { params: { uid } }: RouteShape['getMemberExperienceByMemberUid']) {
    return await this.memberExperiencesService.getAllMemberExperience(uid);
  }

  @Api(server.route.updateMemberExperience)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiOkResponseFromZod(ResponseMemberExperienceSchema)
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  async update(
    @ApiDecorator() { params: { uid }, body }: RouteShape['updateMemberExperience'],
    @Req() req
  ) {
    return await this.memberExperiencesService.update(uid, body as any,req.userEmail);
  }

  @Api(server.route.deleteMemberExperience)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiOkResponseFromZod(ResponseMemberExperienceSchema)
  @UseGuards(UserTokenValidation)
  async remove(
    @ApiDecorator() { params: { uid } }: RouteShape['deleteMemberExperience']
  ) {
    return await this.memberExperiencesService.remove(uid);
  }
} 