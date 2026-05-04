import { SetMetadata } from '@nestjs/common';

export const ACCESS_LEVELS_KEY = 'access-levels';
export const AccessLevels = (...accessLevels: string[]) => SetMetadata(ACCESS_LEVELS_KEY, accessLevels);
