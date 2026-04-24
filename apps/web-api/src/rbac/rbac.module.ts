import { Module } from '@nestjs/common';
import { AdminRbacController } from './admin-rbac.controller';
import { RbacController } from './rbac.controller';
import { RbacGuard } from './rbac.guard';
import { RbacService } from './rbac.service';
import { PrismaService } from '../shared/prisma.service';
import { SharedModule } from '../shared/shared.module';
import { JwtService } from '../utils/jwt/jwt.service';
import { ArticlesRbacExampleController } from './articles-rbac-example';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';

@Module({
  imports: [SharedModule, AccessControlV2Module],
  controllers: [RbacController, AdminRbacController, ArticlesRbacExampleController],
  providers: [RbacService, RbacGuard, PrismaService, JwtService],
  exports: [RbacService, RbacGuard],
})
export class RbacModule {}
