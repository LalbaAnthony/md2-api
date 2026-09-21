import type { DocumentWarning, WarningSink } from "../../types/pipeline.ts";
import type { JsonObject } from "../../types/json.ts";

export const createWarningSink = (): WarningSink => {
  const warnings: DocumentWarning[] = [];
  return {
    add: (warning) => {
      warnings.push(warning);
    },
    list: () => warnings,
  };
};

export const warning = (
  code: string,
  message: string,
  detail: JsonObject = {},
): DocumentWarning => ({ code, message, detail });
