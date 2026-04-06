import { forwardRef, Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { MembersModule } from '../members/members.module';
import { JwtService } from '../utils/jwt/jwt.service';
import { ArticleRequestsController } from './article-requests.controller';
import { AdminArticleRequestsController } from './admin-article-requests.controller';
import { ArticleRequestsService } from './article-requests.service';

@Module({
  imports: [
    SharedModule,
    AuthModule,
    forwardRef(() => MembersModule),
  ],
  controllers: [ArticleRequestsController, AdminArticleRequestsController],
  providers: [ArticleRequestsService, JwtService],
  exports: [ArticleRequestsService],
})
export class ArticleRequestsModule {}
