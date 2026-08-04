/**
 * Payload validation for the /api/* routes.
 *
 * Every route builds a prompt out of caller-supplied strings, so unbounded
 * input is both a cost problem (tokens billed per call) and a prompt-injection
 * surface. Each validator returns a *new* object containing only the fields
 * the prompt actually uses — route handlers never see the raw body, so an
 * extra field can't reach the model by accident.
 */

import { HttpError } from './guard.mjs';

export const LIMITS = {
  title: 200,
  description: 2000,
  content: 500,
  playerId: 64,
  announcement: 1000,
  submissions: 32,
};

function requireString(value, max, field) {
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) throw new HttpError(400, `${field} must not be empty`);
  if (trimmed.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return trimmed;
}

function optionalString(value, max, field) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return trimmed;
}

function requireImage(value, field) {
  if (!value || typeof value !== 'object') throw new HttpError(400, `${field} must be an object`);
  return {
    title: requireString(value.title, LIMITS.title, `${field}.title`),
    description: optionalString(value.description, LIMITS.description, `${field}.description`),
  };
}

function requireSubmissions(value, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) throw new HttpError(400, 'submissions must be an array');
  if (!allowEmpty && value.length === 0) throw new HttpError(400, 'submissions must not be empty');
  if (value.length > LIMITS.submissions) {
    throw new HttpError(400, `submissions must contain at most ${LIMITS.submissions} entries`);
  }
  return value.map((entry, i) => {
    if (!entry || typeof entry !== 'object') throw new HttpError(400, `submissions[${i}] must be an object`);
    return {
      playerId: requireString(entry.playerId, LIMITS.playerId, `submissions[${i}].playerId`),
      content: requireString(entry.content, LIMITS.content, `submissions[${i}].content`),
    };
  });
}

function imagePair(body) {
  return {
    imageA: requireImage(body.imageA, 'imageA'),
    imageB: requireImage(body.imageB, 'imageB'),
  };
}

const VALIDATORS = {
  '/api/commentary': (body) => ({ ...imagePair(body), submissions: requireSubmissions(body.submissions) }),
  '/api/label': (body) => ({ ...imagePair(body), submissions: requireSubmissions(body.submissions) }),
  '/api/moderate': (body) => ({
    ...imagePair(body),
    submissions: requireSubmissions(body.submissions),
    // Anything other than the two known tones would be interpolated straight
    // into the moderator prompt, so it is a closed set rather than a string.
    tone: body.tone === 'serious' ? 'serious' : 'funny',
  }),
  '/api/submission': (body) => imagePair(body),
  '/api/visualize': (body) => ({
    ...imagePair(body),
    winningText: requireString(body.winningText, LIMITS.content, 'winningText'),
  }),
  '/api/announce': (body) => ({ text: requireString(body.text, LIMITS.announcement, 'text') }),
};

/**
 * Validates and narrows a request body for `route`.
 * Throws HttpError(400) with a caller-facing message on any violation.
 */
export function validateBody(route, body) {
  const validator = VALIDATORS[route];
  if (!validator) throw new HttpError(404, 'Not found');
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
  return validator(body);
}
