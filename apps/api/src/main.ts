import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API http://localhost:${port}/api adresinde çalışıyor`, 'Bootstrap');
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    Logger.log(`Swagger dokümantasyonu: http://localhost:${port}/api/docs`, 'Bootstrap');
  }
}

void bootstrap();
