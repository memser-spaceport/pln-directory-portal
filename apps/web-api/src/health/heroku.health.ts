import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
  HttpHealthIndicator,
} from '@nestjs/terminus';
import { AxiosResponse } from '@nestjs/terminus/dist/health-indicator/http/axios.interfaces';

@Injectable()
export class HerokuHealthIndicator extends HealthIndicator {
  constructor(private http: HttpHealthIndicator) {
    super();
  }

  async isHealthy(): Promise<HealthIndicatorResult> {
    try {
      return this.http.responseCheck(
        'heroku-status',
        'https://status.heroku.com/api/v4/current-status',
        (res: AxiosResponse<any>) => {
          res.data.status.forEach((item) => {
            if (item.status !== 'green') {
              throw new HealthCheckError('Heroku status check failed', {
                message: `Heroku system ${item.system} is not green`,
                status: item.status,
              });
            }
          });
          return res.status === 200;
        }
      );
    } catch (e) {
      throw new HealthCheckError('Heroku status check failed', e);
    }
  }
}
