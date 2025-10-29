import { Controller, UseGuards, Body, BadRequestException, NotFoundException, Param } from '@nestjs/common';
import { Api, initNestServer, ApiDecorator } from '@ts-rest/nest';
import { apiInternals } from 'libs/contracts/src/lib/contract-internals';
import { InternalUpdateMemberDto, ResponseMemberSchema, ResponseMemberWithRelationsSchema } from 'libs/contracts/src/schema';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { InternalAuthGuard } from '../guards/auth.guard';
import { MembersService } from '../members/members.service';
import { InternalsService } from './internals.service';

const server = initNestServer(apiInternals);
type RouteShape = typeof server.routeShapes;

@Controller("")
@UseGuards(InternalAuthGuard)
export class MembersController {
  constructor(
    private readonly membersService: MembersService,
    private readonly internalsService: InternalsService
  ) {}

  @Api(server.route.updateTelagramUid)
  @ApiOkResponseFromZod(ResponseMemberSchema)
  async updateTelegramUid(
    @Body() updateRequestDto: InternalUpdateMemberDto
  ) {
    if(updateRequestDto.telegramHandler) {
        const member = await this.membersService.findUnique({telegramHandler: {equals: updateRequestDto.telegramHandler, mode: 'insensitive'}});
        if(member) {
            return await this.membersService.updateMemberByUid(member.uid, {telegramUid: updateRequestDto.telegramUid});
        }
        throw new NotFoundException(`Member with telegram handle ${updateRequestDto.telegramHandler} not found`);
        
    } else {
        throw new BadRequestException('Telegram handle cannot be empty');
    }    
  }

  @Api(server.route.getMemberDetails)
  @ApiOkResponseFromZod(ResponseMemberWithRelationsSchema)
  async getMemberDetails(@Param('uid') uid: string) {
    return await this.internalsService.getMemberDetails(uid);
  }
}
