import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ArticlesController } from './articles.controller';
import { AdminArticlesController } from './admin-articles.controller';
import { ArticlesService } from './articles.service';
import { JwtService } from '../utils/jwt/jwt.service';
import { RbacModule } from '../rbac/rbac.module';
import { ArticleCommentsController } from './article-comments.controller';
import { ArticleCommentsService } from './article-comments.service';

@Module({
  imports: [SharedModule, RbacModule],
  controllers: [ArticlesController, AdminArticlesController, ArticleCommentsController],
  providers: [ArticlesService, ArticleCommentsService, JwtService],
  exports: [ArticlesService, ArticleCommentsService],
})
export class ArticlesModule {}
