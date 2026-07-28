import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { execSync } from 'child_process';

const ICONS_DIR = path.join(process.cwd(), 'src-tauri', 'icons');
const SVG_PATH = path.join(process.cwd(), 'public', 'favicon.svg');

if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

async function generate() {
  console.log('Generating base PNG from favicon.svg...');
  const svgBuffer = fs.readFileSync(SVG_PATH);

  // Generate a high-res PNG
  const png1024 = await sharp(svgBuffer).resize(1024, 1024).png().toBuffer();
  
  const basePngPath = path.join(ICONS_DIR, 'icon.png');
  fs.writeFileSync(basePngPath, png1024);

  console.log('Running tauri icon generator...');
  try {
    execSync(`npx tauri icon ${basePngPath}`, { stdio: 'inherit' });
    console.log('Successfully generated all icons using Tauri CLI!');
  } catch (err) {
    console.error('Failed to run tauri icon:', err.message);
    process.exit(1);
  }
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
