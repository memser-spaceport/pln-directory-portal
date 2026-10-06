import { Module } from '@nestjs/common';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { PlInfraMembersServiceController } from './pl-infra-members-service.controller';
import { PlInfraMembersService } from './pl-infra-members.service';

@Module({
  imports: [AccessControlV2Module],
  controllers: [PlInfraMembersServiceController],
  providers: [PlInfraMembersService],
})
export class PlInfraMembersModule {}
