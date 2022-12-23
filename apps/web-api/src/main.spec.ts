import { SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { bootstrap } from './main';
import { mainConfig } from './main.config';

// Manual mocks due to procedural style that causes cascading dependencies:
jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn().mockImplementation(() => ({
      listen: jest.fn(),
      use: jest.fn(),
    })),
  },
}));
jest.mock('@nestjs/swagger', () => {
  const original = jest.requireActual('@nestjs/swagger');
  return {
    ...original,
    DocumentBuilder: function () {
      return {
        setTitle: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        setVersion: jest.fn().mockReturnThis(),
        addTag: jest.fn().mockReturnThis(),
        build: jest.fn(),
      };
    },
    SwaggerModule: {
      setup: jest.fn(),
      createDocument: jest.fn(),
    },
  };
});
jest.mock('@sentry/node');
jest.mock('./app.module', () => jest.fn().mockImplementation(() => ({})));
jest.mock('./main.config');
jest.mock('@forestadmin/agent', () => ({
  createAgent: jest.fn().mockImplementation(() => ({
    addDataSource: jest.fn().mockImplementation(() => ({
      customizeCollection: jest.fn().mockReturnThis(),
      mountOnNestJs: jest.fn().mockImplementation(() => ({
        start: jest.fn(),
      })),
      use: jest.fn(),
    })),
  })),
}));

describe('Main', () => {
  describe('when bootstraping the app', () => {
    it('should load the main config', () => {
      bootstrap();
      expect(mainConfig).toHaveBeenCalled();
    });

    it('should setup Swagger', () => {
      bootstrap();
      const setupSpy = jest.spyOn(SwaggerModule, 'setup');
      expect(setupSpy).toHaveBeenCalled();
    });

    it('should initialize Sentry', () => {
      bootstrap();
      const initSpy = jest.spyOn(Sentry, 'init');
      expect(initSpy).toHaveBeenCalled();
    });
  });
});
