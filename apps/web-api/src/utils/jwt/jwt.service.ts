/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken'
@Injectable()
export class JwtService {
    async getSignedToken() {
        return jwt.sign({ roles: ['DIRECTORYADMIN'] }, process.env.ADMIN_TOKEN_SECRET, { expiresIn: '1d', })
    }

    async validateToken(token) {
        return jwt.verify(token, process.env.ADMIN_TOKEN_SECRET)
    }
}
