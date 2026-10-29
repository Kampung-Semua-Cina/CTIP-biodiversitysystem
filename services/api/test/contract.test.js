import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routes } from '../src/permissions.js';

// The contract is the single source of truth (CLAUDE.md, "contract first").
// Every route the API answers must be written down there, so a new endpoint
// cannot slip in without its contract change and its two approvals.
// The YAML is read as text: each path is a 2-space key under `paths:`, and
// each method a 4-space key inside it.
const yaml = readFileSync(new URL('../../../packages/api-contract/openapi.yaml', import.meta.url), 'utf8');

function methodsOf(path) {
  const start = yaml.indexOf(`\n  ${path}:\n`);
  if (start === -1) return [];
  const rest = yaml.slice(start + path.length + 4);
  const end = rest.search(/\n {2}\/|\ncomponents:/);
  const block = end === -1 ? rest : rest.slice(0, end);
  return [...block.matchAll(/\n {4}(get|post|put|patch|delete):/g)].map((m) => m[1]);
}

test('every route in permissions.js is in the contract', () => {
  const missing = routes
    .map(([method, path]) => [method, path.replace(/:([A-Za-z]+)/g, '{$1}')])
    .filter(([method, path]) => !methodsOf(path).includes(method))
    .map(([method, path]) => `${method.toUpperCase()} ${path}`);
  assert.deepEqual(missing, []);
});
