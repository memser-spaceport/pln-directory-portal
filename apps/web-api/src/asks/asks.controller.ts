import { Controller, UseGuards, Body, Param, Req, HttpStatus, HttpCode, UsePipes } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { apiAsks } from 'libs/contracts/src/lib/contract-asks';
import { AskService } from './asks.service';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import {
  CreateAskDto,
  UpdateAskDto,
  ResponseAskDto,
  ResponseAskWithRelationsDto,
  CloseAskDto,
} from 'libs/contracts/src/schema/ask';
import { AskStatus } from '@prisma/client';

const server = initNestServer(apiAsks);

@Controller()
export class AsksController {
  constructor(private readonly askService: AskService) {}

  @Api(server.route.getAsk)
  findOne(@Param('uid') uid: string): Promise<ResponseAskWithRelationsDto> {
    return this.askService.findOne(uid);
  }

  @Api(server.route.createTeamAsk)
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  async createForTeam(
    @Param('teamUid') teamUid: string,
    @Body() createAskDto: CreateAskDto,
    @Req() req
  ): Promise<ResponseAskDto> {
    return this.askService.createForTeam(teamUid, req.userEmail, createAskDto);
  }

  @Api(server.route.updateAsk)
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  async update(@Param('uid') uid: string, @Body() updateAskDto: UpdateAskDto, @Req() req): Promise<ResponseAskDto> {
    return this.askService.update(uid, req.userEmail, updateAskDto);
  }

  @Api(server.route.closeAsk)
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  async close(@Param('uid') uid: string, @Body() closeAskDto: CloseAskDto, @Req() req): Promise<ResponseAskDto> {
    return this.askService.update(uid, req.userEmail, {
      status: AskStatus.CLOSED,
      closedReason: closeAskDto.closedReason,
      closedComment: closeAskDto.closedComment,
      closedByUid: closeAskDto.closedByUid,
    });
  }

  @Api(server.route.deleteAsk)
  @UseGuards(UserTokenValidation)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('uid') uid: string, @Req() req): Promise<boolean> {
    await this.askService.delete(uid, req.userEmail);
    return true;
  }
}
