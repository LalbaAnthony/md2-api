import type { ReadinessState } from "../types/api.ts";

export const createReadinessState = (): ReadinessState => ({
  themesLoaded: false,
  formatsWarmedUp: false,
});

export const isReady = (state: ReadinessState): boolean =>
  state.themesLoaded && state.formatsWarmedUp;
