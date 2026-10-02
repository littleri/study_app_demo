import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(root, "assets/brand/app-logo-source.png"));
const background = "#fefdfa";
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function square(size) {
  return sharp(source)
    .resize(size, size, { fit: "contain", background })
    .png()
    .toBuffer();
}

async function shaped(buffer, size, shape) {
  const mask = shape === "circle"
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>`
    : `<rect width="${size}" height="${size}" rx="${size * 0.2}" fill="white"/>`;
  return sharp(buffer)
    .ensureAlpha()
    .composite([{ input: Buffer.from(`<svg width="${size}" height="${size}">${mask}</svg>`), blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function save(path, buffer) {
  const destination = resolve(root, path);
  await mkdir(dirname(destination), { recursive: true });
  await sharp(buffer).png().toFile(destination);
}

await save("public/assets/brand/app-logo.png", await square(512));
for (const [name, size] of [
  ["favicon-48.png", 48],
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512]
]) {
  await save(`public/icons/${name}`, await square(size));
}

// Leave room for the icon masks applied by installed web apps.
const maskable = await sharp({ create: { width: 512, height: 512, channels: 4, background } })
  .composite([{ input: await square(384), left: 64, top: 64 }])
  .png()
  .toBuffer();
await save("public/icons/icon-maskable-512.png", maskable);

for (const [density, scale] of [
  ["mdpi", 1],
  ["hdpi", 1.5],
  ["xhdpi", 2],
  ["xxhdpi", 3],
  ["xxxhdpi", 4]
]) {
  const directory = `android/app/src/main/res/mipmap-${density}`;
  const legacySize = 48 * scale;
  const legacy = await square(legacySize);
  await save(`${directory}/ic_launcher.png`, await shaped(legacy, legacySize, "rounded"));
  await save(`${directory}/ic_launcher_round.png`, await shaped(legacy, legacySize, "circle"));

  // Android adaptive icons use a 108 dp layer with the artwork in its central 72 dp.
  const layerSize = 108 * scale;
  const artworkSize = 72 * scale;
  const foreground = await sharp({ create: { width: layerSize, height: layerSize, channels: 4, background: transparent } })
    .composite([{
      input: await shaped(await square(artworkSize), artworkSize, "rounded"),
      left: 18 * scale,
      top: 18 * scale
    }])
    .png()
    .toBuffer();
  await save(`${directory}/ic_launcher_foreground.png`, foreground);
}

console.log("Generated the app brand mark, 5 web icons and 15 Android launcher icons from the supplied logo.");
