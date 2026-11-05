// Supabase's email rate limit.
//
// Supabase Auth sends the sign-up confirmation, invitation and password-reset
// emails. With its built-in email sender it allows only a few emails an hour
// for the whole project (2 by default; Authentication > Rate Limits), whoever
// asks for them. Over that it refuses with 429 "email rate limit exceeded"
// (code over_email_send_rate_limit) and the email is never sent.
//
// Supabase does not say when the next email will be allowed, so this file
// remembers when this API sent emails and works it out: the oldest email of
// the last hour leaves the window first. Emails sent by another copy of the
// API (Render, someone's laptop) are not known here, so with none on record
// the answer is "up to an hour".

const WINDOW_MS = 60 * 60 * 1000;
export const emailLimitPerHour = () => {
  const n = Number(process.env.EMAIL_RATE_LIMIT_PER_HOUR);
  return Number.isInteger(n) && n > 0 ? n : 2;
};

let sent = []; // times this API had an email sent, oldest first

export function recordEmailSent(now = Date.now()) {
  sent = [...sent.filter((t) => now - t < WINDOW_MS), now];
}

export function isEmailRateLimit(error) {
  if (!error) return false;
  return error.code === 'over_email_send_rate_limit' ||
    (error.status === 429 && /email/i.test(error.message ?? ''));
}

// { limit, sent_last_hour, wait_minutes, estimated } for the message and the notification.
export function emailLimitInfo(now = Date.now()) {
  sent = sent.filter((t) => now - t < WINDOW_MS);
  const limit = emailLimitPerHour();
  const oldest = sent[0];
  const waitMs = oldest === undefined ? WINDOW_MS : oldest + WINDOW_MS - now;
  return {
    limit,
    sent_last_hour: sent.length,
    wait_minutes: Math.max(1, Math.ceil(waitMs / 60000)),
    estimated: oldest === undefined, // nothing on record: the longest it can be
  };
}

export const emailLimitMessage = (info) =>
  `The email limit is reached (${info.limit}/${info.limit} per hour). ` +
  `Try again in ${info.estimated ? 'up to' : 'about'} ${info.wait_minutes} minute${info.wait_minutes === 1 ? '' : 's'}.`;

// For tests.
export function resetEmailLimit() {
  sent = [];
}
