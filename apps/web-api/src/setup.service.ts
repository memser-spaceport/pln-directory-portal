import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { createLogger } from 'winston';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import WinstonCloudwatch, * as WinstonCloudWatch from 'winston-cloudwatch';

export class SetupService {
  setupLog(): winston.Logger {
    const fileRotateTransport = new winston.transports.DailyRotateFile({
      filename: process.env.LOG_FILE_FOLDER_PATH + '/log-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf((info) => {
          return `${info.timestamp} : ${info.level} - ${JSON.stringify(info)}`;
        }),
      ),
    });

    const instance = createLogger({
      transports: [
        // fileRotateTransport,
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.ms(),
            winston.format.printf((info) => {
              return `${info.timestamp} : ${info.level} - ${info.message}`;
            }),
            //nestWinstonModuleUtilities.format.nestLike()
          ),
        }),
      ],
    });
    if (process.env.ENVIRONMENT !== 'DEV') {
      this.addProductionTransport(instance);
    }
    return instance;
  }

  private addProductionTransport(instance: winston.Logger) {
    const cloudwatchConfig = {
      logGroupName: process.env.CLOUDWATCH_GROUP_NAME,
      logStreamName: `${process.env.CLOUDWATCH_GROUP_NAME}-${process.env.NODE_ENV}`,
      awsRegion: process.env.CLOUDWATCH_REGION,
      awsOptions: {
        credentials: {
          accessKeyId: process.env.CLOUDWATCH_ACCESS_KEY as string,
          secretAccessKey: process.env.CLOUDWATCH_SECRET_KEY as string,
        },
        region: process.env.CLOUDWATCH_REGION,
      },
      messageFormatter: (item: any) => `[${item.level}] : ${JSON.stringify(item)}`,
    };
    instance.add(new WinstonCloudwatch(cloudwatchConfig));
  }
}
