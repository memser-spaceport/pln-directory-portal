import { Controller, Get, Post } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import { Member as MemberModel } from '@prisma/client';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { apiMember } from '../../../../libs/contracts/src/lib/contract-member';
import { CreateMemberDto } from './dto/create-member.dto';

import { MembersService } from './members.service';

const server = initNestServer(apiMember);
type ControllerShape = typeof server.controllerShape;
type RouteShape = typeof server.routeShapes;

@Controller('member')
export class MemberController implements ControllerShape {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  async getAll(): Promise<MemberModel[]> {
    return this.membersService.findAll();
  }

  @Api(server.route.createMember)
  @ApiBody({ type: [CreateMemberDto] })
  @Post()
  async createMember(@ApiDecorator() { body }: RouteShape['createMember']) {
    const member = await this.membersService.create({
      name: body.name,
      email: body.email,
      image: body.image,
      githubHandler: body.githubHandler,
      discordHandler: body.discordHandler,
      twitterHandler: body.twitterHandler,
      officeHours: body.officeHours,
      plnFriend: body.plnFriend,
      location: {
        connect: {
          uid: body.locationUid,
        },
      },
    });

    return { status: 201 as const, body: member };
  }
}
