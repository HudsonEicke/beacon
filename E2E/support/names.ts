import { randomBytes } from 'node:crypto';

// tests share one database and can run again against it, so every name they create is unique
export const uniqueName = (prefix: string): string => `${prefix}_${randomBytes(4).toString('hex')}`;
