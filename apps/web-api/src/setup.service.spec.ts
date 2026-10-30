import * as winston from 'winston';
import WinstonCloudWatch from 'winston-cloudwatch';
import { SetupService } from './setup.service';

jest.mock('winston-cloudwatch', () => {
  const Transport = jest.requireActual('winston-transport');
  return jest.fn().mockImplementation((options) => {
    const transport = new Transport();
    (transport as any).options = options;
    (transport as any).log = (_info, callback) => callback();
    return transport;
  });
});

const CLOUDWATCH_ENV = ['NODE_ENV', 'CLOUDWATCH_GROUP_NAME', 'DEPLOYMENT_ENVIRONMENT', 'CLOUDWATCH_REGION'];

describe('SetupService.setupLog', () => {
  const savedEnv = { ...process.env };
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    (WinstonCloudWatch as unknown as jest.Mock).mockClear();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    delete process.env.NODE_ENV;
    process.env.CLOUDWATCH_GROUP_NAME = 'pl-directory-service';
    process.env.DEPLOYMENT_ENVIRONMENT = 'prod';
    process.env.CLOUDWATCH_REGION = 'us-west-1';
  });

  afterEach(() => {
    CLOUDWATCH_ENV.forEach((name) => {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    });
    warn.mockRestore();
    error.mockRestore();
  });

  const cloudwatchOptions = () => (WinstonCloudWatch as unknown as jest.Mock).mock.calls[0]?.[0];

  it('adds the CloudWatch transport with the resolved group when all settings are set', () => {
    const logger = new SetupService().setupLog();

    expect(logger.transports).toHaveLength(2);
    expect(cloudwatchOptions()).toMatchObject({ logGroupName: 'pl-directory-service-prod', awsRegion: 'us-west-1' });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['CLOUDWATCH_GROUP_NAME', 'DEPLOYMENT_ENVIRONMENT', 'CLOUDWATCH_REGION'])(
    'keeps console only and warns when %s is missing',
    (name) => {
      delete process.env[name];

      const logger = new SetupService().setupLog();

      expect(WinstonCloudWatch).not.toHaveBeenCalled();
      expect(logger.transports).toHaveLength(1);
      expect(logger.transports[0]).toBeInstanceOf(winston.transports.Console);
      expect(warn).toHaveBeenCalledWith(`CloudWatch logging disabled: missing ${name}`);
    }
  );

  it('does not depend on NODE_ENV', () => {
    process.env.NODE_ENV = 'dev';

    new SetupService().setupLog();

    expect(cloudwatchOptions()).toMatchObject({ logGroupName: 'pl-directory-service-prod' });
  });

  it('stays console-only without a warning when no CloudWatch setting is present', () => {
    delete process.env.CLOUDWATCH_GROUP_NAME;
    delete process.env.DEPLOYMENT_ENVIRONMENT;
    delete process.env.CLOUDWATCH_REGION;

    const logger = new SetupService().setupLog();

    expect(WinstonCloudWatch).not.toHaveBeenCalled();
    expect(logger.transports).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports delivery errors on the console with the group name', () => {
    new SetupService().setupLog();
    const accessDenied = Object.assign(new Error('not authorized to perform logs:PutLogEvents'), {
      name: 'AccessDeniedException',
    });

    cloudwatchOptions().errorHandler(accessDenied);

    expect(error).toHaveBeenCalledWith(
      'CloudWatch log delivery failed: group=pl-directory-service-prod AccessDeniedException: not authorized to perform logs:PutLogEvents'
    );
  });
});
