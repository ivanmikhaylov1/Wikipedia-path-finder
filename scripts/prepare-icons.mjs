import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
// Existing authored vector geometry, aligned to the collision palette.
const icon = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#f4f1e8"/><path d="M116 330C170 330 160 140 250 210S340 250 396 174" fill="none" stroke="#123bff" stroke-width="24" stroke-linecap="round"/><g fill="#11110f"><circle cx="116" cy="330" r="32"/><circle cx="396" cy="174" r="32"/></g></svg>\n';
for (const file of ['public/favicon.svg', 'public/icon.svg']) await writeFile(file, icon);
for (const [name, size] of [['apple-touch-icon', 180], ['icon-192', 192], ['icon-512', 512]]) await sharp(Buffer.from(icon)).resize(size, size).png().toFile(`public/${name}.png`);
