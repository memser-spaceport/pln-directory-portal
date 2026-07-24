import { Controller, Get, Redirect, Req, Res, UseInterceptors} from '@nestjs/common';
import { NoCache } from './decorators/no-cache.decorator';
import { SentryInterceptor } from './interceptors/sentry.interceptor';
import { generateOAuth2State } from '../src/utils/helper/helper';

@UseInterceptors(SentryInterceptor)
@Controller()
export class AppController {
  /*
   ** We have this so we don't have a 404 on the root path
   */
  @Get()
  getHello(): string {
    return 'Protocol labs API';
  }

  /*
   ** Its api which is used to redirect to rollup login.
   */
   @Get('/directory')
   @NoCache()
   @Redirect()
   redirectToLogin(@Req() req, @Res() res): any {
    try {
      const host = req.hostname;
      if (host && host.includes('login')) {
        const state = generateOAuth2State();
        const redirectURL = `${process.env.WEB_UI_BASE_URL}/${process.env.LOGIN_REDIRECT_URL}?source=direct`;
        const url = `${process.env.AUTH_API_URL}/auth?redirect_uri=${redirectURL}
          &state=${state}&scope=openid profile&client_id=${process.env.AUTH_APP_CLIENT_ID}`;
        return {
          url,
          statusCode: 302
        }
      }
      return {}
    } catch(error) {
      return {
        url: `${process.env.WEB_UI_BASE_URL}/internal-error`,
        statusCode: 302
      };
    }
  }

  /**
   * Retrieve a CSRF token
   */
  @Get('/token')
  @NoCache()
  getCsrfToken(@Req() req): any {
    return {
      token: req.csrfToken(),
    };
  }

  /** FEATURE_ENV_DEMO:feature-demo
   * Public endpoint used to demonstrate feature environments.
   * No authentication guard is applied.
   */
  @Get("/feature-demo")
  featureEnvDemo_feature_demo() {
    return {
      message: "Hello from feature environment",
      environment: process.env.ENVIRONMENT ?? 'unknown',
      feature: process.env.FEATURE_ENV ?? process.env.FEATURE_NAME ?? 'local',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Public endpoint used to verify environment variables
   * supplied during Feature Environment deployment.
   * No authentication guard is applied.
   */
  @Get('/feature-config')
  featureEnvironmentConfig() {
    return {
      featureEnvironment: process.env.FEATURE_ENV ?? 'not-configured',
      demoMessage: process.env.FEATURE_DEMO_MESSAGE ?? 'not-configured',
      timestamp: new Date().toISOString(),
    };
  }
}
