import { createHash } from "node:crypto";
import { stableStringify } from "./json.ts";

const HASH_ALGORITHM = "sha256";
const SHORT_HASH_LENGTH = 16;

export const sha256Hex = (value: string): string =>
  createHash(HASH_ALGORITHM).update(value, "utf8").digest("hex");

export const hashJson = (value: unknown): string => sha256Hex(stableStringify(value));

export const shortHash = (value: string): string => value.slice(0, SHORT_HASH_LENGTH);
