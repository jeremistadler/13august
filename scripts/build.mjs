import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
// Explicit allowlist: never serve source, credentials, or the local database.
for (const path of ['index.html', 'styles.css', '404.html', 'privacy.html', 'robots.txt', 'image-viewer.js', 'signup.js', 'images', 'wedding']) {
  await cp(path, `dist/${path}`, { recursive: true, filter: source => !source.endsWith('.DS_Store') });
}
