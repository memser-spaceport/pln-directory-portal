/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
@Injectable()
export class JwtService {
  async getSignedToken() {
    return jwt.sign(
      {
        roles: ['DIRECTORYADMIN'],
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      },
      process.env.ADMIN_TOKEN_SECRET
    );
  }

  async validateToken(token) {
    return jwt.verify(token, process.env.ADMIN_TOKEN_SECRET);
  }
}
