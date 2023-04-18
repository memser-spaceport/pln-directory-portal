import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import * as bodyParser from 'body-parser';
/* If the request's content-type header is not application/json, then return a 415 status code.
Otherwise, continue to the next middleware */
@Injectable()
export class ContentTypeMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (req.headers['content-type'] !== 'application/json') {
      res.status(415).send({
        status: 415,
        message: 'Unsupported Content Type',
      });
    } else {
      bodyParser.json()(req, res, next);
    }
  }
}
