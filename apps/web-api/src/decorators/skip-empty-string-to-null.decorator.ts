import { SetMetadata } from '@nestjs/common';

export const SKIP_EMPTY_STRING_TO_NULL = 'SKIP_EMPTY_STRING_TO_NULL';
export const SkipEmptyStringToNull = () => SetMetadata(SKIP_EMPTY_STRING_TO_NULL, true); 