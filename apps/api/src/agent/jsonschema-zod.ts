import { z, type ZodType } from "zod";

/**
 * Converts the JSON Schema subset used by `qloo mcp` tool inputs into a Zod raw shape,
 * so the in-process proxy can expose each Qloo tool with the same parameter names,
 * types, enums, bounds and descriptions as the real server.
 */
type JS = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  items?: JS;
  properties?: Record<string, JS>;
  required?: string[];
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  description?: string;
  default?: unknown;
  uniqueItems?: boolean;
  anyOf?: JS[];
};

function convert(schema: JS): ZodType {
  let out: ZodType;
  if (schema.enum && schema.enum.every((v) => typeof v === "string")) {
    out = z.enum(schema.enum as [string, ...string[]]);
  } else if (schema.anyOf) {
    const parts = schema.anyOf.map(convert);
    out = parts.length === 1 ? parts[0]! : z.union(parts as [ZodType, ZodType, ...ZodType[]]);
  } else {
    const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;
    switch (t) {
      case "string": {
        let s = z.string();
        if (schema.minLength !== undefined) s = s.min(schema.minLength);
        if (schema.maxLength !== undefined) s = s.max(schema.maxLength);
        if (schema.pattern) s = s.regex(new RegExp(schema.pattern));
        out = s;
        break;
      }
      case "integer":
      case "number": {
        let n = t === "integer" ? z.number().int() : z.number();
        if (schema.minimum !== undefined) n = n.min(schema.minimum);
        if (schema.maximum !== undefined) n = n.max(schema.maximum);
        out = n;
        break;
      }
      case "boolean":
        out = z.boolean();
        break;
      case "array": {
        let a = z.array(schema.items ? convert(schema.items) : z.unknown());
        if (schema.minItems !== undefined) a = a.min(schema.minItems);
        if (schema.maxItems !== undefined) a = a.max(schema.maxItems);
        out = a;
        break;
      }
      case "object":
        out = z.object(toShape(schema)).strict();
        break;
      default:
        out = z.unknown();
    }
  }
  if (schema.description) out = out.describe(schema.description);
  return out;
}

export function toShape(schema: JS): Record<string, ZodType> {
  const shape: Record<string, ZodType> = {};
  const required = new Set(schema.required ?? []);
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const zt = convert(prop);
    shape[key] = required.has(key) ? zt : zt.optional();
  }
  return shape;
}
