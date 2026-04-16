import { Module, forwardRef } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { DealsController } from './deals.controller';
import { AdminDealsController } from './admin-deals.controller';
import { DealsService } from './deals.service';
import { AuthModule } from '../auth/auth.module';
import { MembersModule } from '../members/members.module';
import { RbacModule } from '../rbac/rbac.module';
import { JwtService } from '../utils/jwt/jwt.service';

@Module({
  imports: [SharedModule, AuthModule, RbacModule, forwardRef(() => MembersModule)],
  controllers: [DealsController, AdminDealsController],
  providers: [DealsService, JwtService],
  exports: [DealsService],
})
export class DealsModule {}
