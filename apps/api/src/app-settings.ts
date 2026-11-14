import { notificationCatalog, notificationTiers, NotificationRules, defaultNotificationRules } from './notification-catalog';
import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, Patch, Req, UseGuards } from '@nestjs/common';
import { AdministratorGuard, AuthRequest, FirebaseGuard } from './auth';
import { Database } from './database';
import { integer, object } from './validation';
import { EmailTuning, pickEmailTuning, readEmailTuning, validateEmailTuning } from './email-settings';
export function appSettingsInput(value: unknown) {
  const body = object(value, ['revision', 'values']);
  return { revision: integer(body.revision, 'Settings revision', 0, 2147483646), values: validateEmailTuning(body.values) };
}
export function notificationRulesInput(value: unknown) {
  const body = object(value, ['revision', 'rules']);
  const fields = object(body.rules, notificationCatalog.map(n => n.kind));
  const rules: NotificationRules = {};
  for (const row of notificationCatalog) {
    const tier = fields[row.kind];
    if (typeof tier !== 'string' || !(notificationTiers as readonly string[]).includes(tier) || tier === 'TIME_SENSITIVE' && row.kind !== 'EVENT_CHANGED') throw new BadRequestException('Choose a valid email tier for every notification type.');
    rules[row.kind] = tier as NotificationRules[string];
  }
  return { revision: integer(body.revision, 'Rules revision', 0, 2147483646), rules };
}
@Injectable()
export class AppSettingsService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async read() {
    const saved = await this.db.appSetting.findUnique({ where: { key: 'email' } });
    return { values: saved ? validateEmailTuning(saved.value) : readEmailTuning({}), revision: saved?.revision ?? 0,
      configured: !!saved, updatedAt: saved?.updatedAt ?? null };
  }
  async save(actorId: string, input: unknown) {
    const { revision, values } = appSettingsInput(input);
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(7411082027)::text`;
      const before = await tx.appSetting.findUnique({ where: { key: 'email' } });
      if ((before?.revision ?? 0) !== revision) throw new ConflictException('Another administrator updated these settings. Reload and review their changes before saving.');
      await tx.appSetting.upsert({ where: { key: 'email' }, create: { key: 'email', value: values, revision: revision + 1 }, update: { value: values, revision: revision + 1 } });
      await tx.auditLog.create({ data: { actorId, action: 'APP_EMAIL_SETTINGS_UPDATED', details: { before: before?.value ?? null, after: values, revision: revision + 1 } } });
    });
    return this.read();
  }
  async notificationRules() {
    const saved = await this.db.appSetting.findUnique({ where: { key: 'notification-rules' } });
    // Merge future notification types with their defaults; never expose arbitrary stored keys.
    const rules = { ...defaultNotificationRules(), ...(saved?.value as NotificationRules ?? {}) };
    const validated = notificationRulesInput({ revision: saved?.revision ?? 0, rules }).rules;
    return { rules: validated, revision: saved?.revision ?? 0, catalog: notificationCatalog, updatedAt: saved?.updatedAt ?? null };
  }
  async saveNotificationRules(actorId: string, input: unknown) {
    const { rules, revision } = notificationRulesInput(input);
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(7411082027)::text`;
      const before = await tx.appSetting.findUnique({ where: { key: 'notification-rules' } });
      if ((before?.revision ?? 0) !== revision) throw new ConflictException('Another administrator updated notification rules. Reload and review before saving.');
      await tx.appSetting.upsert({ where: { key: 'notification-rules' }, create: { key: 'notification-rules', value: rules, revision: revision + 1 }, update: { value: rules, revision: revision + 1 } });
      await tx.auditLog.create({ data: { actorId, action: 'APP_NOTIFICATION_RULES_UPDATED', details: { before: before?.value ?? defaultNotificationRules(), after: rules, revision: revision + 1 } } });
    });
    return this.notificationRules();
  }
  async effective<T extends EmailTuning>(fallback: T): Promise<T & { notificationRules: NotificationRules }> {
    // Import the deployed job's existing tuning once, rather than silently replacing it with app defaults.
    const saved = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(7411082027)::text`;
      return tx.appSetting.upsert({ where: { key: 'email' }, create: { key: 'email', value: pickEmailTuning(fallback) }, update: {} });
    });
    return { ...fallback, ...validateEmailTuning(saved.value), notificationRules: (await this.notificationRules()).rules };
  }
}
@Controller('api/admin/app-settings') @UseGuards(FirebaseGuard, AdministratorGuard)
export class AppSettingsController {
  constructor(@Inject(AppSettingsService) private readonly service: AppSettingsService) {}
  @Get('notifications') notificationRules() { return this.service.notificationRules(); }
  @Patch('notifications') saveNotificationRules(@Req() req: AuthRequest, @Body() input: unknown) { return this.service.saveNotificationRules(req.user.id, input); }
  @Get() read() { return this.service.read(); }
  @Patch() save(@Req() req: AuthRequest, @Body() input: unknown) { return this.service.save(req.user.id, input); }
}
