import { BadRequestException } from '@nestjs/common';
import { object, text } from './validation';
export const subTermsVersion = 'late-cancellation-sub-v1';
export function lateCancellationApplies(event: { status: string; startsAt: Date; cancellationCutoffHours: number }, status: string, now = new Date()) {
  return event.status === 'PUBLISHED' && status === 'CONFIRMED' && event.startsAt > now && now.getTime() >= event.startsAt.getTime() - event.cancellationCutoffHours * 3600000;
}
export function cancellationInput(value: unknown) {
  const b = object(value, ['lateCancellationAcknowledged']);
  if (b.lateCancellationAcknowledged !== undefined && typeof b.lateCancellationAcknowledged !== 'boolean') throw new BadRequestException('Acknowledge late-cancellation responsibility using the checkbox.');
  return b.lateCancellationAcknowledged === true;
}
export function substituteInput(value: unknown) {
  const b = object(value, ['subName', 'subWillPay']);
  const subName = b.subName === null || typeof b.subName === 'string' && !b.subName.trim() ? null : text(b.subName, 'Sub name', 80);
  if (typeof b.subWillPay !== 'boolean') throw new BadRequestException('Choose whether the sub said they would pay.');
  if (b.subWillPay && !subName) throw new BadRequestException('Enter a sub name before recording their payment promise.');
  return { subName, subWillPay: b.subWillPay };
}
