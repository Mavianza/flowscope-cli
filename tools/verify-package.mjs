import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Jalankan melalui npm run verify:package.');
const temp = mkdtempSync(join(tmpdir(), 'flowscope-package-'));
function run(command, args, cwd = temp) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}`);
  return result.stdout;
}
try {
  const packed = JSON.parse(run(process.execPath, [npmCli, 'pack', root, '--pack-destination', temp, '--ignore-scripts', '--json']));
  assert.ok(packed[0].files.some(file => file.path === 'dist/solver.js'));
  assert.ok(!packed[0].files.some(file => file.path.includes('node_modules/')));
  const archive = join(temp, packed[0].filename), prefix = join(temp, 'install');
  run(process.execPath, [npmCli, 'install', '--global', '--prefix', prefix, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', archive]);
  const moduleRoot = run(process.execPath, [npmCli, 'root', '--global', '--prefix', prefix]).trim();
  const installed = join(moduleRoot, '@mavianza', 'flowscope-cli');
  const bin = join(installed, 'bin', 'flowscope.mjs'), graph = join(installed, 'examples', 'logistik.json');
  const out = join(temp, 'laporan');
  assert.equal(run(process.execPath, [bin, '--version']).trim(), '1.0.0');
  const result = JSON.parse(run(process.execPath, [bin, 'solve', graph, '--scenario', join(installed, 'examples', 'tambah-kapasitas.json'), '--out', out]));
  assert.equal(result.value, 23); assert.equal(result.scenario.value, 26);
  assert.equal(JSON.parse(run(process.execPath, [bin, 'verify', graph, join(out, 'result.json')])).valid, true);
  assert.ok(readFileSync(join(out, 'report.svg'), 'utf8').includes('<svg '));
  process.stdout.write('Paket npm: pack, instalasi offline tanpa script, CLI di node_modules, solve + scenario + verify LULUS.\n');
} finally { rmSync(temp, { recursive: true, force: true }); }
