import { Injectable, NestMiddleware } from '@nestjs/common';
import { Counter, Histogram, register } from 'prom-client';

const httpHistogram = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status_code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const httpCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code'],
  registers: [register],
});

@Injectable()
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    if (req.originalUrl?.startsWith('/metrics')) return next();

    const method = req.method;
    const rawPath = req.originalUrl.split('?')[0];
    const path = normalizePath(rawPath);

    const end = httpHistogram.startTimer({ method });

    res.on('finish', () => {
      const status_code = String(res.statusCode);
      end({ path, status_code });
      httpCounter.inc({ method, path, status_code });
    });

    next();
  }
}

function normalizePath(url: string): string {
  return url.replace(/[a-f0-9]{8,}/gi, '#val');
}

