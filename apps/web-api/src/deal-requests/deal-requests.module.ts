import {forwardRef, Module} from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { DealRequestsController } from './deal-requests.controller';
import { AdminDealRequestsController } from './admin-deal-requests.controller';
import { DealRequestsService } from './deal-requests.service';
import {MembersModule} from "../members/members.module";
import {JwtService} from "../utils/jwt/jwt.service";

@Module({
  imports: [
    SharedModule,
    AuthModule,
    forwardRef(() => MembersModule),
  ],
  controllers: [DealRequestsController, AdminDealRequestsController],
  providers: [DealRequestsService, JwtService],
  exports: [DealRequestsService],
})
export class DealRequestsModule {}
