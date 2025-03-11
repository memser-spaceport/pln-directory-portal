import { Controller, Get, Post, Param, Req, UseGuards, Body, Delete } from "@nestjs/common";
import { HuskyService } from "./husky.service";
import { HuskyAiService } from "./husky-ai.service";
import { NoCache } from "../decorators/no-cache.decorator";
import { UserAccessTokenValidateGuard } from "../guards/user-access-token-validate.guard";
import { UserTokenCheckGuard } from "../guards/user-token-check.guard";
@Controller('v1/husky/threads')
export class HuskyThreadsController {

    constructor(private huskyAiService: HuskyAiService) { }
    @UseGuards(UserAccessTokenValidateGuard)
    @Post()
    async createNewThread(@Body() body: { threadId: string}, @Req() req) {
      return await this.huskyAiService.createThread(body.threadId, req?.userEmail, req?.userUid);
    }
  
    @NoCache()
    @Get()
    @UseGuards(UserAccessTokenValidateGuard)
    async getThreads(@Req() req) {
      return await this.huskyAiService.getThreadsByUserId(req?.userUid);
    }

    
    @UseGuards(UserAccessTokenValidateGuard)
    @Delete(':threadId')
    async deleteThread(@Param('threadId') threadId: string, @Req() req) {
      return await this.huskyAiService.deleteThreadById(threadId, req?.userUid);
    }
  
  
    @NoCache()
    @Get(':threadId/chats')
    async getChatsByThreadId(@Param('threadId') threadId: string) {
      return await this.huskyAiService.getChatsByThreadId(threadId);
    }

    @UseGuards(UserAccessTokenValidateGuard)
    @Post(':threadId/title')
    async updateThreadTitle(@Body() body: { question: string}, @Param('threadId') threadId: string, @Req() req) {
      return await this.huskyAiService.createThreadTitle(threadId, body.question, req?.userUid);
    }

    @UseGuards(UserTokenCheckGuard)
    @Post(':threadId/duplicate')
    async duplicateThread(@Param('threadId') threadId: string, @Req() req) {
      return await this.huskyAiService.duplicateThread(threadId, req?.userUid);
    }

}
