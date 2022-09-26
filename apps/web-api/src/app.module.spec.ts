import { CacheModule } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
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
  });
});
