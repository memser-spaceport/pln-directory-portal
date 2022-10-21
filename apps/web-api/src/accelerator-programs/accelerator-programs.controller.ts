import { Controller } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { apiAcceleratorProgram } from 'libs/contracts/src/lib/contract-accelerator-program';
import { AcceleratorProgramsService } from './accelerator-programs.service';

const server = initNestServer(apiAcceleratorProgram);
type RouteShape = typeof server.routeShapes;

@Controller()
export class AcceleratorProgramsController {
  constructor(
    private readonly acceleratorProgramsService: AcceleratorProgramsService
  ) {}

  @Api(server.route.getAcceleratorPrograms)
  findAll() {
    return this.acceleratorProgramsService.findAll();
  }

  @Api(server.route.getAcceleratorProgram)
  @ApiParam({ name: 'uid', type: 'string' })
  async findOne(
    @ApiDecorator() { params: { uid } }: RouteShape['getAcceleratorProgram']
  ) {
    return this.acceleratorProgramsService.findOne(uid);
  }
}
