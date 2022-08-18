import { Controller, Get, Post } from '@nestjs/common';
import { Member as MemberModel } from '@prisma/client';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { apiMember } from '../../../../libs/contracts/src/lib/contract-member';

import { MemberService } from './member.service';

const s = initNestServer(apiMember);
type ControllerShape = typeof s.controllerShape;
type RouteShape = typeof s.routeShapes;
@Controller('member')
export class MemberController implements ControllerShape {
  constructor(private readonly memberService: MemberService) {}

  @Get()
  async getAll(): Promise<MemberModel[]> {
    return this.memberService.findAll();
  }

  @Api(s.route.createMember)
  @Post()
  async createMember(@ApiDecorator() { body }: RouteShape['createMember']) {
    const member = await this.memberService.create({
      name: body.name,
      email: body.email,
      image: body.image,
      githubHandler: body.githubHandler,
      discordHandler: body.discordHandler,
      twitterHandler: body.twitterHandler,
      officeHours: body.officeHours,
      plnFriend: body.plnFriend,
      locationUid: body.locationUid,
    });
    return { status: 201 as const, body: member };
  }
}
