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
import { RedisService } from '../utils/redis/redis.service';
@Injectable()
export class AuthService {
  constructor(private prismaService: PrismaService, private redisService: RedisService) {}

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
      if(e?.response?.data?.message, e?.response?.status) {
        throw new HttpException("Request failed. Please try again later", e?.response?.status)
      }
      throw new InternalServerErrorException();
    }
  }

  async getClientToken() {
    const response = await axios.post(`${process.env.AUTH_API_URL}/auth/token`, {
      "client_id": process.env.AUTH_APP_CLIENT_ID,
      "client_secret": process.env.AUTH_APP_CLIENT_SECRET,
      "grant_type": "client_credentials",
      "grantTypes": ["client_credentials", "authorization_code", "refresh_token"]
    })

    return response.data.access_token;
  }

  async getUserInfo(result) {
    try {
      const idToken = result.data.id_token;
      const decoded: any = jwt_decode(idToken);
      const userEmail = decoded.email;
       const idFromAuth = decoded.sub;

      // If email id is not available in id token, then user needs to enter and validate email id in ui
      // Get client token.. for client to access email validation
      if (!userEmail) {
         const clientToken = await this.getClientToken()
        return {
          accessToken: result.data.access_token,
          refreshToken: result.data.refresh_token,
          clientToken,
          idToken
        }
      }


     // Search by external id. If user found, send the user details with tokens
      let foundUser: any = await this.prismaService.member.findUnique({
        where: { externalId: idFromAuth },
        include: { image: true, memberRoles: true, teamMemberRoles: true },
      });

      if (foundUser) {
        return {
          userInfo: {
            name: foundUser.name,
            email: foundUser?.email,
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

      // If there is no user available for external id, then find by user by email
      // and then update the external id for that user and send userinfo, tokens
      foundUser = await this.prismaService.member.findUnique({
        where: { email: userEmail },
        include: { image: true, memberRoles: true , teamMemberRoles: true },
      });
      if (foundUser) {
         await this.prismaService.member.update({
           where: { email: userEmail },
          data: { externalId: idFromAuth },
         });
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
      if(e?.response?.data?.message && e?.response?.status) {
        throw new HttpException(e?.response?.status, e?.response?.data?.message)
      }
      throw new InternalServerErrorException();
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

  async findUserInSystemByEmail(userEmail) {
      const existingUser = await this.getUserInfoByEmail(userEmail);
      if(existingUser) {
        return existingUser
      }

      const requestedUser = await this.prismaService.participantsRequest.findFirst({
        where: {uniqueIdentifier: userEmail, status: "PENDING", referenceUid: null}
      })

      return requestedUser;
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

  async updateEmailAndLinkAccount(oldEmail, newEmail, accessToken, clientToken) {
    let newTokens;
    let updatedUser;
    await this.prismaService.$transaction(async (tx) => {
      // Update new email
      updatedUser = await this.prismaService.member.update({
        where: {email: oldEmail},
        data: {email: newEmail},
        include: { image: true, memberRoles: true, teamMemberRoles: true },
      })

      // Link new email to auth account
      newTokens = await this.linkEmailWithAccount(newEmail, accessToken, clientToken)
    })

    await this.redisService.resetAllCache()
    return {
      newTokens,
      userInfo: {
        name: updatedUser.name,
        email: updatedUser.email,
        profileImageUrl: updatedUser.image?.url,
        uid: updatedUser.uid,
        roles: updatedUser.memberRoles?.map((r) => r.name),
        leadingTeams: updatedUser.teamMemberRoles?.filter((role) => role.teamLead)
          .map(role => role.teamUid)
      }
    };
  }

  async linkEmailWithAccount(email, accessToken, clientToken) {
    try {
     const linkResult =  await axios.put(`${process.env.AUTH_API_URL}/admin/auth/account`, { token: accessToken, email: email }, {
        headers: {
          Authorization: `Bearer ${clientToken}`
        }
      })
    const newTokens = linkResult.data;
    return newTokens;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error?.response?.data?.message, error?.response?.status)
      }
      throw new InternalServerErrorException();
    }
  }

  async verifyEmailOtp(otp, otpToken, clientToken) {
    const payload = {
      code: otp,
      token: otpToken,
    }
    const header = {
      headers: {
        Authorization: `Bearer ${clientToken}`
      }
    }
    const verifyOtpResult = await axios.post(`${process.env.AUTH_API_URL}/mfa/otp/verify`, payload, header)
    return verifyOtpResult?.data
  }


  async handleAxiosError(statusCode, errorMessage) {
    if(statusCode === 401) {
      if(errorMessage === "Unauthorized") {
        throw new UnauthorizedException("Unauthorized Request. Please login again and try")
      } else {
        throw new UnauthorizedException("Invalid Request. Please login again and try")
      }
    } else if (statusCode === 400) {
      throw new BadRequestException("Invalid request. Please try again or contact support")
    }
  }

  async handleAuthErrors(statusCode, errorMessage, errorCode) {
    if(statusCode === 401) {
      if(errorMessage === "Unauthorized") {
        throw new UnauthorizedException("Unauthorized Request. Please login again and try")
      } else {
        throw new UnauthorizedException("Invalid Request. Please login again and try")
      }
    } else if (statusCode === 400) {
      if(errorCode === "EOTP005") {
        throw new BadRequestException("Invalid OTP. Please enter valid otp sent to your email")
      } else if (errorCode === "EOTP003"){
        throw new UnauthorizedException("Maximum OTP attempts reached. Please login again and try")
      } else if (errorMessage === "Validation failed") {
        throw new BadRequestException("Invalid request. Please try again or contact support")
      } else {
        throw new BadRequestException("Invalid request. Please try again or contact support")
      }
    }
  }

  handleErrors = (error) => {
    if(error?.response?.statusCode && error?.response?.message) {
      throw new HttpException(error?.response?.message, error?.response?.statusCode)
     } else if (error?.response?.data && error?.response?.status) {
        if(error?.response?.status === 401) {
          throw new UnauthorizedException("Unauthorized")
        }
         else if(error?.response?.status === 400 && error?.response?.data?.errorCode === 'EOTP005') {
          throw new UnauthorizedException("Unauthorized")
        } else if(error?.response?.status === 400 && error?.response?.data?.errorCode === 'EOTP003') {
          throw new ForbiddenException("MAX_OTP_ATTEMPTS_REACHED")
        }
        else {
          throw new InternalServerErrorException("Unexpected error. Please try again")
        }
     } else {
      throw new InternalServerErrorException("Unexpected error. Please try again")
     }
  }

  async sendEmailOtpForVerification(email, clientToken) {
    const payload = {
      recipientAddress: email,
      notificationType: 'EMAIL',
    }
    const header = {
      headers: {
        Authorization: `Bearer ${clientToken}`
      }
    }
    const sendOtpResult = await axios.post(`${process.env.AUTH_API_URL}/mfa/otp`, payload, header);
    return sendOtpResult.data;
  }
}
