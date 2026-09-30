import 'server-only';
import { createLogger, parseLogLevel } from '@sealcode/shared/logger';

export const logger = createLogger({
  component: 'web',
  level: parseLogLevel(process.env.LOG_LEVEL),
});
