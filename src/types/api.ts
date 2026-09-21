export interface LivenessResponse {
  readonly status: "ok";
  readonly uptimeSeconds: number;
}

export interface ReadinessResponse {
  readonly status: "ready" | "starting";
  readonly themesLoaded: boolean;
  readonly formatsWarmedUp: boolean;
}

export interface ReadinessState {
  themesLoaded: boolean;
  formatsWarmedUp: boolean;
}
