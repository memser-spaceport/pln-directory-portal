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

/**
 * Controller class for managing Asks operations.
 * @module AsksController
 */
@ApiTags('Asks')
@Controller()
export class AsksController {
  constructor(private readonly askService: AskService) {}

  /**
   * Find one ask by uid
   *
   * @param {string} uid The unique identifier of the ask
   *
   * @return {Promise<ResponseAskWithRelationsDto>} A promise that resolves with the ask details along with relations
   */
  @Api(server.route.getAsk)
  @ApiParam({ name: 'uid', type: 'string' })
  findOne(@Param('uid') uid: string): Promise<ResponseAskWithRelationsDto> {
    return this.askService.findOne(uid, {
      team: true,
      project: true,
      closedBy: true,
    });
  }

  /**
   * Creates a new ask for a specific team.
   *
   * @param {string} teamUid - The unique identifier of the team.
   * @param {CreateAskDto} createAskDto - The data for creating the ask.
   * @param {any} req - The request object.
   *
   * @return {Promise<ResponseAskDto>} A promise that resolves to the newly created ask response.
   */velop
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

  /**
   * Update an existing ask record.
   *
   * @param {string} uid - The unique identifier of the ask record to update.
   * @param {UpdateAskDto} updateAskDto - The data for updating the ask record.
   * @param {Request} req - The request object containing user information.
   *
   * @returns {Promise<ResponseAskDto>} - A Promise that resolves to the updated ask record in a response DTO format.
   */
  @Api(server.route.updateAsk)
  @ApiBodyFromZod(UpdateAskSchema)
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  async update(@Param('uid') uid: string, @Body() updateAskDto: UpdateAskDto, @Req() req): Promise<ResponseAskDto> {
    return this.askService.update(uid, req.userEmail, updateAskDto);
  }

  /**
   * Close the specified ask using provided information.
   *
   * @param {string} uid - The unique identifier of the ask to be closed.
   * @param {CloseAskDto} closeAskDto - The data containing the closing reason, comment, and the user who closed the ask.
   * @param {Request} req - The http request object.
   *
   * @returns {Promise<ResponseAskDto>} - Returns a promise that resolves to the updated response of the closed ask.
   */
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

  /**
   * Delete a record based on the provided unique identifier.
   *
   * @param {string} uid The unique identifier of the record to be deleted.
   * @param {Object} req The request object.
   *
   * @return {Promise<boolean>} A Promise that resolves to true if the record is successfully deleted.
   */
  @Api(server.route.deleteAsk)
  @ApiParam({ name: 'uid', type: 'string' })
  @UseGuards(UserTokenValidation)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('uid') uid: string, @Req() req): Promise<boolean> {
    await this.askService.delete(uid, req.userEmail);
    return true;
  }
}
