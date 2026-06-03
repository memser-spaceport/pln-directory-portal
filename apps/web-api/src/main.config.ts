import { INestApplication, VersioningType } from '@nestjs/common';
import { json, urlencoded } from 'body-parser';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { CsrfFilter, nestCsrf } from 'ncsrf';
import { NotFoundExceptionFilter } from './filters/not-found-exception.filter';
import { CSRFGuard } from './guards/csfr.guard';
import { ALLOWED_CORS_ORIGINS, APP_ENV } from './utils/constants';

export function mainConfig(app: INestApplication) {
  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
  });
  app.useGlobalFilters(new NotFoundExceptionFilter());
  // Enable CSRF Protection
  // More info: https://github.com/huy97/csrf
  app.use(cookieParser());
  app.use(
    nestCsrf({
      key: '_csrf',
      ttl: 300,
    })
  );
  // Apply global response messages when encountering CSRF errors:
  // app.useGlobalFilters(new CsrfFilter());
  // Apply automatic CSRF protection:
  // app.useGlobalGuards(new CSRFGuard());
  // Enable CORS for the web-app
  app.enableCors({
    origin: ALLOWED_CORS_ORIGINS[process.env.ENVIRONMENT || APP_ENV.DEV],
    credentials: true,
  });
  /* Default JSON parser. Raised from the body-parser default 100kb so the investor-outreach
   * ingest endpoint can accept batches with the script's per-row `evidence` objects (a single
   * batch of 25 enriched investors is ~150kb; 5mb leaves comfortable headroom for future growth). */
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));
  /* Some clients post raw JSON with text/plain content type. */
  app.use(json({ limit: '5mb', type: 'text/plain' }));
  /* Apply helmet to the entire app
  // Default configuration documented here: https://github.com/helmetjs/helmet
  */
  app.use(
    helmet({
      frameguard: {
        action: 'deny',
      },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
        },
      },
      hidePoweredBy: true,
    })
  );
}
