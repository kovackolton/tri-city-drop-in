import { BadRequestException } from '@nestjs/common';
import { integer } from './validation';
interface Guidance { bibsProvided: boolean | null; shirtColorCount: number | null; minPlayers: number | null; }
export function eventGuidanceInput(b: Record<string, unknown>, capacity: number, previous?: Guidance): Guidance {
  if (b.bibsProvided !== undefined && typeof b.bibsProvided !== 'boolean') throw new BadRequestException('Bibs provided must be a checkbox value.');
  const bibsProvided = b.bibsProvided === undefined ? previous ? previous.bibsProvided : false : b.bibsProvided as boolean;
  let shirtColorCount = b.shirtColorCount === undefined ? previous?.shirtColorCount ?? (bibsProvided === false ? 2 : null) : b.shirtColorCount === null ? null : integer(b.shirtColorCount, 'Shirt colors to bring', 1, 10);
  if (bibsProvided === true) shirtColorCount = null;
  else if (bibsProvided === false && shirtColorCount === null) throw new BadRequestException('Choose how many shirt colors each player should bring.');
  const minPlayers = b.minPlayers === undefined ? previous?.minPlayers ?? null : b.minPlayers === null ? null : integer(b.minPlayers, 'Minimum player target', 1, capacity);
  if (minPlayers !== null && minPlayers > capacity) throw new BadRequestException('The player target cannot exceed capacity. Lower the target before reducing capacity.');
  return { bibsProvided, shirtColorCount, minPlayers };
}
