export function emailDiagnostic(stage: string, error: unknown) {
  const value = error as { code?: unknown; errorCode?: unknown; message?: unknown } | null;
  const hints: Record<string, string> = {
    EACCES: 'Permission denied. For preview output set EMAIL_PREVIEW_DIR=/tmp/tricity-email-previews; also check runtime access permissions.',
    EPERM: 'Operation not permitted. Check runtime permissions and the preview output directory.',
    ENOSPC: 'Preview output storage is full. Check container memory and preview batch size.',
    ENOENT: 'A required file or directory is missing. Check the container image and configured preview directory.',
    P1000: 'Database authentication failed. Verify the DATABASE_URL secret version and database credentials.',
    P1001: 'Database is unreachable. Check the Cloud SQL attachment, Cloud SQL Client role and network settings.',
    P1002: 'Database connection timed out. Check SQL availability and networking.',
    P1010: 'Database access denied. Check runtime database grants.',
    P1012: 'Database configuration is invalid. Check the DATABASE_URL secret mapping and format.',
    P2021: 'A database table is missing. Confirm the notification email migration succeeded before this job image was deployed.',
    P2022: 'A database column is missing. Confirm the notification email migration succeeded before this job image was deployed.'
  };
  const rawCode = typeof value?.code === 'string' ? value.code : value?.errorCode;
  const code = typeof rawCode === 'string' && Object.hasOwn(hints, rawCode) ? rawCode : undefined;
  const configMessages = [
    'EMAIL_DELIVERY_MODE must be preview or resend.',
    'Set EMAIL_NOTIFICATIONS_START_AT to an explicit UTC rollout timestamp ending in Z.',
    'PUBLIC_SITE_ORIGIN must be an HTTPS origin for Resend.',
    'EMAIL_FROM must be no_reply@contact.tricitiesdropin.com.',
    'RESEND_API_KEY is required for Resend delivery.'
  ];
  const message = typeof value?.message === 'string' ? value.message : '';
  const safeConfigMessage = stage === 'configuration' && (configMessages.includes(message) || /^Invalid EMAIL_(BATCH_SIZE|SEND_INTERVAL_MS|DAILY_LIMIT|MONTHLY_LIMIT|REPLY_TO|DIGEST_START_HOUR_UTC|DIGEST_DAILY_LIMIT|URGENT_RESERVE)\.$/.test(message));
  return { message: 'Notification email worker failed.', stage, ...(code ? { code } : {}),
    hint: code ? hints[code] : safeConfigMessage ? message : stage === 'configuration' ? 'Check job environment variables, the UTC rollout timestamp and PUBLIC_SITE_ORIGIN.' : 'Check job configuration, database connectivity and runtime permissions. Raw error details are omitted to protect credentials and recipient data.' };
}
