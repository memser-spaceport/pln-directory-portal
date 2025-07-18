import { Request } from 'express';

export function extractTokenFromRequest(request: Request): string | undefined {
  const [type, token] = request.headers.authorization?.split(' ') ?? [];

  if (type === 'Bearer') {
    return token;
  }

  const cookieToken = request.cookies.authToken?.replace(/"/g, '');

  if (cookieToken) {
    return cookieToken;
  }
}
