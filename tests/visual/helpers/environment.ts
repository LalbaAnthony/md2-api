export const VISUAL_TOLERANCE = 0.001;

export const VISUAL_THRESHOLD = 0.1;

export const RASTER_RESOLUTION_DPI = 96;

export const isInsideTestImage = (): boolean => process.env["IN_DOCKER"] === "1";

export const updatesBaselines = (): boolean => process.env["MD2_UPDATE_VISUAL_BASELINES"] === "1";
