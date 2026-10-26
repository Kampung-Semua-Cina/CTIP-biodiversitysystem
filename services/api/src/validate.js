// Shared request validation (Zod). Answers 422 in the same { code, message }
// shape as every other error, with one entry per bad field in details.
export function parseBody(schema, req, res) {
  const result = schema.safeParse(req.body ?? {});
  if (result.success) return result.data;
  res.status(422).json({
    code: 'VALIDATION_ERROR',
    message: 'Request body failed validation',
    details: { fields: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
  });
  return null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
