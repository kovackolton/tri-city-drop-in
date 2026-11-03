import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { StrikesService, MyStrikesController, AdminStrikesController } from './strikes';
import { WaiverService, WaiverController } from './waiver';
import { Database } from './database';
import { AdministratorGuard, FirebaseGuard, OrganizerGuard, TokenVerifier } from './auth';
import { OrganizerRequestsService, OrganizerRequestsController, AdminUsersController } from './organizer-requests';
import { NotificationsController, NotificationsService } from './notifications';
import { EventManagementController, EventManagementService } from './event-management';
import { TeamsService, TeamsController } from './teams';
import { EventInvitationsService, EventInvitationsController } from './event-invitations';
import { EventsController } from './events';
import { ProfilesController } from './profiles';
import { SignupsController, SignupsService } from './signups';
import { PaymentsController, PaymentsService } from './payments';
import { OrganizerController, OrganizerService } from './organizer';
import { LocationsController, LocationsService } from './locations';
import { AdministrationController, AdministrationService } from './administration';

@Module({ controllers: [WaiverController, MyStrikesController, AdminStrikesController, TeamsController, EventInvitationsController, OrganizerRequestsController, AdminUsersController, NotificationsController, EventManagementController, EventsController, ProfilesController, SignupsController, PaymentsController, OrganizerController, LocationsController, AdministrationController], providers: [WaiverService, StrikesService, TeamsService, EventInvitationsService, OrganizerRequestsService, NotificationsService, EventManagementService, Database, AdministratorGuard, FirebaseGuard, OrganizerGuard, TokenVerifier, SignupsService, PaymentsService, OrganizerService, LocationsService, AdministrationService] })
export class AppModule {}

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Auth emulator is forbidden in production.');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '32kb' });
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:4200' });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}
void bootstrap();
