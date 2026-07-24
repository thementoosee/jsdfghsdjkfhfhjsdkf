/** Shared layout tokens for the main stream overlay grid. */
export const MAIN_OVERLAY_WIDTH_PX = 1920;
export const MAIN_OVERLAY_HEIGHT_PX = 1080;
export const MAIN_OVERLAY_SIDEBAR_WIDTH_PX = 288;
export const MAIN_OVERLAY_BAR_HEIGHT_PX = 50;
export const MAIN_OVERLAY_CONTENT_PAD_X_PX = 20;
export const MAIN_OVERLAY_CONTENT_PAD_TOP_PX = 10;
export const MAIN_OVERLAY_COLUMN_GAP_PX = 8;
export const MAIN_OVERLAY_CENTER_HEIGHT_PX = 720;
export const MAIN_OVERLAY_CENTER_RADIUS_PX = 16;

export type MainOverlayCasinoCutout = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

/** Exact casino window rect inside the 1920×1080 main overlay. */
export function getMainOverlayCasinoCutout(hasTopBar: boolean): MainOverlayCasinoCutout {
  const barHeight = hasTopBar ? MAIN_OVERLAY_BAR_HEIGHT_PX : 0;
  const x =
    MAIN_OVERLAY_CONTENT_PAD_X_PX +
    MAIN_OVERLAY_SIDEBAR_WIDTH_PX +
    MAIN_OVERLAY_COLUMN_GAP_PX;
  const width =
    MAIN_OVERLAY_WIDTH_PX -
    MAIN_OVERLAY_CONTENT_PAD_X_PX * 2 -
    MAIN_OVERLAY_SIDEBAR_WIDTH_PX * 2 -
    MAIN_OVERLAY_COLUMN_GAP_PX * 2;

  return {
    x,
    y: barHeight + MAIN_OVERLAY_CONTENT_PAD_TOP_PX,
    width,
    height: MAIN_OVERLAY_CENTER_HEIGHT_PX,
    radius: MAIN_OVERLAY_CENTER_RADIUS_PX,
  };
}

/** CSS mask that keeps the overlay chrome and punches out the casino window. */
export function getMainOverlayBackgroundMaskUrl(hasTopBar: boolean): string {
  const { x, y, width, height, radius } = getMainOverlayCasinoCutout(hasTopBar);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MAIN_OVERLAY_WIDTH_PX}" height="${MAIN_OVERLAY_HEIGHT_PX}" viewBox="0 0 ${MAIN_OVERLAY_WIDTH_PX} ${MAIN_OVERLAY_HEIGHT_PX}">` +
    `<defs><mask id="m" maskUnits="userSpaceOnUse">` +
    `<rect width="${MAIN_OVERLAY_WIDTH_PX}" height="${MAIN_OVERLAY_HEIGHT_PX}" fill="white"/>` +
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="black"/>` +
    `</mask></defs>` +
    `<rect width="${MAIN_OVERLAY_WIDTH_PX}" height="${MAIN_OVERLAY_HEIGHT_PX}" fill="white" mask="url(#m)"/>` +
    `</svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
