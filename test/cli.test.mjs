import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = join(root, 'bin', 'flowscope.mjs');
const example = join(root, 'examples', 'logistik.json');
const scenario = join(root, 'examples', 'tambah-kapasitas.json');
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
  assert.ifError(result.error); return result;
}
function sandbox(t) {
  const path = mkdtempSync(join(tmpdir(), 'flowscope-test-'));
  t.after(() => rmSync(path, { recursive: true, force: true })); return path;
}

test('integrasi solve → laporan → verify baseline dan skenario', t => {
  const temp = sandbox(t), output = join(temp, 'hasil 日本');
  const solved = run(['solve', example, '--scenario', scenario, '--out', output]);
  assert.equal(solved.status, 0, solved.stderr);
  const summary = JSON.parse(solved.stdout);
  assert.equal(summary.value, 23); assert.equal(summary.scenario.value, 26); assert.equal(summary.scenario.change, 3);
  for (const file of ['graph.json', 'result.json', 'report.svg', 'scenario-graph.json', 'scenario-result.json', 'scenario-report.svg', 'comparison.json']) {
    assert.ok(existsSync(join(output, file)), file);
  }
  for (const [graphFile, resultFile] of [['graph.json', 'result.json'], ['scenario-graph.json', 'scenario-result.json']]) {
    const checked = run(['verify', join(output, graphFile), join(output, resultFile)], temp);
    assert.equal(checked.status, 0, checked.stderr); assert.equal(JSON.parse(checked.stdout).valid, true);
  }
  const badGraph = run(['verify', example, join(output, 'scenario-result.json')]);
  assert.equal(badGraph.status, 1); assert.equal(JSON.parse(badGraph.stdout).valid, false);
  assert.ok(readFileSync(join(output, 'report.svg'), 'utf8').includes('Kapasitas distribusi logistik kampus'));
});

test('integrasi sertifikat yang dimanipulasi menghasilkan exit 1', t => {
  const temp = sandbox(t), output = join(temp, 'hasil');
  assert.equal(run(['solve', example, '--out', output]).status, 0);
  const path = join(output, 'result.json'), result = JSON.parse(readFileSync(path, 'utf8'));
  result.value = 999; writeFileSync(path, JSON.stringify(result));
  const checked = run(['verify', example, path]);
  assert.equal(checked.status, 1); assert.equal(JSON.parse(checked.stdout).valid, false);
});

test('integrasi output lama tidak ditimpa atau dihapus', t => {
  const temp = sandbox(t), sentinel = join(temp, 'sentinel.txt');
  writeFileSync(sentinel, 'tetap utuh');
  const result = run(['solve', example, '--out', temp]);
  assert.equal(result.status, 2); assert.match(result.stderr, /sudah ada/);
  assert.equal(readFileSync(sentinel, 'utf8'), 'tetap utuh');
  assert.equal(existsSync(join(temp, 'result.json')), false);
});

test('integrasi JSON rusak tidak membuat direktori output', t => {
  const temp = sandbox(t), bad = join(temp, 'bad.json'), output = join(temp, 'new');
  writeFileSync(bad, '{"version":');
  const result = run(['solve', bad, '--out', output]);
  assert.equal(result.status, 2); assert.match(result.stderr, /JSON tidak valid/); assert.ok(!existsSync(output));
});

test('integrasi skenario rusak tidak menyimpan hasil baseline parsial', t => {
  const temp = sandbox(t), bad = join(temp, 'bad.json'), output = join(temp, 'new');
  writeFileSync(bad, JSON.stringify({ version: 1, capacities: { hilang: 4 } }));
  assert.equal(run(['solve', example, '--scenario', bad, '--out', output]).status, 2);
  assert.ok(!existsSync(output));
});

test('integrasi input melebihi batas dan UTF-8 rusak ditolak', t => {
  const temp = sandbox(t), bad = join(temp, 'bad.json');
  writeFileSync(bad, ' '.repeat(512 * 1024 + 1));
  assert.equal(run(['solve', bad]).status, 2);
  writeFileSync(bad, Buffer.from([0xff, 0xfe, 0x7b]));
  const result = run(['solve', bad]); assert.equal(result.status, 2); assert.match(result.stderr, /UTF-8/);
});

test('integrasi file tidak ditemukan dan direktori ditolak', t => {
  const temp = sandbox(t);
  assert.equal(run(['solve', join(temp, 'missing.json')]).status, 2);
  assert.equal(run(['solve', temp]).status, 2);
});

test('integrasi opsi salah, duplikat, argumen kurang, dan command asing ditolak', () => {
  for (const args of [ ['solve'], ['delete', example], ['solve', example, '--unknown', 'x'],
    ['solve', example, '--out'], ['solve', example, '--out', 'x', '--out', 'y'], ['verify', example],
  ]) assert.equal(run(args).status, 2, JSON.stringify(args));
});

test('integrasi help dan version berjalan tanpa dependensi runtime', () => {
  assert.equal(run(['--help']).status, 0);
  assert.equal(run(['--version']).stdout.trim(), '1.0.0');
  assert.equal(run([]).status, 0);
});
