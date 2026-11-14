import 'reflect-metadata';
import { Database } from './database';
import { NotificationsService } from './notifications';
import { emailConfig, NotificationEmailWorker, ResendEmailSender } from './email-delivery';
import { emailDiagnostic } from './email-diagnostics';
async function main() {
  let stage = 'configuration';
  let db: Database | undefined;
  try {
    const config = emailConfig();
    if (!config) { console.log('Notification email worker disabled. Set EMAIL_ENABLED=true to enable it.'); return; }
    stage = 'database-connect';
    db = new Database();
    await db.$connect();
    const worker = new NotificationEmailWorker(db, new NotificationsService(db), config, config.mode === 'resend' ? new ResendEmailSender(config) : undefined);
    stage = 'notification-generation';
    const generation = await worker.generate();
    stage = config.mode === 'preview' ? 'preview-rendering' : 'email-delivery';
    const delivery = await worker.deliver();
    console.log(JSON.stringify({ mode: config.mode, generation, delivery }));
    if (generation.refreshFailures || delivery.failed || delivery.unknown) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify(emailDiagnostic(stage, error))); process.exitCode = 1;
  } finally {
    if (db) try { await db.$disconnect(); } catch (error) { console.error(JSON.stringify(emailDiagnostic('database-disconnect', error))); process.exitCode = 1; }
  }
}
void main();
