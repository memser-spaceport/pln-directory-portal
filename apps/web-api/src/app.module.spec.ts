import { BullModule } from '@nestjs/bull';
import { CacheModule } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { prisma } from '../prisma/__mocks__';
import { AppController } from './app.controller';
import { AppModule } from './app.module';

describe('App Module', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AppController],
    }).compile();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('when loading the app module', () => {
    it('should register the throttler module', () => {
      let throttlerModule: ThrottlerModule | undefined = undefined;
      // This was the only way to test if the modules was registered
      try {
        throttlerModule = module.get(ThrottlerModule);
      } catch {}
      expect(throttlerModule).toBeInstanceOf(ThrottlerModule);
    });

    it('should register the CacheModule module', () => {
      let cacheModule: CacheModule | undefined = undefined;
      // This was the only way to test if the modules was registered
      try {
        cacheModule = module.get(CacheModule);
      } catch {}
      expect(cacheModule).toBeInstanceOf(CacheModule);
    });
    it('should register the BullModule module', () => {
      let bullModule: BullModule | undefined = undefined;
      try {
        bullModule = module.get(BullModule);
      } catch {}
      expect(bullModule).toBeInstanceOf(BullModule);
    });
  });
});
