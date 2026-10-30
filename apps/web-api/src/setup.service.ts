import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { createLogger } from 'winston';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import WinstonCloudWatch from 'winston-cloudwatch';
import * as ip from 'ip';
export class SetupService {
  setupLog(): winston.Logger {
    const instance = createLogger({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.ms(),
            winston.format.printf((info) => {
              try {
                return `${JSON.stringify(info)}`;
              } catch (error) {
                return String(info);
              }
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
    const missing = ['CLOUDWATCH_GROUP_NAME', 'DEPLOYMENT_ENVIRONMENT', 'CLOUDWATCH_REGION'].filter(
      (name) => !process.env[name]
    );
    if (missing.length) {
      console.warn(`CloudWatch logging disabled: missing ${missing.join(', ')}`);
      return;
    }
    const logGroupName = `${process.env.CLOUDWATCH_GROUP_NAME}-${process.env.DEPLOYMENT_ENVIRONMENT}`;
    const cloudwatchConfig = {
      logGroupName,
      logStreamName: `${ip.address()}`,
      awsRegion: process.env.CLOUDWATCH_REGION,
      awsOptions: {
        region: process.env.CLOUDWATCH_REGION,
      },
      messageFormatter: (item: any) => `[${item.level}] : ${JSON.stringify(item)}`,
      // Written with console, not winston, so a failing transport cannot log into itself.
      errorHandler: (error: Error) =>
        console.error(`CloudWatch log delivery failed: group=${logGroupName} ${error?.name}: ${error?.message}`),
    };
    instance.add(new WinstonCloudWatch(cloudwatchConfig));
  }
}
