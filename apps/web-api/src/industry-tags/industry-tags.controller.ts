import { Controller } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { apiIndustryTags } from 'libs/contracts/src/lib/contract-industry-tags';
import { IndustryTagsService } from './industry-tags.service';

const server = initNestServer(apiIndustryTags);
type RouteShape = typeof server.routeShapes;

@Controller()
export class IndustryTagsController {
  constructor(private readonly industryTagsService: IndustryTagsService) {}

  @Api(server.route.getIndustryTags)
  async findAll() {
    return this.industryTagsService.findAll();
  }

  @Api(server.route.getIndustryTag)
  @ApiParam({ name: 'uid', type: 'string' })
  findOne(@ApiDecorator() { params: { uid } }: RouteShape['getIndustryTag']) {
    return this.industryTagsService.findOne(uid);
  }

  // @Api(server.route.createIndustryTag)
  // async create(@ApiDecorator() { body }: RouteShape['createIndustryTag']) {
  //   const tag = await this.industryTagsService.create(body);

  //   if (!tag) return { status: 404 as const, body: null };

  //   return { status: 200 as const, body: tag };
  // }

  // @Api(server.route.updateIndustryTag)
  // update(
  //   @ApiDecorator() { body, params: { uid } }: RouteShape['updateIndustryTag']
  // ) {
  //   const tag = this.industryTagsService.update(uid, body);

  //   return { status: 200 as const, body: tag };
  // }

  // @Api(server.route.deleteIndustryTag)
  // remove(@ApiDecorator() { params: { uid } }: RouteShape['deleteIndustryTag']) {
  //   this.industryTagsService.remove(uid);
  //   return { status: 204 as const, body: null };
  // }
}
