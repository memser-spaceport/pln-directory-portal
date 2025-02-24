import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { Api, initNestServer } from '@ts-rest/nest';
import { Response } from 'express';
import { apiHusky } from 'libs/contracts/src/lib/contract-hucky';
import { HuskyChatDto, HuskyFeedbackDto } from '../../../../libs/contracts/src/schema/husky-chat';
import { HuskyAiService } from './husky-ai.service';
import { HuskyService } from './husky.service';

const server = initNestServer(apiHusky);

// const server = initNestServer(apiHusky);

@Controller()
export class HuskyController {
  constructor(private huskyService: HuskyService, private huskyAiService: HuskyAiService) {}

  @Post('v1/husky/chat/assistant')
  async huskyChatAssistant(@Body() body: HuskyChatDto, @Res() res: Response) {
    const aiStreamingResponse = await this.huskyAiService.createStreamingChatResponse({ ...body });
    aiStreamingResponse.pipeTextStreamToResponse(res);
    return;
  }

  @Post('v1/husky/chat/feedback')
  async huskyChatFeedback(@Body() body: HuskyFeedbackDto) {
    await this.huskyService.addHuskyFeedback({ ...body });
  }

  @Api(server.route.uploadDocument)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(@UploadedFile() file) {
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new HttpException('Invalid file type. Only documents are allowed.', HttpStatus.BAD_REQUEST);
    }
    const docName = `${Date.now()}-${file.originalname}`;
    const uploadResult = await this.huskyService.uploadToS3(file.buffer, process.env.AWS_S3_BUCKET_NAME || '', docName);

    const job = await this.huskyService.queueDocumentProcessing({
      s3Url: uploadResult.Location,
      originalName: file.originalname,
      mimeType: file.mimetype
    });

    return {
      success: true,
      jobId: job.id,
      message: 'File upload has been queued for processing',
      s3Url: uploadResult.Location
    };
  }

}
