import { Module } from '@nestjs/common';
import { CommunityAffiliationsController } from './community-affiliations.controller';
import { CommunityAffiliationsService } from './community-affiliations.service';

@Module({
  controllers: [CommunityAffiliationsController],
  providers: [CommunityAffiliationsService],
})
export class CommunityAffiliationsModule {}
