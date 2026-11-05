import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emailProblem, passwordProblem, nameProblem, weakPasswordMessage } from '../src/accountRules.js';

// The reasons a new account's details are refused, in plain words.

test('fine addresses pass', () => {
  for (const ok of ['lim.jiajia@gmail.com', 'abcdef+sfc@gmail.com', 'ranger@sarawakforestry.com', 'a@sfc.gov.my', 'x_y-z@uni.edu.my']) {
    assert.equal(emailProblem(ok), null, ok);
  }
});

test('1@gmail.com: Gmail needs 6 to 30 letters or numbers', () => {
  assert.match(emailProblem('1@gmail.com'), /Gmail addresses have 6 to 30 letters or numbers before the @; "1" has 1/);
});

test('each kind of bad address gets its own reason', () => {
  assert.match(emailProblem(''), /Enter an email/);
  assert.match(emailProblem('a b@gmail.com'), /spaces/);
  assert.match(emailProblem('name.gmail.com'), /exactly one @/);
  assert.match(emailProblem('a@b@gmail.com'), /exactly one @/);
  assert.match(emailProblem('@gmail.com'), /before the @/);
  assert.match(emailProblem('name@'), /after the @/);
  assert.match(emailProblem('.name@uni.edu'), /start or end with a dot/);
  assert.match(emailProblem('na..me@uni.edu'), /two dots/);
  assert.match(emailProblem('name@localhost'), /not a full domain/);
  assert.match(emailProblem('name@-bad.com'), /not a valid domain/);
  assert.match(emailProblem('someone@gmial.com'), /Did you mean gmail.com/);
  assert.match(emailProblem('some_one@gmail.com'), /only use letters, numbers and dots/);
});

test('passwords and names', () => {
  assert.match(passwordProblem('short'), /at least 8 characters \(it has 5\)/);
  assert.match(passwordProblem(' padded1 '), /space/);
  assert.equal(passwordProblem('longenough1'), null);
  assert.match(nameProblem('   '), /Enter the person's name/);
  assert.match(weakPasswordMessage(['pwned']), /data leak/);
});

test('the API and the apps use the same rules (keep the two files the same)', () => {
  const body = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n').split('\n').slice(1).join('\n');
  assert.equal(body('../src/accountRules.js'), body('../../../apps/shared/accountRules.js'));
});
