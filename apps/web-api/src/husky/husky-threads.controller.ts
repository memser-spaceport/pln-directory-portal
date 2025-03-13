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
      return await this.huskyAiService.createThread(body.threadId, req?.userEmail);
    }
  
    @NoCache()
    @Get()
    @UseGuards(UserAccessTokenValidateGuard)
    async getThreads(@Req() req) {
      return await this.huskyAiService.getThreadsByEmail(req?.userEmail);
    }
  
    @NoCache()
    @Get(':threadId')
    async getThreadById(@Param('threadId') threadId: string) {
      return await this.huskyAiService.getThreadById(threadId);
    }

    @UseGuards(UserTokenCheckGuard)
    @Post(':threadId')
    async duplicateThread(@Param('threadId') threadId: string, @Req() req) {
      return await this.huskyAiService.duplicateThread(threadId, req?.userEmail);
    }

    @UseGuards(UserAccessTokenValidateGuard)
    @Delete(':threadId')
    async deleteThread(@Param('threadId') threadId: string, @Req() req) {
      return await this.huskyAiService.deleteThreadEmail(threadId, req?.userEmail);
    }
  

    @UseGuards(UserAccessTokenValidateGuard)
    @Post(':threadId/title')
    async updateThreadTitle(@Body() body: { question: string}, @Param('threadId') threadId: string, @Req() req) {
      return await this.huskyAiService.createThreadTitle(threadId, body.question, req?.userUid);
    }

}
