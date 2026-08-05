import { BadRequestException, Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GenerateNetworkOverviewDtoSchema } from 'libs/contracts/src/schema/network-overview';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { NetworkOverviewService } from './network-overview.service';

@ApiTags('Network Overview - Service')
@Controller('v1/service')
@UseGuards(ServiceAuthGuard)
export class NetworkOverviewServiceController {
  private readonly logger = new Logger(NetworkOverviewServiceController.name);

  constructor(private readonly networkOverviewService: NetworkOverviewService) {}

  @Post('network-overview/generate')
  async generate(@Body() body: unknown) {
    const parsed = GenerateNetworkOverviewDtoSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    this.logger.log(
      `Received network-overview generate: windowDays=${parsed.data.windowDays} runId=${parsed.data.runId ?? 'none'}`
    );
    return this.networkOverviewService.generate(parsed.data);
  }
}
