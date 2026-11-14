import { Controller, Delete, Get, Inject, Injectable, NotFoundException, ConflictException, Header, Param, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthRequest, FirebaseGuard, OrganizerGuard } from './auth';
import { Database } from './database';
import { text, uuid } from './validation';
import { appearance, appearanceSelect } from './profile-fields';
import { playerSelections, PlayerSelection } from './event-options';
const presetFields = ['title', 'description', 'locationId', 'capacity', 'priceCents', 'maxGuestsPerUser', 'cancellationCutoffHours', 'coOrganizerIds', 'isPrivate', 'minimumSkillLevel', 'maximumSkillLevel', 'bibsProvided', 'bibCount', 'shirtColors', 'shirtColorCount', 'minPlayers', 'teamCount', 'teamBalancingEnabled', 'organizerContactEmail', 'organizerContactPhone', 'organizerVenmoUrl', 'organizerCashAppUrl', 'organizerPaypalUrl', 'organizerZelleContact', 'contactCallAllowed', 'contactTextAllowed'];
export function presetNameInput(value: unknown) { return value === undefined ? undefined : text(text(value, 'Preset name', 80).normalize('NFKC'), 'Preset name', 80); }
export function presetSettings(data: object, players: PlayerSelection[]): Prisma.InputJsonObject {
  const source = data as Record<string, unknown>;
  return JSON.parse(JSON.stringify({ ...Object.fromEntries(presetFields.filter(key => source[key] !== undefined).map(key => [key, source[key]])), initialPlayers: players.map(player => ({ userId: player.userId, mode: player.mode })) }));
}
export async function saveEventPreset(tx: Prisma.TransactionClient, ownerId: string, name: string, data: object, players: PlayerSelection[]) {
  const nameKey = name.trim().toLocaleLowerCase('en-US');
  if (await tx.eventPreset.findUnique({ where: { ownerId_nameKey: { ownerId, nameKey } } })) throw new ConflictException('You already have a preset with this name. Choose another name.');
  const preset = await tx.eventPreset.create({ data: { ownerId, name, nameKey, settings: presetSettings(data, players) } });
  await tx.auditLog.create({ data: { actorId: ownerId, action: 'EVENT_PRESET_CREATED', details: { presetId: preset.id, name } } });
  return preset;
}
@Injectable()
export class EventPresetsService {
  constructor(@Inject(Database) private readonly db: Database) {}
  list(ownerId: string) { return this.db.eventPreset.findMany({ where: { ownerId }, select: { id: true, name: true, createdAt: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }); }
  async get(ownerId: string, id: string) {
    uuid(id);
    const preset = await this.db.eventPreset.findFirst({ where: { id, ownerId } });
    if (!preset) throw new NotFoundException('Preset not found.');
    const stored = preset.settings as Prisma.JsonObject;
    const players = playerSelections(stored.initialPlayers ?? []);
    const organizerIds = Array.isArray(stored.coOrganizerIds) ? stored.coOrganizerIds.filter((id): id is string => typeof id === 'string') : [];
    const [users, organizers, location] = await Promise.all([
      this.db.user.findMany({ where: { id: { in: players.map(p => p.userId) } }, select: { id: true, ...appearanceSelect, skillLevel: true, adminSkillLevel: true } }),
      this.db.user.findMany({ where: { id: { in: organizerIds }, role: { in: ['ORGANIZER', 'ADMINISTRATOR'] } }, select: { id: true, displayName: true, nickname: true } }),
      typeof stored.locationId === 'string' ? this.db.location.findUnique({ where: { id: stored.locationId }, select: { id: true } }) : null
    ]);
    const currentPlayers = players.filter(p => users.some(u => u.id === p.userId));
    const settings: Prisma.InputJsonObject = { ...presetSettings(stored, currentPlayers), coOrganizerIds: organizers.map(o => o.id), locationId: location?.id ?? '' };
    const warnings: string[] = [];
    if (!location) warnings.push('The saved location is no longer available. Choose a location.');
    if (currentPlayers.length !== players.length) warnings.push('Players who no longer exist were removed from this selection.');
    if (organizers.length !== organizerIds.length) warnings.push('Unavailable co-organizers were removed from this selection.');
    return { id: preset.id, name: preset.name, settings, warnings,
      players: currentPlayers.map(p => { const user = users.find(u => u.id === p.userId)!; return { id: user.id, ...appearance(user), accountName: user.displayName, skillLevel: user.skillLevel, adminSkillLevel: user.adminSkillLevel, mode: p.mode }; }),
      organizers: organizers.map(user => ({ id: user.id, displayName: user.nickname ?? user.displayName, accountName: user.displayName })) };
  }
  async remove(ownerId: string, id: string) {
    uuid(id);
    const result = await this.db.eventPreset.deleteMany({ where: { id, ownerId } });
    if (!result.count) throw new NotFoundException('Preset not found.');
    return { deleted: true };
  }
}
@Controller('api/organizer/event-presets') @UseGuards(FirebaseGuard, OrganizerGuard)
export class EventPresetsController {
  constructor(@Inject(EventPresetsService) private readonly service: EventPresetsService) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(@Req() req: AuthRequest) { return this.service.list(req.user.id); }
  @Get(':id') @Header('Cache-Control', 'private, no-store') get(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.get(req.user.id, id); }
  @Delete(':id') remove(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.remove(req.user.id, id); }
}
