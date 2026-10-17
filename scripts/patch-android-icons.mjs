#!/usr/bin/env bun
/**
 * Generates HME Wallet launcher icons for the freshly-added Android
 * platform. Runs after `bunx cap add android` / `cap sync android` so the
 * generated `android/app/src/main/res/` overwrites Capacitor's default
 * Capacitor logo with our dollar-sign brand mark.
 *
 * Emits:
 *   - Legacy square icons: mipmap-{mdpi..xxxhdpi}/ic_launcher.png +
 *     ic_launcher_round.png (silver $ on dark or light background depending
 *     on system theme — background lives in a color resource so day/night
 *     resource selection swaps it automatically).
 *   - Adaptive icons: mipmap-anydpi-v26/ic_launcher.xml + _round.xml
 *     referencing a foreground drawable (silver $ silhouette) and a themed
 *     background color.
 *   - Themed (monochrome) icon for Android 13+: mipmap-DENSITY/ic_launcher_monochrome.png.
 *   - Background color: values/ic_launcher_background.xml (light bg for day
 *     theme) and values-night/ic_launcher_background.xml (dark bg).
 *
 * Idempotent — safe to run repeatedly.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const androidRes = resolve(root, "android/app/src/main/res");
if (!existsSync(resolve(root, "android/app"))) {
  console.log("patch-android-icons: android/ not present, skipping.");
  process.exit(0);
}

// The Vault mark (steel vault door). One source: launcher icons are silver on
// dark, and the monochrome layer is derived from its alpha silhouette.
const SILVER = resolve(root, "src/assets/brand/vault-mark.png");
if (!existsSync(SILVER)) {
  console.error("patch-android-icons: source vault mark missing. Aborting.");
  process.exit(1);
}

// App background matches Splash / theme (#0b0f14). Light bg is a warm cream
// so the silver mark keeps enough contrast in day mode too.
const BG_DARK = { r: 11, g: 15, b: 20, alpha: 1 };
const BG_LIGHT = { r: 245, g: 240, b: 230, alpha: 1 };

// Legacy launcher sizes (full square).
const LEGACY = [
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
];
// Adaptive canvas is 108dp; the mark should sit inside the 66dp safe zone.
const ADAPTIVE = [
  ["mdpi", 108],
  ["hdpi", 162],
  ["xhdpi", 216],
  ["xxhdpi", 324],
  ["xxxhdpi", 432],
];
const SAFE_RATIO = 66 / 108;

async function ensure(dir) {
  await mkdir(dir, { recursive: true });
}

/** Composite mark (any color) onto a solid background, output PNG at `size`. */
async function legacyIcon(markPath, bg, size, outPath) {
  const inner = Math.round(size * 0.68);
  const markBuf = await sharp(markPath)
    .resize({ width: inner, height: inner, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: markBuf, gravity: "center" }])
    .png()
    .toFile(outPath);
}

/** Adaptive foreground: mark centered inside 108dp canvas at safe-zone size, transparent bg. */
async function adaptiveForeground(markPath, canvas, outPath) {
  const inner = Math.round(canvas * SAFE_RATIO);
  const markBuf = await sharp(markPath)
    .resize({ width: inner, height: inner, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: markBuf, gravity: "center" }])
    .png()
    .toFile(outPath);
}

/**
 * Monochrome (themed) icon: Android 13+ tints the alpha channel with the
 * system accent color. Photoreal metal thresholds into noise, so draw a crisp
 * simplified vault silhouette (ring, 5-spoke handle, hub) instead — matching
 * the launcher mark's geometry.
 */
async function monochromeIcon(canvas, outPath) {
  const safe = canvas * SAFE_RATIO; // mark size inside the 108dp canvas
  const c = canvas / 2;
  const s = safe / 2; // mark radius
  const ring = s * 0.11; // outer ring stroke width
  const outer = s - ring / 2; // outer ring centerline radius
  const inner = s * 0.52; // inner rim ring radius
  const hub = s * 0.16;
  const spokes = [0, 72, 144, 216, 288]
    .map((deg) => {
      const rad = (deg * Math.PI) / 180;
      const x1 = c + Math.cos(rad) * hub * 0.7;
      const y1 = c + Math.sin(rad) * hub * 0.7;
      const x2 = c + Math.cos(rad) * inner;
      const y2 = c + Math.sin(rad) * inner;
      return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" />`;
    })
    .join("\n    ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
  <g fill="none" stroke="#000" stroke-linecap="round">
    <circle cx="${c}" cy="${c}" r="${outer.toFixed(2)}" stroke-width="${ring.toFixed(2)}" />
    <circle cx="${c}" cy="${c}" r="${inner.toFixed(2)}" stroke-width="${(ring * 0.45).toFixed(2)}" />
    <g stroke-width="${(ring * 0.9).toFixed(2)}">${spokes}</g>
    <circle cx="${c}" cy="${c}" r="${hub.toFixed(2)}" fill="#000" stroke="none" />
  </g>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outPath);
}

async function main() {
  // 1. Legacy square icons (silver on dark bg, matches the app's dark theme).
  for (const [density, size] of LEGACY) {
    const dir = resolve(androidRes, `mipmap-${density}`);
    await ensure(dir);
    await legacyIcon(SILVER, BG_DARK, size, resolve(dir, "ic_launcher.png"));
    await legacyIcon(SILVER, BG_DARK, size, resolve(dir, "ic_launcher_round.png"));
  }

  // 2. Adaptive foreground + monochrome layer, per density.
  for (const [density, canvas] of ADAPTIVE) {
    const dir = resolve(androidRes, `mipmap-${density}`);
    await ensure(dir);
    await adaptiveForeground(SILVER, canvas, resolve(dir, "ic_launcher_foreground.png"));
    await monochromeIcon(canvas, resolve(dir, "ic_launcher_monochrome.png"));
  }

  // 3. Adaptive icon XML (anydpi-v26).
  const adaptiveDir = resolve(androidRes, "mipmap-anydpi-v26");
  await ensure(adaptiveDir);
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`;
  await writeFile(resolve(adaptiveDir, "ic_launcher.xml"), adaptiveXml);
  await writeFile(resolve(adaptiveDir, "ic_launcher_round.xml"), adaptiveXml);

  // 4. Themed background color — day (light) + night (dark) variants.
  const valuesDir = resolve(androidRes, "values");
  const valuesNightDir = resolve(androidRes, "values-night");
  await ensure(valuesDir);
  await ensure(valuesNightDir);
  await writeFile(
    resolve(valuesDir, "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#F5F0E6</color>
</resources>
`,
  );
  await writeFile(
    resolve(valuesNightDir, "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0B0F14</color>
</resources>
`,
  );

  // 5. In day mode the silver mark loses contrast on the cream background,
  // so swap the legacy icons in values-night is not enough — the launcher
  // uses adaptive icon on v26+ regardless. Also emit a dark-mark variant of
  // the legacy icons under values… actually launcher icons live in mipmap-
  // not values-, so day/night can't split legacy PNGs. For Android <8 the
  // silver-on-dark PNG stays; Android 8+ always uses adaptive.

  console.log(
    `patch-android-icons: wrote ${LEGACY.length * 2} legacy + ${ADAPTIVE.length * 2} adaptive PNGs and adaptive/theme XML.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
