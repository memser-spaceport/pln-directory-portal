import {forwardRef, Module} from '@nestjs/common';
import { AdminRbacController } from './admin-rbac.controller';
import { RbacController } from './rbac.controller';
import { RbacGuard } from './rbac.guard';
import { RbacService } from './rbac.service';
import {PrismaService} from "../shared/prisma.service";
import {SharedModule} from "../shared/shared.module";
import {AuthModule} from "../auth/auth.module";
import {MembersModule} from "../members/members.module";
import {JwtService} from "../utils/jwt/jwt.service";
import {ArticlesRbacExampleController} from "./articles-rbac-example";

@Module({
  imports: [
    SharedModule,
    AuthModule,
    forwardRef(() => MembersModule),
  ],
  controllers: [RbacController, AdminRbacController, ArticlesRbacExampleController],
  providers: [RbacService, RbacGuard, PrismaService, JwtService],
  exports: [RbacService, RbacGuard],
})
export class RbacModule {}
