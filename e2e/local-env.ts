import { execSync } from 'node:child_process';
import fs from 'node:fs';

// Reads the URL and keys of the local Supabase (started with `npx supabase start`).
// These are throwaway keys for a database that only exists on this machine.
export function localSupabaseEnv() {
  const dockerBin = '/Applications/Docker.app/Contents/Resources/bin';
  const PATH = `${fs.existsSync(dockerBin) ? `${dockerBin}:` : ''}${process.env.PATH}`;
  let out: string;
  try {
    out = execSync('npx supabase status -o env', {
      env: { ...process.env, PATH },
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
  } catch {
    throw new Error(
      'Local Supabase is not running. Start Docker and run: npx supabase start',
    );
  }
  const get = (key: string) =>
    out.match(new RegExp(`^${key}="?([^"\\n]+)"?$`, 'm'))?.[1] ?? '';
  const env = {
    url: get('API_URL'),
    anonKey: get('ANON_KEY'),
    serviceKey: get('SERVICE_ROLE_KEY'),
  };
  if (!env.url || !env.anonKey || !env.serviceKey) {
    throw new Error(
      'Could not read the local Supabase keys from `supabase status`.',
    );
  }
  // Safety net: never run these tests against anything but localhost.
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.url)) {
    throw new Error(
      `Refusing to run E2E against a non-local Supabase: ${env.url}`,
    );
  }
  return env;
}
