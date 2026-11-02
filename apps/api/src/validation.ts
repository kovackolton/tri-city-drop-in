import { BadRequestException } from '@nestjs/common';
export function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Expected an object.');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new BadRequestException('Unexpected field.');
  return body;
}
export function text(value: unknown, name: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${name} must be 1–${max} characters.`);
  return value.trim();
}
export function integer(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new BadRequestException(`${name} must be an integer between ${min} and ${max}.`);
  return value;
}
export function instant(value: unknown, name: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new BadRequestException(`${name} requires a timestamp with timezone.`);
  const datePart = value.slice(0, 10);
  const calendarDay = new Date(`${datePart}T00:00:00Z`);
  if (!Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== datePart) throw new BadRequestException(`${name} contains an invalid calendar date.`);
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new BadRequestException(`${name} is invalid.`);
  return result;
}
export function uuid(value: string): string {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)) throw new BadRequestException('Invalid ID.');
  return value;
}
