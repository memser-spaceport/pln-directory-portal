import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { createLogger } from 'winston';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import WinstonCloudWatch from 'winston-cloudwatch';

export class SetupService {
  setupLog(): winston.Logger {
    const instance = createLogger({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.ms(),
            winston.format.printf((info) => {
              return `${info.timestamp} : ${info.level} - ${info.message}`;
            })
            //nestWinstonModuleUtilities.format.nestLike()
          ),
        }),
      ],
    });
    if (process.env.NODE_ENV === 'production') {
      this.addProductionTransport(instance);
    }
    return instance;
  }

  private addProductionTransport(instance: winston.Logger) {
    const cloudwatchConfig = {
      logGroupName: process.env.CLOUDWATCH_GROUP_NAME,
      logStreamName: `${process.env.CLOUDWATCH_GROUP_NAME}-${process.env.DEPLOYMENT_ENVIRONMENT}`,
      awsRegion: process.env.CLOUDWATCH_REGION,
      awsOptions: {
        credentials: {
          accessKeyId: process.env.CLOUDWATCH_ACCESS_KEY as string,
          secretAccessKey: process.env.CLOUDWATCH_SECRET_KEY as string,
        },
        region: process.env.CLOUDWATCH_REGION,
      },
      messageFormatter: (item: any) =>
        `[${item.level}] : ${JSON.stringify(item)}`,
    };
    instance.add(new WinstonCloudWatch(cloudwatchConfig));
  }
}
