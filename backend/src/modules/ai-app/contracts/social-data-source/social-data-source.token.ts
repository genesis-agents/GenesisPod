import { SetMetadata } from '@nestjs/common';

export const SOCIAL_DATA_SOURCE_TOKEN = Symbol.for('SOCIAL_DATA_SOURCE');

export const SOCIAL_DATA_SOURCE_METADATA = 'genesis:social-data-source';

export const SocialDataSourceProvider = (): ClassDecorator =>
  SetMetadata(SOCIAL_DATA_SOURCE_METADATA, true);

