import { Controller, Logger } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { apiNetworkOverview } from 'libs/contracts/src/lib/contract-network-overview';
import { NoCache } from '../decorators/no-cache.decorator';
import { NetworkOverviewService } from './network-overview.service';

const server = initNestServer(apiNetworkOverview);

@Controller()
export class NetworkOverviewController {
  private readonly logger = new Logger(NetworkOverviewController.name);

  constructor(private readonly networkOverviewService: NetworkOverviewService) {}

  @Api(server.route.getLatest)
  @NoCache()
  async getLatest() {
    return this.networkOverviewService.getLatest();
  }
}
