/** Shared layout tokens for the main stream overlay grid. */
export const MAIN_OVERLAY_WIDTH_PX = 1920;
export const MAIN_OVERLAY_HEIGHT_PX = 1080;
export const MAIN_OVERLAY_SIDEBAR_WIDTH_PX = 288;
export const MAIN_OVERLAY_BAR_HEIGHT_PX = 50;
export const MAIN_OVERLAY_CONTENT_PAD_X_PX = 20;
export const MAIN_OVERLAY_CONTENT_PAD_TOP_PX = 10;
export const MAIN_OVERLAY_CONTENT_PAD_BOTTOM_PX = 20;
export const MAIN_OVERLAY_COLUMN_GAP_PX = 8;
export const MAIN_OVERLAY_CENTER_HEIGHT_PX = 720;
export const MAIN_OVERLAY_CENTER_RADIUS_PX = 16;

/** Secondary slot capture (bottom-left PiP), 16:9. */
export const MAIN_OVERLAY_SECOND_SLOT_WIDTH_PX = 480;
export const MAIN_OVERLAY_SECOND_SLOT_HEIGHT_PX = 270;
export const MAIN_OVERLAY_SECOND_SLOT_RADIUS_PX = 12;
export const MAIN_OVERLAY_SECOND_SLOT_GAP_PX = 12;

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

/** Small second slot window in the bottom-left corner (true alpha hole for OBS). */
export function getMainOverlaySecondSlotCutout(hasTopBar: boolean): MainOverlayCasinoCutout {
  const barHeight = hasTopBar ? MAIN_OVERLAY_BAR_HEIGHT_PX : 0;
  const mainBottom =
    barHeight + MAIN_OVERLAY_CONTENT_PAD_TOP_PX + MAIN_OVERLAY_CENTER_HEIGHT_PX;

  // Prefer sitting just under the left column; clamp to bottom pad if needed.
  let y = mainBottom + MAIN_OVERLAY_SECOND_SLOT_GAP_PX;
  const maxY =
    MAIN_OVERLAY_HEIGHT_PX -
    MAIN_OVERLAY_CONTENT_PAD_BOTTOM_PX -
    MAIN_OVERLAY_SECOND_SLOT_HEIGHT_PX;
  if (y > maxY) y = maxY;

  return {
    x: MAIN_OVERLAY_CONTENT_PAD_X_PX,
    y,
    width: MAIN_OVERLAY_SECOND_SLOT_WIDTH_PX,
    height: MAIN_OVERLAY_SECOND_SLOT_HEIGHT_PX,
    radius: MAIN_OVERLAY_SECOND_SLOT_RADIUS_PX,
  };
}

/** CSS mask that keeps the overlay chrome and punches out casino (+ optional second-slot) windows. */
export function getMainOverlayBackgroundMaskUrl(
  hasTopBar: boolean,
  options: { showSecondSlot?: boolean } = {},
): string {
  const showSecondSlot = options.showSecondSlot !== false;
  const main = getMainOverlayCasinoCutout(hasTopBar);
  const second = showSecondSlot ? getMainOverlaySecondSlotCutout(hasTopBar) : null;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MAIN_OVERLAY_WIDTH_PX}" height="${MAIN_OVERLAY_HEIGHT_PX}" viewBox="0 0 ${MAIN_OVERLAY_WIDTH_PX} ${MAIN_OVERLAY_HEIGHT_PX}">` +
    `<defs><mask id="m" maskUnits="userSpaceOnUse">` +
    `<rect width="${MAIN_OVERLAY_WIDTH_PX}" height="${MAIN_OVERLAY_HEIGHT_PX}" fill="white"/>` +
    `<rect x="${main.x}" y="${main.y}" width="${main.width}" height="${main.height}" rx="${main.radius}" ry="${main.radius}" fill="black"/>` +
    (second
      ? `<rect x="${second.x}" y="${second.y}" width="${second.width}" height="${second.height}" rx="${second.radius}" ry="${second.radius}" fill="black"/>`
      : '') +
    `</mask></defs>` +
    `<rect width="${MAIN_OVERLAY_WIDTH_PX}" height="${MAIN_OVERLAY_HEIGHT_PX}" fill="white" mask="url(#m)"/>` +
    `</svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
