import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildSync } from 'esbuild';
import { appRoot, readJson } from './lib/runtime.mjs';

export const BRAND_SOURCES = ['utils/tazeSystemBrandAssets.ts', 'components/publicSite/publicSiteTheme.ts', 'theme/brandTheme.ts', 'public/manifest.webmanifest', 'font/Peyda-font-face.css'];
export async function loadProductBrand() {
  const product = appRoot();
  const file = source => path.join(product, source).replace(/\\/g, '/');
  const compiled = buildSync({ stdin: { contents: `
    import {TAZE_SYSTEM_BRAND_ASSETS} from ${JSON.stringify(file(BRAND_SOURCES[0]))};
    import {PUBLIC_SITE_THEME,PUBLIC_SITE_CSS_VARS} from ${JSON.stringify(file(BRAND_SOURCES[1]))};
    import {BRAND_PALETTE_PRESETS} from ${JSON.stringify(file(BRAND_SOURCES[2]))};
    export default {assets:TAZE_SYSTEM_BRAND_ASSETS,cssVars:PUBLIC_SITE_CSS_VARS,paletteKey:PUBLIC_SITE_THEME.paletteKey,palette:BRAND_PALETTE_PRESETS[PUBLIC_SITE_THEME.paletteKey].palette};`, resolveDir: product, loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
  const brand = (await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'))).default;
  const manifest = readJson(path.join(product, 'public/manifest.webmanifest'));
  const fontCss = fs.readFileSync(path.join(product, 'font/Peyda-font-face.css'), 'utf8');
  const family = fontCss.match(/font-family:\s*'([^']+)'/)?.[1];
  const fonts = [...fontCss.matchAll(/@font-face\s*\{([^}]+)\}/g)].filter(m => m[1].includes(`font-family: '${family}'`)).map(m => ({
    file: path.resolve(product, 'font', m[1].match(/url\(['"]([^'"]+)['"]\)/)?.[1] || ''),
    weight: Number(m[1].match(/font-weight:\s*(\d+)/)?.[1]) }));
  if (!family || !fonts.some(f => f.weight === 400)) throw new Error('فونت واقعی PublicSite قابل استخراج نیست.');
  const logo = path.resolve(product, 'public', '.' + brand.assets.logo);
  if (!logo.startsWith(path.join(product, 'public') + path.sep) || !fs.existsSync(logo)) throw new Error('لوگوی PublicSite معتبر نیست.');
  const hash = createHash('sha256');
  for (const source of BRAND_SOURCES) hash.update(fs.readFileSync(path.join(product, source)));
  for (const font of fonts) hash.update(fs.readFileSync(font.file));
  hash.update(fs.readFileSync(logo));
  return { ...brand, name: manifest.short_name || manifest.name, fontFamily: family, fonts, logo,
    sources: BRAND_SOURCES, fingerprint: hash.digest('hex'), identitySource: 'PublicSite' };
}
