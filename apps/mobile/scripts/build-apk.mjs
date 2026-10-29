// apps/mobile/scripts/build-apk.mjs
// npm run build:apk [-- --profile production]   (Remote EAS build, default profile: preview)
// npm run build:apk:local                       (Local EAS build inside WSL)
// Builds the Android APK on EAS with the right version. EAS servers only get a
// shallow git clone, where the commit count is wrong, so the version is saved
// to apps/shared/version.json first (uploaded with the project, read by
// app.config.js there) and deleted again once the upload is done.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const isLocal = args.includes('--local');

if (!args.includes('--profile')) {
  args.push('--profile', isLocal ? 'preview-local' : 'preview');
} else if (isLocal) {
  // If user passed --profile preview or --profile production with --local, map to local profile
  const profileIdx = args.indexOf('--profile');
  if (profileIdx !== -1 && args[profileIdx + 1] && !args[profileIdx + 1].endsWith('-local')) {
    args[profileIdx + 1] = `${args[profileIdx + 1]}-local`;
  }
}

const run = (cmd, cmdArgs) => spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: true }).status ?? 1;

let status = run(process.execPath, ['../../scripts/version.mjs', '--write']);
if (status === 0) {
  try {
    status = run('npx', ['--yes', 'eas-cli', 'build', '--platform', 'android', ...args]);
  } finally {
    run(process.execPath, ['../../scripts/version.mjs', '--clean']);
  }
}
process.exit(status);
