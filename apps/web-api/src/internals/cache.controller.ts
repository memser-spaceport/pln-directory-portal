import { Controller, Get, UseGuards } from '@nestjs/common';
import { CacheService } from '../utils/cache/cache.service';
import { InternalAuthGuard } from '../guards/auth.guard';
import { LogService } from '../shared/log.service';

@Controller('cache')
export class CacheController {
  constructor(private cacheService: CacheService, private logService: LogService) { }

  @Get('/reset')
  @UseGuards(InternalAuthGuard)
  async resetCache() {
    try {
      await this.cacheService.flushCache();
      return { status: "success", message: "Cache reset successfully" };
    } catch (error) {
      this.logService.error('Error while flushing cache : ', error.message);
      return { status: "failed", message: "Failed to reset cache" };
    }

  }
}
