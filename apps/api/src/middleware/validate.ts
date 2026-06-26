import { z } from 'zod';

export const walletAddressSchema = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address')
  .transform((value) => value.toLowerCase());

export const onChainIdSchema = z.coerce
  .number()
  .int('Invalid onChainId')
  .positive('Invalid onChainId');

export const contentSchema = z
  .string()
  .transform((value) => value.replace(/\u0000/g, '').trim())
  .refine((value) => value.length > 0, 'Content is required')
  .refine((value) => value.length <= 1000, 'Content must be 1000 characters or less');

export const amountSchema = z.coerce
  .number()
  .refine((value) => Number.isFinite(value), 'Invalid amount')
  .refine((value) => value > 0, 'Amount must be greater than zero');

export const emailSchema = z
  .string()
  .trim()
  .email('Invalid email address')
  .transform((value) => value.toLowerCase());

export const statusSchema = z.enum([
  'Active',
  'Confirmed',
  'Disputed',
  'Resolved',
  'Cancelled',
  'Expired',
  'Pending',
  'Closed',
]);

export function validateAddress(value: unknown): string {
  return walletAddressSchema.parse(value);
}

export function validateOnChainId(value: unknown): number {
  return onChainIdSchema.parse(value);
}

export function validateContent(value: unknown): string {
  return contentSchema.parse(value);
}

export function validateAmount(value: unknown): number {
  return amountSchema.parse(value);
}

export function validateEmail(value: unknown): string {
  return emailSchema.parse(value);
}

export function validateStatus(value: unknown): z.infer<typeof statusSchema> {
  return statusSchema.parse(value);
}
