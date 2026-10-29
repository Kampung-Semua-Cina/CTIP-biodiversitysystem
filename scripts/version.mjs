// scripts/version.mjs
// One version for the web and mobile apps: MAJOR.MINOR from the root
// package.json, then the number of commits, so every commit is a new version
// (1.0.103 -> 1.0.104) without editing a file that branches would fight over.
// To start a new release line, change "version" in the root package.json
// (for example 1.0.0 -> 1.1.0); the last number always comes from git.
//
//   node scripts/version.mjs            print the version
//   node scripts/version.mjs --write    also save it to apps/shared/version.json
//   node scripts/version.mjs --clean    delete that file
//
// The saved file is for builds without the git history: EAS uploads a shallow
// clone, so on its servers every project looks like it has 1 commit. The
// mobile build script writes the file before uploading and deletes it after.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const STAMP_FILE = join(ROOT, 'apps/shared/version.json');

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function fromGit() {
  try {
    if (git('rev-parse', '--is-shallow-repository') === 'true') return null; // count would be wrong
    return {
      build: Number(git('rev-list', '--count', 'HEAD')),
      commit: git('rev-parse', '--short', 'HEAD'),
      dirty: git('status', '--porcelain', '--untracked-files=no') !== '',
    };
  } catch {
    return null; // no git, or no commits yet
  }
}

export function getVersion() {
  if (!fromGit() && existsSync(STAMP_FILE)) return JSON.parse(readFileSync(STAMP_FILE, 'utf8'));
  const base = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version ?? '1.0.0';
  const [major = 1, minor = 0] = base.split('.').map(Number);
  const g = fromGit() ?? { build: 0, commit: 'unknown', dirty: false };
  return {
    version: `${major}.${minor}.${g.build}`,
    build: g.build,
    commit: g.commit,
    dirty: g.dirty, // built from changes that are not committed yet
    builtAt: new Date().toISOString(),
  };
}

// "v1.0.103 · a1b2c3d", with "+changes" when built from uncommitted work.
export const versionLabel = (v) => `v${v.version} · ${v.commit}${v.dirty ? '+changes' : ''}`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--clean')) {
    rmSync(STAMP_FILE, { force: true });
  } else {
    const v = getVersion();
    if (process.argv.includes('--write')) writeFileSync(STAMP_FILE, JSON.stringify(v, null, 2) + '\n');
    console.log(versionLabel(v));
  }
}
