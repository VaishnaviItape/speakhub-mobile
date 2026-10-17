const fs = require('fs');
const path = require('path');
const Jimp = require('../node_modules/jimp-compact');

async function main() {
  const imagesDir = path.resolve(__dirname, '../assets/images');
  const backupDir = path.join(imagesDir, 'backup_icons');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const filesToBackup = [
    'playstore_icon_512.png',
    'icon.png',
    'android-icon-foreground.png',
    'android-icon-background.png',
    'favicon.png'
  ];

  for (const file of filesToBackup) {
    const src = path.join(imagesDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(backupDir, file));
      console.log(`Backed up ${file} -> backup_icons/${file}`);
    }
  }

  // Read the original transparent high-res logo
  const logoPath = path.join(imagesDir, 'logo.png');
  const logo = await Jimp.read(logoPath);

  // Compute tight non-transparent bounding box
  let minX = logo.bitmap.width, maxX = 0, minY = logo.bitmap.height, maxY = 0;
  logo.scan(0, 0, logo.bitmap.width, logo.bitmap.height, (x, y, idx) => {
    const alpha = logo.bitmap.data[idx + 3];
    if (alpha > 20) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  });

  const tightWidth = maxX - minX + 1;
  const tightHeight = maxY - minY + 1;
  console.log(`Detected logo tight bounds: (${minX}, ${minY}) ${tightWidth}x${tightHeight}`);

  const tightLogo = logo.clone().crop(minX, minY, tightWidth, tightHeight);

  // Optimal width: 260px (proportional height ~212px)
  // Perfectly fits within Android 66% circle safe-zone (338px diameter) with 0 pixels clipped,
  // and leaves 24.6% padding on all sides for Google Play 20% squircle mask.
  const targetWidth = 260;
  const scaledLogo = tightLogo.clone().resize(targetWidth, Jimp.AUTO, Jimp.RESIZE_BICUBIC);
  const sw = scaledLogo.bitmap.width;
  const sh = scaledLogo.bitmap.height;
  const posX = Math.round((512 - sw) / 2);
  const posY = Math.round((512 - sh) / 2);

  console.log(`Scaled logo: ${sw}x${sh}, Centered at (${posX}, ${posY})`);

  // 1. playstore_icon_512.png (512x512, solid white full-bleed)
  const playstoreIcon = new Jimp(512, 512, 0xFFFFFFFF);
  playstoreIcon.composite(scaledLogo, posX, posY);
  await playstoreIcon.writeAsync(path.join(imagesDir, 'playstore_icon_512.png'));
  console.log('✓ Created playstore_icon_512.png (512x512, solid white background)');

  // 2. icon.png (512x512, solid white background for general/iOS/fallback)
  const appIcon = new Jimp(512, 512, 0xFFFFFFFF);
  appIcon.composite(scaledLogo, posX, posY);
  await appIcon.writeAsync(path.join(imagesDir, 'icon.png'));
  console.log('✓ Created icon.png (512x512, solid white background)');

  // 3. android-icon-foreground.png (512x512, transparent background for Adaptive Icon)
  const androidFg = new Jimp(512, 512, 0x00000000);
  androidFg.composite(scaledLogo, posX, posY);
  await androidFg.writeAsync(path.join(imagesDir, 'android-icon-foreground.png'));
  console.log('✓ Created android-icon-foreground.png (512x512, transparent background, safe-zone centered)');

  // 4. android-icon-background.png (512x512, solid white)
  const androidBg = new Jimp(512, 512, 0xFFFFFFFF);
  await androidBg.writeAsync(path.join(imagesDir, 'android-icon-background.png'));
  console.log('✓ Created android-icon-background.png (512x512, solid white)');

  // 5. favicon.png (512x512, crisp white background)
  const favicon = new Jimp(512, 512, 0xFFFFFFFF);
  favicon.composite(scaledLogo, posX, posY);
  await favicon.writeAsync(path.join(imagesDir, 'favicon.png'));
  console.log('✓ Created favicon.png in mobile (512x512, solid white)');

  // 6. Update speakhub-web favicon.png as well
  const webFaviconPath = path.resolve(__dirname, '../../speakhub-web/public/favicon.png');
  if (fs.existsSync(path.dirname(webFaviconPath))) {
    await favicon.writeAsync(webFaviconPath);
    console.log('✓ Updated speakhub-web/public/favicon.png');
  }

  // Verification
  let cut = 0;
  androidFg.scan(0, 0, 512, 512, (x, y, idx) => {
    if (androidFg.bitmap.data[idx + 3] > 30) {
      const dx = x - 256;
      const dy = y - 256;
      if (Math.hypot(dx, dy) > 169) cut++;
    }
  });
  console.log(`Adaptive icon mask verification: ${cut} cut pixels (should be 0).`);
}

main().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
