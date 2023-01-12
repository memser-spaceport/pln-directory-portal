import dotenv from 'dotenv';
import { CommandFactory } from 'nest-commander';
import { CommandModule } from './command.module';
import { bootstrap } from './cli';

jest.mock('dotenv');
jest.mock('./command.module', () => jest.fn().mockImplementation(() => ({})));
jest.mock('nest-commander', () => ({
  CommandFactory: {
    run: jest.fn(),
  },
}));

describe('CLI', () => {
  describe('when bootstraping the CLI', () => {
    it('should load the dotenv config', () => {
      const dotEnvConfigSpy = jest.spyOn(dotenv, 'config');
      bootstrap();
      expect(dotEnvConfigSpy).toHaveBeenCalled();
    });

    it('should call the Command Factory with the Command Module', () => {
      const commandFactoryRunSpy = jest.spyOn(CommandFactory, 'run');
      bootstrap();
      expect(commandFactoryRunSpy).toHaveBeenCalledWith(CommandModule);
    });
  });
});
