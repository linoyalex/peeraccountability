export const PROOF_IMAGE_MAX_EDGE = 1280;
export const PROOF_IMAGE_QUALITY = 0.72;
export const PROOF_IMAGE_MAX_BYTES = 300 * 1024;

const MIN_LONGEST_EDGE = 320;

export function fitWithinLongestEdge(
  width: number,
  height: number,
  maxEdge = PROOF_IMAGE_MAX_EDGE,
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(maxEdge) ||
    width <= 0 ||
    height <= 0 ||
    maxEdge <= 0
  ) {
    throw new RangeError("Invalid image dimensions");
  }

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Unable to encode proof photo"));
        }
      },
      "image/jpeg",
      PROOF_IMAGE_QUALITY,
    );
  });
}

async function decodeImage(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;

  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }

  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    dispose: () => URL.revokeObjectURL(objectUrl),
  };
}

function jpegName(name: string) {
  const stem = name.replace(/\.[^.]+$/, "").trim() || "proof";
  return `${stem}.jpg`;
}

export async function downscaleProofImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new TypeError("Proof must be an image");
  }

  const decoded = await decodeImage(file);

  try {
    let dimensions = fitWithinLongestEdge(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Unable to prepare proof photo");
    }

    let jpeg: Blob;
    do {
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      jpeg = await canvasToJpeg(canvas);

      if (jpeg.size <= PROOF_IMAGE_MAX_BYTES) {
        break;
      }

      const longestEdge = Math.max(dimensions.width, dimensions.height);
      if (longestEdge <= MIN_LONGEST_EDGE) {
        throw new Error("Proof photo could not be reduced below 300KB");
      }

      // Keep the locked JPEG quality and reduce dimensions based on the observed byte ratio.
      // The 0.9 ceiling guarantees forward progress even for unusually compressible images.
      const scale = Math.min(
        0.9,
        Math.sqrt(PROOF_IMAGE_MAX_BYTES / jpeg.size) * 0.95,
      );
      dimensions = fitWithinLongestEdge(
        decoded.width,
        decoded.height,
        Math.max(MIN_LONGEST_EDGE, Math.floor(longestEdge * scale)),
      );
    } while (true);

    return new File([jpeg], jpegName(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    decoded.dispose();
  }
}
