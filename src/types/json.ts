export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export type JsonArray = readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}
