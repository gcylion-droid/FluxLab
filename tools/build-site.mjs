import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const name of ['index.html', 'style.css', 'favicon.svg', 'fluxlab-standalone.html',
  'README.md', 'LICENSE', 'src', 'docs', 'examples']) {
  cpSync(resolve(root, name), resolve(output, name), { recursive: true });
}
writeFileSync(resolve(output, '.nojekyll'), '');
console.log(`Static site assembled in ${output}`);
