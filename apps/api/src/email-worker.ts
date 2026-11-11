import 'reflect-metadata';
import { Database } from './database';
import { NotificationsService } from './notifications';
import { emailConfig, NotificationEmailWorker, ResendEmailSender } from './email-delivery';
async function main() {
  const config = emailConfig();
  if (!config) { console.log('Notification email worker disabled. Set EMAIL_ENABLED=true to enable it.'); return; }
  const db = new Database();
  try {
    await db.$connect();
    const worker = new NotificationEmailWorker(db, new NotificationsService(db), config, config.mode === 'resend' ? new ResendEmailSender(config) : undefined);
    const result = await worker.run(); console.log(JSON.stringify({ mode: config.mode, ...result }));
    if (result.generation.refreshFailures || result.delivery.failed || result.delivery.unknown) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Notification email worker failed. Check configuration, database connectivity and provider access; no credentials or message bodies are logged.'); process.exitCode = 1; });
