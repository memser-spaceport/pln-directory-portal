import { Controller, Get, Post } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import { Member as MemberSchema } from '@prisma/client';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { CreateMemberSchemaDto } from 'libs/contracts/src/schema';
import { apiMembers } from '../../../../libs/contracts/src/lib/contract-member';
import { MembersService } from './members.service';

const server = initNestServer(apiMembers);
type ControllerShape = typeof server.controllerShape;
type RouteShape = typeof server.routeShapes;

@Controller('member')
export class MemberController implements ControllerShape {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  async getAll(): Promise<MemberSchema[]> {
    return this.membersService.findAll();
  }

  @Api(server.route.createMember)
  @ApiBody({ type: [CreateMemberSchemaDto] })
  @Post()
  async createMember(@ApiDecorator() { body }: RouteShape['createMember']) {
    const member = await this.membersService.create(body);

    return { status: 201 as const, body: member };
  }
}
