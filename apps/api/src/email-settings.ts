import { integer, object } from './validation';
export const emailSettingRules = {
  dailyLimit: { env: 'EMAIL_DAILY_LIMIT', label: 'Daily email limit', initial: 100, min: 1, max: 100 },
  monthlyLimit: { env: 'EMAIL_MONTHLY_LIMIT', label: 'Monthly email limit', initial: 3000, min: 1, max: 3000 },
  digestStartHour: { env: 'EMAIL_DIGEST_START_HOUR_UTC', label: 'Digest start hour (UTC)', initial: 23, min: 0, max: 23 },
  digestDailyLimit: { env: 'EMAIL_DIGEST_DAILY_LIMIT', label: 'Daily digest limit', initial: 80, min: 0, max: 100 },
  urgentReserve: { env: 'EMAIL_URGENT_RESERVE', label: 'Urgent reserve', initial: 5, min: 0, max: 100 },
  batchSize: { env: 'EMAIL_BATCH_SIZE', label: 'Emails per worker run', initial: 50, min: 1, max: 500 },
  intervalMs: { env: 'EMAIL_SEND_INTERVAL_MS', label: 'Send interval (milliseconds)', initial: 1100, min: 1, max: 60000 }
} as const;
export type EmailTuning = { [K in keyof typeof emailSettingRules]: number };
export function readEmailTuning(env: NodeJS.ProcessEnv = process.env): EmailTuning {
  return Object.fromEntries(Object.entries(emailSettingRules).map(([key, rule]) => {
    const value = Number(env[rule.env] ?? rule.initial);
    if (!Number.isInteger(value) || value < rule.min || value > rule.max) throw new Error(`Invalid ${rule.env}.`);
    return [key, value];
  })) as EmailTuning;
}
export function validateEmailTuning(value: unknown): EmailTuning {
  const fields = object(value, Object.keys(emailSettingRules));
  return Object.fromEntries(Object.entries(emailSettingRules).map(([key, rule]) => [key, integer(fields[key], rule.label, rule.min, rule.max)])) as EmailTuning;
}
export function pickEmailTuning(value: EmailTuning): EmailTuning {
  return Object.fromEntries(Object.keys(emailSettingRules).map(key => [key, value[key as keyof EmailTuning]])) as EmailTuning;
}
