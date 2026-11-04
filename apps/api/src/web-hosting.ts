import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
export function publicWebConfig(value?: string) {
  if (!value) return { firebase: {} as Record<string, string> };
  try {
    const parsed = JSON.parse(value), source = parsed.firebase ?? parsed;
    const firebase: Record<string, string> = {};
    for (const key of ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId', 'storageBucket', 'measurementId']) {
      if (source[key] !== undefined) { if (typeof source[key] !== 'string' || source[key].length > 2048) throw new Error(); firebase[key] = source[key]; }
    }
    if (['apiKey', 'authDomain', 'projectId', 'appId'].some(key => !firebase[key])) throw new Error();
    return { firebase };
  } catch { throw new Error('PUBLIC_FIREBASE_CONFIG must contain the public Firebase web configuration fields.'); }
}
export function configureWebHosting(app: NestExpressApplication) {
  if (!process.env.WEB_DIST_PATH) return;
  const directory = resolve(process.env.WEB_DIST_PATH);
  if (!existsSync(resolve(directory, 'index.html'))) throw new Error('WEB_DIST_PATH must contain the built Angular index.html.');
  const config = publicWebConfig(process.env.PUBLIC_FIREBASE_CONFIG);
  // Register before static middleware so a baked-in config file cannot override runtime configuration.
  app.getHttpAdapter().get('/config.json', (_req: unknown, res: { setHeader(name: string, value: string): void; json(value: unknown): unknown }) => {
    res.setHeader('Cache-Control', 'no-store'); return res.json(config);
  });
  app.useStaticAssets(directory, { index: 'index.html' });
}
