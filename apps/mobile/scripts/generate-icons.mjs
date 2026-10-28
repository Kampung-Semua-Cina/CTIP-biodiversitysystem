// apps/mobile/scripts/generate-icons.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../../web/node_modules/@playwright/test/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, '../assets');
const resDir = path.resolve(__dirname, '../android/app/src/main/res');

const svgBody = `
  <!-- scan corners -->
  <g fill="none" stroke="#e9f7c8" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.9">
    <path d="M22 38V28a6 6 0 0 1 6-6h10" />
    <path d="M82 22h10a6 6 0 0 1 6 6v10" />
    <path d="M98 82v10a6 6 0 0 1-6 6H82" />
    <path d="M38 98H28a6 6 0 0 1-6-6V82" />
  </g>
  <!-- leaf -->
  <path d="M 35.217939,86.207523 C 27.950965,54.267092 51.766415,32.067446 85.781931,33.783456 88.065781,67.765569 68.23349,87.931884 35.217939,86.207523 Z" fill="#d6f093" />
  <!-- midrib -->
  <path d="M38 83C52 66 66 52 80 40" fill="none" stroke="#0b3322" stroke-width="2.6" stroke-linecap="round" />
  <!-- circuit veins -->
  <g fill="none" stroke="#0b3322" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">
    <path d="M 50.656076,67.487408 C 47.484414,63.932091 48.348335,54.524379 50.694686,51.201694" />
    <path d="m 60.588801,56.939614 c -2.522038,-3.777843 -2.253682,-9.787875 0.03861,-12.347491" />
    <path d="M 70,48.798738 C 68.376713,47.088022 68.846136,42.774771 70,41.23166" />
    <path d="M 41.672355,77.845125 C 39.182019,74.97119 39.562317,69.676489 40.6864,65.523526" />
    <path d="M 67.950649,68.319647 C 64.395332,71.491309 54.98762,70.627388 51.664935,68.281037" />
    <path d="M 74.082391,57.769161 C 70.304548,60.291199 64.294516,60.022843 61.7349,57.730551" />
    <path d="m 78.142287,49.284603 c -1.710716,1.623287 -6.023967,1.153864 -7.567078,0" />
    <path d="m 55.065118,78.075569 c -2.87393,2.490336 -8.168632,2.110038 -12.321595,0.985955" />
  </g>
`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  async function renderSvgToPng(svgContent, width, height, outputPath, transparent = false) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: ${width}px;
            height: ${height}px;
            overflow: hidden;
            background: ${transparent ? 'transparent' : '#294f33'};
            display: flex;
            align-items: center;
            justify-content: center;
          }
          svg { width: 100%; height: 100%; display: block; }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
      </html>
    `;
    await page.setViewportSize({ width, height });
    await page.setContent(html);
    await page.screenshot({ path: outputPath, omitBackground: transparent });
    console.log(`Generated: ${path.basename(outputPath)} (${width}x${height})`);
  }

  // 1. icon.png (1024x1024 full app icon)
  const iconSvg = `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <rect width="120" height="120" fill="#294f33" />
      ${svgBody}
    </svg>
  `;
  await renderSvgToPng(iconSvg, 1024, 1024, path.join(assetsDir, 'icon.png'), false);

  // 2. splash-icon.png (1024x1024)
  await renderSvgToPng(iconSvg, 1024, 1024, path.join(assetsDir, 'splash-icon.png'), false);

  // 3. android-icon-background.png (512x512 solid #294f33)
  const bgSvg = `
    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" fill="#294f33" />
    </svg>
  `;
  await renderSvgToPng(bgSvg, 512, 512, path.join(assetsDir, 'android-icon-background.png'), false);

  // 4. android-icon-foreground.png (512x512 transparent with safe margin for adaptive icon)
  const fgSvg = `
    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(86, 86) scale(2.83)">
        ${svgBody}
      </g>
    </svg>
  `;
  await renderSvgToPng(fgSvg, 512, 512, path.join(assetsDir, 'android-icon-foreground.png'), true);

  // 5. android-icon-monochrome.png (432x432 white on transparent)
  const monoBody = svgBody
    .replace(/#e9f7c8/g, '#ffffff')
    .replace(/#d6f093/g, '#ffffff')
    .replace(/#0b3322/g, '#294f33');
  const monoSvg = `
    <svg viewBox="0 0 432 432" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(72, 72) scale(2.4)">
        ${monoBody}
      </g>
    </svg>
  `;
  await renderSvgToPng(monoSvg, 432, 432, path.join(assetsDir, 'android-icon-monochrome.png'), true);

  // 6. favicon.png (48x48)
  await renderSvgToPng(iconSvg, 48, 48, path.join(assetsDir, 'favicon.png'), false);

  // 7. Update native Android mipmap files if the folder exists
  if (fs.existsSync(resDir)) {
    const densities = [
      { name: 'mipmap-mdpi', iconSize: 48, adaptiveSize: 108 },
      { name: 'mipmap-hdpi', iconSize: 72, adaptiveSize: 162 },
      { name: 'mipmap-xhdpi', iconSize: 96, adaptiveSize: 216 },
      { name: 'mipmap-xxhdpi', iconSize: 144, adaptiveSize: 324 },
      { name: 'mipmap-xxxhdpi', iconSize: 192, adaptiveSize: 432 },
    ];

    for (const d of densities) {
      const folder = path.join(resDir, d.name);
      if (!fs.existsSync(folder)) continue;

      // Render standard icons and adaptive layers (support both .png and .webp if present)
      await renderSvgToPng(iconSvg, d.iconSize, d.iconSize, path.join(folder, 'ic_launcher.png'), false);
      await renderSvgToPng(iconSvg, d.iconSize, d.iconSize, path.join(folder, 'ic_launcher_round.png'), false);

      const fgAdaptive = `
        <svg viewBox="0 0 ${d.adaptiveSize} ${d.adaptiveSize}" xmlns="http://www.w3.org/2000/svg">
          <g transform="translate(${d.adaptiveSize * 0.168}, ${d.adaptiveSize * 0.168}) scale(${d.adaptiveSize * 0.664 / 120})">
            ${svgBody}
          </g>
        </svg>
      `;
      const bgAdaptive = `
        <svg viewBox="0 0 ${d.adaptiveSize} ${d.adaptiveSize}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${d.adaptiveSize}" height="${d.adaptiveSize}" fill="#294f33" />
        </svg>
      `;
      await renderSvgToPng(fgAdaptive, d.adaptiveSize, d.adaptiveSize, path.join(folder, 'ic_launcher_foreground.png'), true);
      await renderSvgToPng(bgAdaptive, d.adaptiveSize, d.adaptiveSize, path.join(folder, 'ic_launcher_background.png'), false);

      // If existing .webp files are present, replace them with the rendered images
      const files = ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'ic_launcher_background'];
      for (const base of files) {
        const pngPath = path.join(folder, `${base}.png`);
        const webpPath = path.join(folder, `${base}.webp`);
        if (fs.existsSync(webpPath) && fs.existsSync(pngPath)) {
          fs.copyFileSync(pngPath, webpPath);
        }
      }
    }
    console.log('Android native mipmap assets updated!');
  }

  await browser.close();
  console.log('All icons generated successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
