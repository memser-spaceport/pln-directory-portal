import { Module } from '@nestjs/common';
import { JoinRequestsService } from './join-request.service';
import { JoinRequestsController } from './join-requests.controller';
import { AwsService } from '../utils/aws/aws.service';

@Module({
  controllers: [JoinRequestsController],
  providers: [JoinRequestsService, AwsService],
  exports: [JoinRequestsService]
})
export class JoinRequestsModule {}
