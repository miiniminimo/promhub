/**
 * Raster formats we accept for uploads and serve inline. SVG is deliberately excluded:
 * it can carry scripts that would run on our origin.
 */
export const SAFE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
