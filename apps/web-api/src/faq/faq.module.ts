import { Module } from '@nestjs/common';
import { FaqService } from './faq.service';
import { FaqController } from './faq.controller';
import { AwsService } from '../utils/aws/aws.service';

@Module({
  controllers: [FaqController],
  providers: [FaqService, AwsService],
  exports: [FaqService]
})
export class FaqModule {}
