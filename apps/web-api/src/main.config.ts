import cookieParser from 'cookie-parser';
import { nestCsrf, CsrfFilter } from 'ncsrf';
import { INestApplication, VersioningType } from '@nestjs/common';
import { CSRFGuard } from './guards/csfr.guard';

export function mainConfig(app: INestApplication) {
  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
  });

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
  app.useGlobalFilters(new CsrfFilter());
  // Apply automatic CSRF protection:
  app.useGlobalGuards(new CSRFGuard());
}
