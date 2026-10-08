import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
try {
  execFileSync('python3', ['scripts/refresh_verified.py', '--output', 'data/latest.json'], {cwd:root,stdio:'inherit'});
} catch (error) {
  console.error('Source verification failed; the previous published dataset is preserved.');
  process.exitCode=error.status||1;
}
