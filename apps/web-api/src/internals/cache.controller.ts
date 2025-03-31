import { Controller, Get } from '@nestjs/common';
import { CacheService } from '../utils/cache/cache.service';
import { NoCache } from '../decorators/no-cache.decorator';

@Controller('cache')
export class CacheController {
    constructor(private cacheService: CacheService) { }

    @Get('/reset')
    async resetCache() {
      return await this.cacheService.flushCache();
    }
}
