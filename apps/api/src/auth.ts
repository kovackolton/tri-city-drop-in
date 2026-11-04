import { CanActivate, ConflictException, ExecutionContext, ForbiddenException, Inject, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';
import { Prisma, User } from '@prisma/client';
import { googleAvatarUrl } from './profile-fields';
import { Database } from './database';
export interface AuthRequest { headers: { authorization?: string }; user: User; }
export function tokenFailure(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'unknown';
  const invalidSession = ['auth/argument-error', 'auth/invalid-argument', 'auth/invalid-id-token', 'auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found'];
  if (invalidSession.includes(code)) return new UnauthorizedException('Your session is invalid or expired. Please sign in again.');
  // Only log the error code; SDK messages can contain credential or request details.
  Logger.error(`Firebase verification unavailable (${code}). Check Application Default Credentials, Firebase Auth read permissions and Google API connectivity.`, 'TokenVerifier');
  return new ServiceUnavailableException('The server could not verify sign-in. Check the API authentication setup and server log.');
}
@Injectable()
export class TokenVerifier {
  async verify(token: string): Promise<DecodedIdToken> {
    if (!process.env.FIREBASE_PROJECT_ID) throw new ServiceUnavailableException('Firebase authentication is not configured.');
    if (process.env.NODE_ENV === 'production' && process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new ServiceUnavailableException('Auth emulator is forbidden in production.');
    try {
      const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
      return await getAuth(app).verifyIdToken(token, true);
    } catch (error) { throw tokenFailure(error); }
  }
}
@Injectable()
export class FirebaseGuard implements CanActivate {
  constructor(@Inject(TokenVerifier) private readonly tokens: TokenVerifier, @Inject(Database) private readonly db: Database) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('Sign in to continue.');
    const token = await this.tokens.verify(match[1]);
    if (token.firebase?.sign_in_provider === 'password' && !token.email_verified) throw new ForbiddenException('Verify your email before continuing.');
    const picture = token.firebase?.sign_in_provider === 'google.com' ? googleAvatarUrl(token.picture) : null;
    // Never link accounts solely by matching email addresses.
    let user = await this.db.user.findUnique({ where: { firebaseUid: token.uid } });
    if (!user) {
      if (!token.email || !token.email_verified) throw new ForbiddenException('A verified email is required to create your profile.');
      try {
        user = await this.db.user.upsert({ where: { firebaseUid: token.uid }, update: {}, create: {
          firebaseUid: token.uid, email: token.email.toLowerCase(), avatarUrl: picture,
          displayName: typeof token.name === 'string' && token.name.trim() ? token.name.trim().slice(0, 80) : 'Player',
          accountNameSetAt: typeof token.name === 'string' && token.name.trim() ? new Date() : null
        } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('This email belongs to another profile. Use the original sign-in provider.');
        throw error;
      }
    }
    // Keep only the provider-hosted URL; preserve the player's photo/initial preference.
    if (picture && user.avatarUrl !== picture) user = await this.db.user.update({ where: { id: user.id }, data: { avatarUrl: picture } });
    req.user = user;
    return true;
  }
}
@Injectable()
export class OrganizerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (!['ORGANIZER', 'ADMINISTRATOR'].includes(context.switchToHttp().getRequest<AuthRequest>().user?.role)) throw new ForbiddenException('Organizer access required.');
    return true;
  }
}
@Injectable()
export class AdministratorGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (context.switchToHttp().getRequest<AuthRequest>().user?.role !== 'ADMINISTRATOR') throw new ForbiddenException('Administrator access required.');
    return true;
  }
}
