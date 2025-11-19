import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import {
  ParticipantRequestMemberSchema,
  ParticipantRequestTeamSchema,
} from 'libs/contracts/src/schema/participants-request';
import { ZodError } from 'zod';

@Injectable()
export class ParticipantsReqValidationPipe implements PipeTransform {
  /**
   * Transforms and validates the incoming request body based on the participant type.
   * @param value - The incoming request body
   * @param metadata - The metadata of the argument (checks if it is 'body')
   * @returns The validated value or throws an exception if validation fails
   */
  transform(value: any, metadata: ArgumentMetadata): any {
    if (metadata.type !== 'body') return value;

    const body = { ...value };
    const { participantType } = body;

    // SKIP validation for minimal TEAM request: only name provided
    if (
      participantType === 'TEAM' &&
      body?.newData &&
      typeof body.newData.name === 'string' &&
      Object.keys(body.newData).every((k) => ['name', 'website'].includes(k))
    ) {
      body.uniqueIdentifier = body.uniqueIdentifier ?? body.newData.name;
      return body;
    }

    try {
      if (participantType === 'MEMBER') {
        ParticipantRequestMemberSchema.parse(body);
      } else if (participantType === 'TEAM') {
        ParticipantRequestTeamSchema.parse(body);
      } else {
        throw new BadRequestException({
          statusCode: 400,
          message: `Invalid participant request type ${participantType}`,
        });
      }
      return body;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Participant request validation failed',
          errors: error.errors,
        });
      }
      throw error;
    }
  }
}
