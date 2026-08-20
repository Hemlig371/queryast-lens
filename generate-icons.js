import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { execSync } from 'child_process';

const ICONS_DIR = path.join(process.cwd(), 'src-tauri', 'icons');
const ASSETS_DIR = path.join(process.cwd(), 'assets');
const SVG_PATH = path.join(process.cwd(), 'public', 'favicon.svg');

if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

async function generate() {
  console.log('Generating base PNG from favicon.svg...');
  const svgBuffer = fs.readFileSync(SVG_PATH);

  // Generate a high-res PNG
  const png1024 = await sharp(svgBuffer).resize(1024, 1024).png().toBuffer();
  
  const basePngPath = path.join(ICONS_DIR, 'icon.png');
  fs.writeFileSync(basePngPath, png1024);

  // Generate Capacitor assets in assets/
  fs.writeFileSync(path.join(ASSETS_DIR, 'icon-only.png'), png1024);
  fs.writeFileSync(path.join(ASSETS_DIR, 'icon-foreground.png'), png1024);
  
  const bgPng = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 } // #0f172a
    }
  }).png().toBuffer();
  fs.writeFileSync(path.join(ASSETS_DIR, 'icon-background.png'), bgPng);

  console.log('Running tauri icon generator...');
  try {
    execSync(`npx tauri icon ${basePngPath}`, { stdio: 'inherit' });
    console.log('Successfully generated all icons using Tauri CLI!');
  } catch (err) {
    console.warn('Tauri icon generation warning:', err.message);
  }
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
