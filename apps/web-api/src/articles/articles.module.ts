import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ArticlesController } from './articles.controller';
import { AdminArticlesController } from './admin-articles.controller';
import { ArticlesService } from './articles.service';
import { JwtService } from '../utils/jwt/jwt.service';

@Module({
  imports: [SharedModule],
  controllers: [ArticlesController, AdminArticlesController],
  providers: [ArticlesService, JwtService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
