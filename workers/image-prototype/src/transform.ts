import { optimizeImage } from "wasm-image-optimization";
import { getImageDimensions } from "./dimensions";
import { MAX_INPUT_PIXELS, QUALITY_MAX, QUALITY_MIN } from "./config";

export interface TransformResult {
  data: Uint8Array;
  width: number;
  height: number;
  format: string;
  originalWidth: number;
  originalHeight: number;
  originalFormat: string;
}

export const PIXEL_LIMIT_ERROR = "input_pixels_exceeded";

export type OutputFormat = "jpeg" | "webp";

/**
 * Real WASM transform: decode -> scale-down (never upscale) -> re-encode.
 *
 * Throws on malformed/unsupported input or engine failure so the caller can
 * return a controlled error. It never falls back to returning original bytes
 * as if they were a successful transform.
 */
export async function transformImage(
  input: Uint8Array,
  requestedWidth: number,
  format: OutputFormat,
  quality: number,
): Promise<TransformResult> {
  const dims = getImageDimensions(input);
  if (!dims || dims.width < 1 || dims.height < 1) {
    throw new Error("unsupported_or_corrupt_input");
  }

  if (dims.width * dims.height > MAX_INPUT_PIXELS) {
    throw new Error(PIXEL_LIMIT_ERROR);
  }

  // Never upscale beyond the original dimensions.
  const width = Math.min(requestedWidth, dims.width);
  const qualityClamped = Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, quality));

  const result = await optimizeImage({
    image: input,
    width,
    fit: "contain", // preserve aspect ratio
    format, // "jpeg" | "webp"
    quality: qualityClamped,
    animation: false,
  });

  if (!result.data || result.data.byteLength === 0) {
    throw new Error("empty_output");
  }
  if (result.format !== format) {
    throw new Error(`unexpected_output_format:${result.format}`);
  }
  // Defense in depth: the engine must never upscale.
  if (result.width > dims.width || result.height > dims.height) {
    throw new Error("upscale_refused");
  }

  return {
    data: result.data,
    width: result.width,
    height: result.height,
    format: result.format,
    originalWidth: result.originalWidth,
    originalHeight: result.originalHeight,
    originalFormat: result.originalFormat,
  };
}
