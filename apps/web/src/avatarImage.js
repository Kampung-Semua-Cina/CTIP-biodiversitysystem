// apps/web/src/avatarImage.js
// Turns any photo into a small square profile picture in the browser: fixes the phone's
// rotation, crops the middle square, shrinks it and saves it as a JPEG. A 12 MB camera
// photo becomes about 15-30 KB, which the API accepts easily.

export const AVATAR_SIZE = 256; // pixels, width and height
export const AVATAR_MAX_BYTES = 60 * 1024; // the finished picture stays under this
export const AVATAR_MAX_INPUT = 25 * 1024 * 1024; // refuse files bigger than this before even decoding

// Where to cut a square out of a width x height picture: the biggest centred square.
// (Faces and subjects in profile photos are nearly always in the middle.)
export function squareCrop(width, height) {
  const side = Math.min(width, height);
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side };
}

// Draws the cropped square at `size` px. Steps down in halves so big photos stay sharp.
function drawSquare(bitmap, size) {
  const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
  let canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  let ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, side, side);
  while (canvas.width / 2 >= size) {
    const half = document.createElement("canvas");
    half.width = half.height = canvas.width / 2;
    half.getContext("2d").drawImage(canvas, 0, 0, half.width, half.height);
    canvas = half;
  }
  const out = document.createElement("canvas");
  out.width = out.height = size;
  ctx = out.getContext("2d");
  ctx.fillStyle = "#fff"; // JPEG has no transparency: a see-through PNG would go black
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, size, size);
  return out;
}

const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

const toDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// File -> data URL of a square JPEG. Rejects with an Error whose message can be shown to the person.
export async function prepareAvatar(file, { size = AVATAR_SIZE, maxBytes = AVATAR_MAX_BYTES } = {}) {
  if (file.size > AVATAR_MAX_INPUT) throw new Error("That photo is too large. Choose one under 25 MB.");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That file could not be read as an image");
  }
  try {
    const canvas = drawSquare(bitmap, size);
    let blob;
    for (let quality = 0.9; quality >= 0.4; quality -= 0.1) {
      blob = await toBlob(canvas, quality);
      if (blob && blob.size <= maxBytes) break;
    }
    if (!blob) throw new Error("Could not process the photo");
    return await toDataUrl(blob);
  } finally {
    bitmap.close?.();
  }
}
