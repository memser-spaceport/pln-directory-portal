import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ArticlesController } from './articles.controller';
import { AdminArticlesController } from './admin-articles.controller';
import { ArticlesService } from './articles.service';
import { JwtService } from '../utils/jwt/jwt.service';
import { RbacModule } from '../rbac/rbac.module';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { ArticleCommentsController } from './article-comments.controller';
import { ArticleCommentsService } from './article-comments.service';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [SharedModule, RbacModule, AccessControlV2Module, PushNotificationsModule],
  controllers: [ArticlesController, AdminArticlesController, ArticleCommentsController],
  providers: [ArticlesService, ArticleCommentsService, JwtService],
  exports: [ArticlesService, ArticleCommentsService],
})
export class ArticlesModule {}
