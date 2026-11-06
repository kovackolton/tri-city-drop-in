import { BadRequestException } from '@nestjs/common';
import { integer, text } from './validation';
interface Guidance { bibsProvided: boolean | null; bibCount?: number | null; shirtColors?: string[]; shirtColorCount: number | null; minPlayers: number | null; }
export function eventGuidanceInput(b: Record<string, unknown>, capacity: number, previous?: Guidance): Guidance {
  if (b.bibsProvided !== undefined && typeof b.bibsProvided !== 'boolean') throw new BadRequestException('Bibs provided must be a checkbox value.');
  const bibsProvided = b.bibsProvided === undefined ? previous ? previous.bibsProvided : false : b.bibsProvided as boolean;
  const shirtColorCount = b.shirtColorCount === undefined ? previous ? previous.shirtColorCount ?? (bibsProvided === false ? 2 : null) : 2 : b.shirtColorCount === null ? null : integer(b.shirtColorCount, 'Shirt colors to bring', 1, 10);
  if (bibsProvided === false && shirtColorCount === null) throw new BadRequestException('Choose how many shirt colors each player should bring.');
  const requestedBibs = b.bibCount === undefined ? previous?.bibCount ?? null : b.bibCount === null ? null : integer(b.bibCount, 'Number of bibs', 1, 1000);
  const bibCount = bibsProvided === true ? requestedBibs : null;
  let shirtColors = previous?.shirtColors?.slice(0, shirtColorCount ?? 0) ?? (!previous && shirtColorCount === 2 ? ['dark', 'light'] : []);
  if (b.shirtColors !== undefined) {
    if (!Array.isArray(b.shirtColors) || b.shirtColors.length !== (shirtColorCount ?? 0)) throw new BadRequestException('List one shirt color for each color players should bring.');
    shirtColors = b.shirtColors.map(color => text(color, 'Shirt color', 40));
    if (new Set(shirtColors.map(color => color.toLowerCase())).size !== shirtColors.length) throw new BadRequestException('Choose different shirt colors.');
  }
  const minPlayers = b.minPlayers === undefined ? previous?.minPlayers ?? null : b.minPlayers === null ? null : integer(b.minPlayers, 'Minimum player target', 1, capacity);
  if (minPlayers !== null && minPlayers > capacity) throw new BadRequestException('The player target cannot exceed capacity. Lower the target before reducing capacity.');
  return { bibsProvided, bibCount, shirtColors, shirtColorCount, minPlayers };
}
