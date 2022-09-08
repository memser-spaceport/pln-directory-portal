import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Protocol Labs API')
    .setDescription('The Protocol Labs API documentation')
    .setVersion('1.0')
    .addTag('PL')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.enableCors();

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
