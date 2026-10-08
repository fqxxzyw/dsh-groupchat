import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, relative, isAbsolute } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const fail = message => { throw new Error(message); };

try {
  const manifest = JSON.parse(readFileSync(join(root, 'BUILD-MANIFEST.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (pkg.version !== manifest.version) fail('Package version and build manifest do not match. Extract the complete ZIP again.');
  for (const file of manifest.files) {
    const local = resolve(root, file.path), rel = relative(root, local);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) fail('Invalid manifest path.');
    const hash = createHash('sha256').update(readFileSync(local)).digest('hex');
    if (hash !== file.sha256) fail(`File differs from the release: ${file.path}. Extract the complete ZIP again.`);
  }
  console.log(`Package verified: ${pkg.version}`);
  console.log(`Plugin directory: ${root}`);
  const args = process.argv.slice(2);
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--url') fail('Usage: node scripts/verify-install.mjs [--url http://127.0.0.1:PORT]');
    const url = new URL(args[1]);
    if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) fail('Use the explicit local DSH HTTP URL, without credentials.');
    const response = await fetch(new URL('/groupchat/state', url), { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) fail(`DSH returned HTTP ${response.status}. Check the DSH URL and plugin activation.`);
    const { host } = await response.json();
    if (!host?.version) fail('The running host does not identify its version. An older host or a different plugin copy is serving this page.');
    console.log(`Running host: ${host.version}`);
    console.log(`Loaded file: ${host.sourceFile ?? 'unknown'}`);
    console.log(`Host started: ${host.startedAt ?? 'unknown'}`);
    if (host.version !== pkg.version) fail('Client/package and running host versions differ. Register the displayed plugin directory, exit DSH completely, then restart.');
    const expected = manifest.files.find(file => file.path === 'lib/index.js')?.sha256;
    if (!expected || host.sourceHash !== expected) fail('The running host code differs from this release, or its hash could not be verified. Check the loaded file path.');
    console.log('Running host matches the verified package.');
  } else {
    console.log('This checks the extracted files. After restarting DSH, also confirm both client and host versions in the group-chat toolbar.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
