import { Controller } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { apiMembers } from '../../../../libs/contracts/src/lib/contract-member';
import { MembersService } from './members.service';

const server = initNestServer(apiMembers);
type RouteShape = typeof server.routeShapes;

@Controller()
export class MemberController {
  constructor(private readonly membersService: MembersService) {}

  @Api(server.route.getMembers)
  async findAll() {
    return this.membersService.findAll();
  }

  @Api(server.route.getMember)
  @ApiParam({ name: 'uid', type: 'string' })
  findOne(@ApiDecorator() { params: { uid } }: RouteShape['getMember']) {
    return this.membersService.findOne(uid);
  }
}
