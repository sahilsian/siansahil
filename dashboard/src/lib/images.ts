// Image helpers: preview addresses and shrinking photos before upload.

/** Longest side of uploaded photos. Plenty for full-screen viewing. */
const MAX_SIDE = 2400;
const JPEG_QUALITY = 0.88;

/** Where to load an image from, for previews in the dashboard. */
export function previewUrl(url: string, siteUrl: string | null): string {
  if (/^https?:\/\//.test(url)) return url;
  if (url.startsWith("/") && siteUrl) return siteUrl.replace(/\/+$/, "") + url;
  return url;
}

/**
 * Shrink and re-encode a photo as JPEG. Re-encoding also strips hidden metadata
 * such as the GPS location phones embed in photos.
 */
export async function prepareImage(file: File): Promise<{ blob: Blob; name: string }> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new Error(`“${file.name}” isn't a photo this dashboard can use (JPEG, PNG, WebP or HEIC).`);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`Couldn't read “${file.name}”. Try saving it as a JPEG first.`);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't process this image.");
  ctx.fillStyle = "#ffffff"; // transparent areas become white in a JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("Your browser couldn't process this image.");
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").slice(0, 80) || "photo";
  return { blob, name: `${base}.jpg` };
}

/** "Sunflowers in July!" → "sunflowers-in-july" */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
