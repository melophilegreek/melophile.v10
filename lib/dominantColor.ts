// Feature (Dynamic theming): extracts a representative accent color from
// an image (album art) entirely client-side via a downscaled canvas -- no
// network calls, no native "wallpaper" access (browsers don't expose that;
// see the conversation this was scoped down from). This is a simplified
// stand-in for something like Android's Palette API: bucket pixels into
// coarse color bins, then pick the most common bin that's reasonably
// saturated and not too dark/light (so covers that are mostly black
// letters on white, or vice versa, don't produce a useless near-black or
// near-white accent), falling back to a plain average if nothing qualifies.

const SAMPLE_SIZE = 48; // downscale target -- plenty for a color estimate, cheap to process

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4;
  }
  return [h / 6, s, l];
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * Returns a hex accent color extracted from the image at `url`, or null if
 * the image couldn't be loaded/read (e.g. a canvas-tainting cross-origin
 * image, though that shouldn't happen with our own blob: URLs).
 */
export async function getDominantColor(url: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image load failed'));
    });
    img.src = url;
    await loaded;

    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    // Bucket into coarse 32-step RGB bins (5 bits/channel) so near-identical
    // pixels count as "the same" color for frequency purposes.
    const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
    let sumR = 0, sumG = 0, sumB = 0, n = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 128) continue; // skip transparent pixels (padded/non-square art)
      sumR += r; sumG += g; sumB += b; n++;
      const key = `${r >> 3}-${g >> 3}-${b >> 3}`;
      const bucket = buckets.get(key);
      if (bucket) { bucket.count++; }
      else buckets.set(key, { count: 1, r, g, b });
    }
    if (n === 0) return null;

    // Rank buckets by count, but only consider ones with enough saturation
    // and mid-range lightness to make a good accent (skip near-black,
    // near-white, and near-gray bins).
    const ranked = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
    for (const bucket of ranked) {
      const [, s, l] = rgbToHsl(bucket.r, bucket.g, bucket.b);
      if (s >= 0.25 && l >= 0.15 && l <= 0.85) return toHex(bucket.r, bucket.g, bucket.b);
    }

    // Nothing vibrant enough was found (e.g. genuinely monochrome art) --
    // fall back to the plain average color rather than returning null,
    // since a muted accent still beats silently doing nothing.
    return toHex(sumR / n, sumG / n, sumB / n);
  } catch {
    return null;
  }
}
