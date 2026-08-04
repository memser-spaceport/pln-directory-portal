import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { ApiInfoService } from './api-info.service';
import { ApiInfoResponse, ApiInfoResponseSchema } from './api-info.schema';

@ApiTags('Api Info')
@Controller('api-info')
export class ApiInfoController {
  constructor(private readonly apiInfoService: ApiInfoService) {}

  /**
   * Public, unauthenticated service metadata. Deliberately unversioned so that
   * probes and clients can identify the deployment without knowing an API version.
   */
  @Get()
  @NoCache()
  @ApiOperation({
    summary: 'Service information',
    description:
      'Returns the service name, environment, version, process uptime and the current UTC timestamp. ' +
      'Requires no authentication.',
  })
  @ApiOkResponseFromZod(ApiInfoResponseSchema)
  getApiInfo(): ApiInfoResponse {
    return this.apiInfoService.getApiInfo();
  }
}
