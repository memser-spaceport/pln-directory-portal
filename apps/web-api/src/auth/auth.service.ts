/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import jwt_decode from 'jwt-decode';
import { PrismaService } from '../shared/prisma.service';
@Injectable()
export class AuthService {
  constructor(private prismaService: PrismaService) {}

  async findUniqueMemberAndGetInfo(query) {
    const foundUser: any = await this.prismaService.member.findUnique({
      where: { ...query },
      include: { image: true, memberRoles: true },
    });

    if (foundUser) {
      return {
        name: foundUser.name,
        email: foundUser?.email,
        profileImageUrl: foundUser?.image?.url,
        uid: foundUser.uid,
        roles: foundUser.memberRoles.map((r) => r.name),
      };
    }

    return null;
  }

  async getNewTokens(refreshToken) {
    try {
      const result = await axios.post(
        `${process.env.AUTH_API_URL}/auth/token`,
        {
          client_id: process.env.AUTH_APP_CLIENT_ID,
          client_secret: process.env.AUTH_APP_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }
      );
      return this.getUserInfo(result);
    } catch (e) {
      console.error(e);
      throw new UnauthorizedException();
    }
  }

  async getUserInfo(result) {
    try {
      const idToken = result.data.id_token;
      const decoded: any = jwt_decode(idToken);
      const userEmail = decoded.email;
      // const idFromAuth = decoded.sub;

      // If email id is not available in id token, then user needs to enter and validate email id in ui
      // Get client token.. for client to access email validation
      if (!userEmail) {
        const response = await axios.post(`${process.env.AUTH_API_URL}/auth/token`, {
          "client_id": process.env.AUTH_APP_CLIENT_ID,
          "client_secret": process.env.AUTH_APP_CLIENT_SECRET,
          "grant_type": "client_credentials",
          "grantTypes": ["client_credentials", "authorization_code", "refresh_token"]
        })
        const notificationToken = response.data;
        return {
          notificationToken: notificationToken.access_token,
          accessToken: result.data.access_token,
          refreshToken: result.data.refresh_token,
          idToken
        }
      }


      // Search by external id. If user found, send the user details with tokens
      // let foundUser: any = await this.prismaService.member.findUnique({
      //   where: { externalId: idFromAuth },
      //   include: { image: true, memberRoles: true, teamMemberRoles: true },
      // });

      // if (foundUser) {
      //   return {
      //     userInfo: {
      //       name: foundUser.name,
      //       email: foundUser?.email,
      //       profileImageUrl: foundUser?.image?.url,
      //       uid: foundUser.uid,
      //       roles: foundUser.memberRoles.map((r) => r.name),
      //       leadingTeams: foundUser.teamMemberRoles.filter((role) => role.teamLead)
      //       .map(role => role.teamUid)
      //     },
      //     accessToken: result.data.access_token,
      //     refreshToken: result.data.refresh_token,
      //   };
      // }

      // If there is no user available for external id, then find by user by email
      // and then update the external id for that user and send userinfo, tokens
      const foundUser = await this.prismaService.member.findUnique({
        where: { email: userEmail },
        include: { image: true, memberRoles: true , teamMemberRoles: true },
      });
      if (foundUser) {
        // await this.prismaService.member.update({
        //   where: { email: userEmail },
        //   data: { externalId: idFromAuth },
        // });
        return {
          userInfo: {
            name: foundUser.name,
            email: foundUser.email,
            profileImageUrl: foundUser?.image?.url,
            uid: foundUser.uid,
            roles: foundUser.memberRoles.map((r) => r.name),
            leadingTeams: foundUser.teamMemberRoles.filter((role) => role.teamLead)
              .map(role => role.teamUid)
          },
          accessToken: result.data.access_token,
          refreshToken: result.data.refresh_token,
        };
      }
    } catch (e) {
      console.error(e)
      throw new UnauthorizedException();
    }

    // If no user found for externalid and for email then throw forbidden error
    throw new ForbiddenException();
  }

  async getToken(code) {
    // Get user token
    let result: any;
    try {
      result = await axios.post(`${process.env.AUTH_API_URL}/auth/token`, {
        client_id: process.env.AUTH_APP_CLIENT_ID,
        client_secret: process.env.AUTH_APP_CLIENT_SECRET,
        redirect_uri: `${process.env.WEB_UI_BASE_URL}/directory/members/verify-member`,
        code: code,
        grant_type: 'authorization_code',
      });

    } catch (error) {
      if (error.response) {
        throw new HttpException(error?.response?.data?.message, error?.response?.status ?? 400)
      }
      throw new UnauthorizedException();
    }

    return this.getUserInfo(result);
  }

  async getUserInfoByEmail(userEmail) {
    const foundUser: any = await this.prismaService.member.findUnique({
      where: { email: userEmail },
      include: { image: true, memberRoles: true, teamMemberRoles: true },
    });
    if (foundUser) {
      return {
        name: foundUser.name,
        email: foundUser.email,
        profileImageUrl: foundUser.image?.url,
        uid: foundUser.uid,
        roles: foundUser.memberRoles?.map((r) => r.name),
        leadingTeams: foundUser.teamMemberRoles?.filter((role) => role.teamLead)
          .map(role => role.teamUid)
      }
    }

    return null
  }

  async linkEmailWithAccount(email, accessToken, notificationToken) {
    try {
     const linkResult =  await axios.put(`${process.env.AUTH_API_URL}/auth/account`, { token: accessToken, email: email }, {
        headers: {
          Authorization: `Bearer ${notificationToken}`
        }
      })
    const newTokens = linkResult.data;
    return newTokens;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error?.response?.data?.message, error?.response?.status)
      }
      throw new UnauthorizedException();
    }
  }

  async verifyEmailOtp(otp, otpToken, notificationToken) {
   try {
    const payload = {
      code: otp,
      token: otpToken,
    }
    const header = {
      headers: {
        Authorization: `Bearer ${notificationToken}`
      }
    }
    const verifyOtpResult = await axios.post(`${process.env.AUTH_API_URL}/mfa/otp/verify`, payload, header)
    return verifyOtpResult?.data?.valid ? true : false;
   } catch (error) {
    if (error.response) {
      throw new HttpException(error?.response?.data?.message, error?.response?.status)
    }
    throw new InternalServerErrorException("Unexpected error");
   }
  }

  async sendEmailOtpForVerification(email, notificationToken) {
    try {
      const payload = {
        recipientAddress: email,
        notificationType: 'EMAIL',
      }
      const header = {
        headers: {
          Authorization: `Bearer ${notificationToken}`
        }
      }
      const sendOtpResult = await axios.post(`${process.env.AUTH_API_URL}/mfa/otp`, payload, header);
      return sendOtpResult.data;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error?.response?.data?.message, error?.response?.status)
      }
      throw new InternalServerErrorException("Unexpected Error");
    }
  }
}
