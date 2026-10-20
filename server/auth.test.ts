import { expect, test } from 'vitest';
import { emailAllowed } from './auth.ts';
import type { Env } from './env.ts';

const env = (ALLOWED_EMAILS?: string) => ({ ALLOWED_EMAILS }) as Env;

test('nobody may sign in while ALLOWED_EMAILS is unset or empty', () => {
  expect(emailAllowed(env(undefined), 'ada@example.com')).toBe(false);
  expect(emailAllowed(env(''), 'ada@example.com')).toBe(false);
  expect(emailAllowed(env(' , '), 'ada@example.com')).toBe(false);
});

test('listed emails may sign in, ignoring case and spaces', () => {
  const allowed = env('ada@example.com, Bob@Example.com');
  expect(emailAllowed(allowed, 'ada@example.com')).toBe(true);
  expect(emailAllowed(allowed, 'BOB@example.com')).toBe(true);
  expect(emailAllowed(allowed, 'eve@example.com')).toBe(false);
});
