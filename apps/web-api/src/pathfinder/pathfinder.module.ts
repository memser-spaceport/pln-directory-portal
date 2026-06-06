import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { RbacModule } from '../rbac/rbac.module';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { PathfinderService } from './pathfinder.service';
import { PathfinderQueryService } from './pathfinder-query.service';
import { PathfinderServiceController } from './pathfinder-service.controller';
import { PathfinderController } from './pathfinder.controller';

@Module({
  imports: [SharedModule, RbacModule, AccessControlV2Module],
  controllers: [PathfinderServiceController, PathfinderController],
  providers: [PathfinderService, PathfinderQueryService],
  exports: [PathfinderService],
})
export class PathfinderModule {}
