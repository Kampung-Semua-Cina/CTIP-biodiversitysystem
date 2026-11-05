// Shared request validation (Zod) and error answers. Every error goes out in
// the same { code, message } shape; a 422 adds one entry per bad field in details.

export const fail = (res, status, code, message) => res.status(status).json({ code, message });
export const dbError = (res, error) => fail(res, 500, 'DB_ERROR', error.message);

export function validationError(res, error, message = 'Request body failed validation') {
  return res.status(422).json({
    code: 'VALIDATION_ERROR',
    message,
    details: { fields: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
  });
}

// The parsed body, or null after a 422.
export function parseBody(schema, req, res) {
  const result = schema.safeParse(req.body ?? {});
  if (result.success) return result.data;
  validationError(res, result.error);
  return null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
