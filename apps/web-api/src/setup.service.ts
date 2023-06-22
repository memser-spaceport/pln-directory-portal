import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { createLogger } from 'winston';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import WinstonCloudWatch from 'winston-cloudwatch';

export class SetupService {
  setupLog(): winston.Logger {
    const instance = createLogger({
      transports: [
        new winston.transports.Console(),
        new WinstonCloudWatch({
          logGroupName: process.env.CLOUDWATCH_GROUP_NAME,
          logStreamName: `${process.env.CLOUDWATCH_GROUP_NAME}-${process.env.NODE_ENV}`,
          awsRegion: process.env.CLOUDWATCH_REGION,
          jsonMessage: true,
          awsAccessKeyId: process.env.CLOUDWATCH_ACCESS_KEY as string,
          awsSecretKey: process.env.CLOUDWATCH_SECRET_KEY as string,
          awsOptions: {
            apiVersion: 'latest',
          },
          messageFormatter: (info) =>
            `[${info.timestamp}] ${info.level}: ${info.message}\n${
              info.stack || ''
            }`,
          silent: process.env.NODE_ENV === 'production', // Set to true in production to disable console logging
        }),
      ],
    });
    return instance;
  }
}
