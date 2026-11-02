import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ROOT, appRoot } from './lib/runtime.mjs';
import { loadProductBrand } from './product-brand.mjs';

export async function startFixtureServer(port = 5198) {
  const product = appRoot();
  if (!fs.existsSync(path.join(product, 'pages/Settings/ConnectionsTab.tsx'))) throw new Error('مسیر سورس تازه‌سیستم معتبر نیست.');
  const productRequire = createRequire(path.join(product, 'package.json'));
  const tailwind = productRequire('tailwindcss');
  const autoprefixer = productRequire('autoprefixer');
  const tailwindConfig = (await import(pathToFileURL(path.join(product, 'tailwind.config.js')).href)).default;
  const brand = await loadProductBrand();
  const server = await createServer({
    configFile: false, root: path.join(ROOT, 'fixture'), envDir: false, cacheDir: path.join(ROOT, '.cache/vite'),
    plugins: [{ name: 'tutorial-product-brand', resolveId(id) { if (id === 'virtual:tutorial-brand') return '\0tutorial-brand'; },
      load(id) { if (id === '\0tutorial-brand') return `export default ${JSON.stringify({ name: brand.name, cssVars: brand.cssVars, palette: brand.palette, fontFamily: brand.fontFamily, logo: '/@fs/' + brand.logo.replace(/\\/g, '/') })}`; } }, react()],
    css: { postcss: { plugins: [tailwind({ ...tailwindConfig, content: tailwindConfig.content.map(p => path.resolve(product, p).replace(/\\/g, '/')) }), autoprefixer()] } },
    resolve: { alias: { '@product': product }, dedupe: ['react', 'react-dom'] },
    define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://tutorial.invalid'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('tutorial-fixture-public-key'),
      'import.meta.env.VITE_FILE_STORAGE_URL': JSON.stringify(''), 'import.meta.env.VITE_FILE_STORAGE_ANON_KEY': JSON.stringify('') },
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false, fs: { allow: [ROOT, product] } },
  });
  server.middlewares.use('/tutorial-product-logo', (_req, res) => { res.setHeader('Content-Type', 'image/webp'); fs.createReadStream(brand.logo).pipe(res); });
  // Assets stay in the product checkout; no copies or writes there.
  server.middlewares.use('/assets', (req, res, next) => {
    const base = path.join(product, 'public/assets');
    const file = path.resolve(base, '.' + decodeURIComponent((req.url || '/').split('?')[0]));
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
    res.setHeader('Content-Type', file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await server.listen();
  return { server, url: `http://127.0.0.1:${port}` };
}
