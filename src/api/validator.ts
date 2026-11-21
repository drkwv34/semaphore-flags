import { Ajv } from "ajv";
import type { FastifySchemaCompiler } from "fastify";

const sharedAjvOptions = {
  coerceTypes: "array" as const,
  useDefaults: true,
  removeAdditional: true,
  addUsedSchema: false,
  allErrors: false,
};

const bodyAjv = new Ajv({ ...sharedAjvOptions, coerceTypes: false });
const coercedAjv = new Ajv(sharedAjvOptions);

/** JSON bodies keep declared types; query/params/headers still coerce (e.g. audit limit). */
export const requestValidatorCompiler: FastifySchemaCompiler<object> = (routeSchema) => {
  const ajv = routeSchema.httpPart === "body" ? bodyAjv : coercedAjv;
  return ajv.compile(routeSchema.schema);
};
