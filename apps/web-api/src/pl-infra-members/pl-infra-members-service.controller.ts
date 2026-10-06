import { BadRequestException, Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlInfraMembersQuerySchema } from 'libs/contracts/src/schema/pl-infra-members';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { PlInfraMembersService } from './pl-infra-members.service';

@ApiTags('PL Infra Members - Service')
@Controller('v1/service')
@UseGuards(ServiceAuthGuard)
export class PlInfraMembersServiceController {
  constructor(private readonly plInfraMembersService: PlInfraMembersService) {}

  /** Live PL Infra user list for the MCP gateway (pull; read-only). */
  @Get('pl-infra-members')
  @Header('Cache-Control', 'no-store')
  async list(@Query() query: Record<string, unknown>) {
    const parsed = PlInfraMembersQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.plInfraMembersService.listMembers(parsed.data);
  }
}
