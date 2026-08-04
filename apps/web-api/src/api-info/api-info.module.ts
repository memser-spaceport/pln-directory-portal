import { Module } from '@nestjs/common';
import { ApiInfoController } from './api-info.controller';
import { ApiInfoService } from './api-info.service';

@Module({
  controllers: [ApiInfoController],
  providers: [ApiInfoService],
  exports: [ApiInfoService],
})
export class ApiInfoModule {}
