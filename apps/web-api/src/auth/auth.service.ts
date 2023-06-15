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
import { LogService } from '../shared/log.service';
@Injectable()
export class AuthService {
  constructor(private prismaService: PrismaService,
     private redisService: RedisService,
     private readonly logger: LogService) { }

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
      const newToken = this.getUserInfo(result);
      return newToken;
    } catch (e) {
      this.logger.error('error', e);
      if (e?.response?.data?.message, e?.response?.status) {
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
      console.log('decoded values', decoded)
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
            isFirstTimeLogin: false,
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
        include: { image: true, memberRoles: true, teamMemberRoles: true },
      });
      if (foundUser) {
        await this.prismaService.member.update({
          where: { email: userEmail },
          data: { externalId: idFromAuth },
        });
        return {
          userInfo: {
            isFirstTimeLogin: true,
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
      this.logger.error('error', e);
      if (e?.response?.data?.message && e?.response?.status) {
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
      this.logger.error('error', error);
      if (error.response) {
        throw new HttpException(error?.response?.data?.message, error?.response?.status ?? 400)
      }
      throw new UnauthorizedException();
    }

    const tokenResponse =  this.getUserInfo(result);
    return tokenResponse;
  }

  async getUserInfoByEmail(userEmail) {
    const foundUser: any = await this.prismaService.member.findUnique({
      where: { email: userEmail },
      include: { image: true, memberRoles: true, teamMemberRoles: true },
    });
    if (foundUser) {
      return {
        isExternalIdAvailable: foundUser.externalId ? false : true,
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
      updatedUser = await tx.member.update({
        where: { email: oldEmail },
        data: { email: newEmail },
        include: { image: true, memberRoles: true, teamMemberRoles: true },
      })

      await tx.participantsRequest.create({
        data: {
          status: 'AUTOAPPROVED',
          requesterEmailId: oldEmail,
          referenceUid: updatedUser.uid,
          uniqueIdentifier: oldEmail,
          participantType: 'MEMBER',
          newData: { oldEmail: oldEmail, newEmail: newEmail }
        }
      })

      // Link new email to auth account
      // newTokens = await this.linkEmailWithAccount(newEmail, accessToken, clientToken)
      const linkResult = await axios.patch(`${process.env.AUTH_API_URL}/admin/accounts/email`, { email: newEmail, existingEmail: oldEmail, userId: updatedUser.externalId, deleteAndReplace: true }, {
        headers: {
          Authorization: `Bearer ${clientToken}`
        }
      })
      newTokens = linkResult.data;
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

  async linkEmailWithAccount(email, accessToken, clientToken, user) {
    const linkResult = await axios.put(`${process.env.AUTH_API_URL}/admin/accounts`, { token: accessToken, email: email }, {
      headers: {
        Authorization: `Bearer ${clientToken}`
      }
    })

    // If user already has externalId then send new token directly
    const newTokens = linkResult.data;
    if(user.isExternalIdAvailable) {
      return newTokens
    }

    // Else update external Id and send new tokens
    const idToken = newTokens.id_token;
    const decoded: any = jwt_decode(idToken);
    const userExternalId = decoded.sub;

    await this.prismaService.member.update({
      where: { email: email },
      data: { externalId: userExternalId }
    })
    return newTokens;
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




  handleErrors = (error) => {
    console.log(error?.response?.statusCode, error?.response?.status, error?.response?.message, error?.response?.data)
    if (error?.response?.statusCode && error?.response?.message) {
      throw new HttpException(error?.response?.message, error?.response?.statusCode)
    } else if (error?.response?.data && error?.response?.status) {
      if (error?.response?.status === 401) {
        throw new UnauthorizedException("Unauthorized")
      } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EOTP005') {
        throw new UnauthorizedException("Unauthorized")
      } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EOTP003') {
        throw new ForbiddenException("MAX_OTP_ATTEMPTS_REACHED")
      } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EATH010') {
        throw new ForbiddenException("ACCOUNT_ALREADY_LINKED")
      } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EATH002') {
        throw new ForbiddenException("ACCOUNT_ALREADY_LINKED")
      } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EOTP006') {
        throw new ForbiddenException("MAX_RESEND_ATTEMPTS_REACHED")
      } else if (error?.response?.status === 400 && error?.response?.data?.errorCode === 'EOTP004') {
        throw new BadRequestException("CODE_EXPIRED")
      }
      // EOTP002, EATH010
      else {
        console.log(error?.response?.data)
        throw new InternalServerErrorException("Unexpected error. Please try again")
      }
    } else {
      throw new InternalServerErrorException("Unexpected error. Please try again")
    }
  }

  async resendEmailOtpForVerification(otpToken, clientToken) {
    const payload = {
      token: otpToken
    }
    const header = {
      headers: {
        Authorization: `Bearer ${clientToken}`
      }
    }
    const sendOtpResult = await axios.post(`${process.env.AUTH_API_URL}/mfa/otp/resend`, payload, header);
    return sendOtpResult.data;
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
