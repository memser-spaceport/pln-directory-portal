import { Controller, UseGuards, Body, Param, Req, HttpStatus, HttpCode, UsePipes } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { AskStatus } from '@prisma/client';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { apiAsks } from 'libs/contracts/src/lib/contract-asks';
import { AskService } from './asks.service';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import {
  CreateAskDto,
  UpdateAskDto,
  ResponseAskDto,
  ResponseAskWithRelationsDto,
  CloseAskDto,
  CreateAskSchema,
  UpdateAskSchema,
  CloseAskSchema,
} from 'libs/contracts/src/schema/ask';
import { ApiBodyFromZod } from '../decorators/api-body-from-zod';

const server = initNestServer(apiAsks);

@ApiTags('Asks')
@Controller()
export class AsksController {
  constructor(private readonly askService: AskService) {}

  @Api(server.route.getAsk)
  @ApiParam({ name: 'uid', type: 'string' })
  findOne(@Param('uid') uid: string): Promise<ResponseAskWithRelationsDto> {
    return this.askService.findOne(uid);
  }

  @Api(server.route.createTeamAsk)
  @ApiBodyFromZod(CreateAskSchema)
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
  @ApiBodyFromZod(UpdateAskSchema)
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  async update(@Param('uid') uid: string, @Body() updateAskDto: UpdateAskDto, @Req() req): Promise<ResponseAskDto> {
    return this.askService.update(uid, req.userEmail, updateAskDto);
  }

  @Api(server.route.closeAsk)
  @ApiBodyFromZod(CloseAskSchema)
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
  @ApiParam({ name: 'uid', type: 'string' })
  @UseGuards(UserTokenValidation)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('uid') uid: string, @Req() req): Promise<boolean> {
    await this.askService.delete(uid, req.userEmail);
    return true;
  }
}
