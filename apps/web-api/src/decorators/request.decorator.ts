import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Custom decorator for adding principal to request object.
 *
 * @type {(...dataOrPipes: Type<PipeTransform> | PipeTransform | any[]) => ParameterDecorator}
 */
export const RequestIp = createParamDecorator((data: string, context: ExecutionContext) => {
  const req = context.switchToHttp().getRequest();
  return req.headers['x-forwarded-for'] || req.connection.remoteAddress;
});
