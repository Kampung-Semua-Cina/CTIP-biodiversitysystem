// apps/mobile/scripts/build-apk.mjs
// npm run build:apk [-- --profile production]   (default profile: preview)
// Builds the Android APK on EAS with the right version. EAS servers only get a
// shallow git clone, where the commit count is wrong, so the version is saved
// to apps/shared/version.json first (uploaded with the project, read by
// app.config.js there) and deleted again once the upload is done.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (!args.includes('--profile')) args.push('--profile', 'preview');

const run = (cmd, cmdArgs) => spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: process.platform === 'win32' }).status ?? 1;

let status = run(process.execPath, ['../../scripts/version.mjs', '--write']);
if (status === 0) {
  try {
    status = run('npx', ['eas', 'build', '--platform', 'android', ...args]);
  } finally {
    run(process.execPath, ['../../scripts/version.mjs', '--clean']);
  }
}
process.exit(status);
