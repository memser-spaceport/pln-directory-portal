import { Controller } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { apiSkills } from 'libs/contracts/src/lib/contract-skills';
import { SkillsService } from './skills.service';

const server = initNestServer(apiSkills);
type RouteShape = typeof server.routeShapes;

@Controller()
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Api(server.route.getSkills)
  findAll() {
    return this.skillsService.findAll();
  }

  @Api(server.route.getSkill)
  @ApiParam({ name: 'uid', type: 'string' })
  findOne(@ApiDecorator() { params: { uid } }: RouteShape['getSkill']) {
    return this.skillsService.findOne(uid);
  }
}
