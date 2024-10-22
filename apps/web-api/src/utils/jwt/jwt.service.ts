import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtService {
  
  /**
   * <p> Returns a signed jwt token for given roles valid for an hour </p>
   * @returns the signed jwt token as string
   */
  async getSignedToken(roles: string[]) {
    return jwt.sign(
      {
        roles,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      },
      process.env.ADMIN_TOKEN_SECRET
    );
  }

  /**
   * <p>Validates a given jwt token based on the secret used to sign</p>
   * @param token the jwt token as string to validate
   * @returns 
   * @throws if token expired or invalid
   */
  async validateToken(token) {
    return jwt.verify(token, process.env.ADMIN_TOKEN_SECRET);
  }
}
