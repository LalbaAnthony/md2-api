import { z } from "zod";
import type { JsonObject, JsonValue } from "../types/json.ts";

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonObjectSchema: z.ZodType<JsonObject> = z.lazy(() =>
  z.record(z.string(), jsonValueSchema),
);

export const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isUnknownArray = (value: object): value is readonly unknown[] => Array.isArray(value);

const asRecord = (value: object): Readonly<Record<string, unknown>> => ({ ...value });

const stringifyRecord = (value: Readonly<Record<string, unknown>>): string => {
  const entries = Object.keys(value)
    .sort()
    .map((key) => {
      const entry = value[key];
      return entry === undefined ? null : `${JSON.stringify(key)}:${stableStringify(entry)}`;
    })
    .filter((entry) => entry !== null);
  return `{${entries.join(",")}}`;
};

const UNSERIALISABLE = "null";

export const stableStringify = (value: unknown): string => {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return UNSERIALISABLE;
  }
  if (typeof value === "bigint") {
    return JSON.stringify(value.toString());
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (isUnknownArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return stringifyRecord(asRecord(value));
};
