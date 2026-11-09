import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { integer } from './validation';
type Bounds = { minimumSkillLevel?: number | null; maximumSkillLevel?: number | null };
type Rating = { skillLevel: number | null; adminSkillLevel: number | null };
export function skillEligibilityInput(input: Record<string, unknown>, previous?: Bounds) {
  const bound = (key: 'minimumSkillLevel' | 'maximumSkillLevel') => input[key] === undefined ? previous?.[key] ?? null : input[key] === null ? null : integer(input[key], 'Skill level', 1, 5);
  const minimumSkillLevel = bound('minimumSkillLevel'), maximumSkillLevel = bound('maximumSkillLevel');
  if (minimumSkillLevel !== null && maximumSkillLevel !== null) throw new BadRequestException('Choose skill level and above, or skill level and below.');
  return { minimumSkillLevel, maximumSkillLevel };
}
export function restrictedEvent(event: Bounds) { return event.minimumSkillLevel != null || event.maximumSkillLevel != null; }
export function eligibleForEvent(event: Bounds, user?: Rating | null) {
  if (!restrictedEvent(event)) return true;
  const rating = user?.adminSkillLevel ?? user?.skillLevel;
  return rating != null && (event.minimumSkillLevel == null || rating >= event.minimumSkillLevel) && (event.maximumSkillLevel == null || rating <= event.maximumSkillLevel);
}
export function assertEventEligibility(event: Bounds, user?: Rating | null) { if (!eligibleForEvent(event, user)) throw new NotFoundException('Event unavailable.'); }
export function visibleEvents(user?: Rating | null): Prisma.EventWhereInput {
  const rating = user?.adminSkillLevel ?? user?.skillLevel;
  return rating == null ? { minimumSkillLevel: null, maximumSkillLevel: null } : { OR: [{ minimumSkillLevel: null, maximumSkillLevel: null }, { minimumSkillLevel: { lte: rating } }, { maximumSkillLevel: { gte: rating } }] };
}
export function eligibleUsers(event: Bounds): Prisma.UserWhereInput {
  if (!restrictedEvent(event)) return {};
  const range = { ...(event.minimumSkillLevel != null ? { gte: event.minimumSkillLevel } : {}), ...(event.maximumSkillLevel != null ? { lte: event.maximumSkillLevel } : {}) };
  return { OR: [{ adminSkillLevel: range }, { adminSkillLevel: null, skillLevel: range }] };
}
