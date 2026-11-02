import { Body, ConflictException, Controller, Get, Inject, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthRequest, FirebaseGuard } from './auth';
import { Database } from './database';
import { googleAvatarUrl, profileInput } from './profile-fields';
@Controller('api/me') @UseGuards(FirebaseGuard)
export class ProfilesController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get() me(@Req() req: AuthRequest) { return this.profile(req.user); }
  @Patch() async update(@Req() req: AuthRequest, @Body() value: unknown) {
    const { accountName, ...data } = profileInput(value);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${req.user.id}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
      if (accountName !== undefined && user.accountNameSetAt) throw new ConflictException('Your account name cannot be edited. Use your nickname instead.');
      if (!user.accountNameSetAt && !accountName) throw new ConflictException('Set your account name to complete your profile. It cannot be changed afterward.');
      return this.profile(await tx.user.update({ where: { id: user.id }, data: {
        ...data, ...(accountName === undefined ? {} : { displayName: accountName, accountNameSetAt: new Date() }),
        profileCompletedAt: user.profileCompletedAt ?? new Date()
      } }));
    });
  }
  private profile(user: AuthRequest['user']) {
    return { id: user.id, displayName: user.nickname ?? user.displayName, accountName: user.displayName,
      accountNameSetAt: user.accountNameSetAt, profileCompletedAt: user.profileCompletedAt, nickname: user.nickname, skillLevel: user.skillLevel,
      email: user.email, role: user.role, contactEmail: user.contactEmail, phone: user.phone,
      avatarUrl: googleAvatarUrl(user.avatarUrl), avatarColor: user.avatarColor, useGooglePhoto: user.useGooglePhoto };
  }
}
