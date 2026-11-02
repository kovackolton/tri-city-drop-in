import { Body, Controller, Get, Inject, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthRequest, FirebaseGuard } from './auth';
import { Database } from './database';
import { object, text } from './validation';
@Controller('api/me') @UseGuards(FirebaseGuard)
export class ProfilesController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get() me(@Req() req: AuthRequest) { return this.profile(req.user); }
  @Patch() async update(@Req() req: AuthRequest, @Body() value: unknown) {
    const b = object(value, ['displayName']);
    return this.profile(await this.db.user.update({ where: { id: req.user.id }, data: { displayName: text(b.displayName, 'Display name', 80) } }));
  }
  private profile(user: AuthRequest['user']) { return { id: user.id, displayName: user.displayName, email: user.email, role: user.role }; }
}
