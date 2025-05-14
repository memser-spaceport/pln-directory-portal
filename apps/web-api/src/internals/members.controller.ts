import { Controller, UseGuards, Body, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Api, initNestServer } from '@ts-rest/nest';
import { apiInternals } from 'libs/contracts/src/lib/contract-internals';
import { InternalUpdateMemberDto, ResponseMemberSchema } from 'libs/contracts/src/schema';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { InternalAuthGuard } from '../guards/auth.guard';
import { MembersService } from '../members/members.service';

const server = initNestServer(apiInternals);

@ApiTags('Internals')
@Controller()
@UseGuards(InternalAuthGuard)
@ApiBearerAuth()
export class MembersController {
  constructor(
    private readonly membersService: MembersService
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
}
