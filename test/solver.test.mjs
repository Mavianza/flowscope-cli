import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGraph, applyScenario, solve, verify, renderSvg } from '../dist/index.js';

const example = () => parseGraph(JSON.parse(readFileSync(new URL('../examples/logistik.json', import.meta.url), 'utf8')));
function graph(ids, entries) {
  return parseGraph({ version: 1, source: ids[0], sink: ids.at(-1), nodes: ids.map(id => ({ id })),
    edges: entries.map(([from, to, capacity], i) => ({ id: `e${i}`, from, to, capacity })) });
}

test('jaringan contoh: max-flow = min-cut = 23 dan input tidak berubah', () => {
  const input = example(), before = JSON.stringify(input), result = solve(input);
  assert.equal(result.value, 23);
  assert.equal(result.cut.capacity, 23);
  assert.deepEqual(result.cut.edgeIds, ['AC', 'DC', 'DT']);
  assert.deepEqual(verify(input, result), { valid: true, errors: [] });
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(solve(input), result);
});

test('skenario kapasitas menghitung ulang: kapasitas +6, aliran hanya +3', () => {
  const input = example(), changed = applyScenario(input, { version: 1, capacities: { DT: 10 } });
  assert.equal(solve(changed).value, 26);
  assert.equal(solve(input).value, 23);
  assert.deepEqual(solve(changed).cut.edgeIds, ['AC', 'BD']);
  assert.equal(verify(changed, solve(changed)).valid, true);
});

test('penurunan kapasitas skenario dapat menurunkan nilai maksimum', () => {
  const changed = applyScenario(example(), { version: 1, capacities: { CT: 0 } });
  assert.equal(solve(changed).value, 4);
});

test('sisi residual balik benar-benar membatalkan alokasi awal', () => {
  const input = graph(['S', 'A', 'B', 'C', 'D', 'T'], [
    ['S', 'A', 1], ['S', 'B', 1], ['A', 'C', 1], ['A', 'D', 1], ['B', 'C', 1], ['C', 'T', 1], ['D', 'T', 1],
  ]);
  const result = solve(input);
  assert.equal(result.value, 2);
  assert.equal(result.trace.length, 2);
  assert.ok(result.trace[1].path.some(arc => arc.direction === 'reverse' && arc.edgeId === 'e2'));
  assert.equal(result.flows.find(row => row.edgeId === 'e2').flow, 0);
  assert.equal(verify(input, result).valid, true);
});

test('sisi paralel dan antiparalel tidak menyatu pada residual', () => {
  const input = graph(['S', 'A', 'T'], [['S', 'A', 3], ['S', 'A', 5], ['A', 'S', 9], ['A', 'T', 7], ['T', 'A', 10]]);
  const result = solve(input);
  assert.equal(result.value, 7);
  assert.equal(result.flows.length, 5);
  assert.equal(verify(input, result).valid, true);
});

test('sisi masuk source dan keluar sink tetap memenuhi konservasi neto', () => {
  const input = graph(['S', 'A', 'T'], [['A', 'S', 20], ['T', 'A', 20], ['S', 'A', 4], ['A', 'T', 3]]);
  assert.equal(solve(input).value, 3);
  assert.equal(verify(input, solve(input)).valid, true);
});

for (const [name, input] of [
  ['tanpa sisi', graph(['S', 'T'], [])],
  ['kapasitas nol', graph(['S', 'T'], [['S', 'T', 0]])],
  ['sink terputus', graph(['S', 'A', 'T'], [['S', 'A', 10]])],
]) test(`${name}: hasil nol tetap mempunyai sertifikat sah`, () => {
  const result = solve(input);
  assert.equal(result.value, 0); assert.deepEqual(result.trace, []);
  assert.equal(verify(input, result).valid, true);
  assert.match(renderSvg(input, result), /aliran maksimum 0/);
});

test('kapasitas maksimum tetap bilangan bulat aman', () => {
  const input = graph(['S', 'T'], Array.from({ length: 160 }, () => ['S', 'T', 1_000_000_000]));
  const result = solve(input);
  assert.equal(result.value, 160_000_000_000);
  assert.equal(verify(input, result).valid, true);
});

test('400 graf acak cocok dengan oracle enumerasi SEMUA cut', () => {
  let seed = 0x4f1a2b3c;
  const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  for (let sample = 0; sample < 400; sample++) {
    const size = 2 + random(6), ids = Array.from({ length: size }, (_, i) => `N${i}`), entries = [];
    for (let i = 0; i < size * 3; i++) {
      const from = random(size), to = random(size);
      if (from !== to) entries.push([ids[from], ids[to], random(15)]);
    }
    const input = graph(ids, entries);
    let minimum = Infinity;
    for (let mask = 0; mask < 2 ** (size - 2); mask++) {
      const left = new Set([ids[0]]);
      for (let i = 1; i < size - 1; i++) if (mask & (1 << (i - 1))) left.add(ids[i]);
      minimum = Math.min(minimum, input.edges.reduce((sum, edge) => sum +
        (left.has(edge.from) && !left.has(edge.to) ? edge.capacity : 0), 0));
    }
    const result = solve(input);
    assert.equal(result.value, minimum, `Kasus ${sample}: ${JSON.stringify(input)}`);
    assert.equal(verify(input, result).valid, true, `Sertifikat kasus ${sample}`);
  }
});

const invalidInputs = [
  ['versi', raw => { raw.version = 2; }],
  ['source sama sink', raw => { raw.source = raw.sink; }],
  ['simpul duplikat', raw => { raw.nodes.push(raw.nodes[0]); }],
  ['sisi duplikat', raw => { raw.edges.push(raw.edges[0]); }],
  ['ID ilegal', raw => { raw.nodes[0].id = '../S'; }],
  ['referensi hilang', raw => { raw.edges[0].to = 'Missing'; }],
  ['self-loop', raw => { raw.edges[0].to = raw.edges[0].from; }],
  ['kapasitas negatif', raw => { raw.edges[0].capacity = -1; }],
  ['kapasitas pecahan', raw => { raw.edges[0].capacity = 2.5; }],
  ['kapasitas string', raw => { raw.edges[0].capacity = '10'; }],
  ['kapasitas terlalu besar', raw => { raw.edges[0].capacity = 1_000_000_001; }],
  ['properti salah ketik', raw => { raw.edegs = []; }],
  ['karakter kontrol', raw => { raw.title = 'baris\nbaru'; }],
  ['Unicode surrogate tidak valid', raw => { raw.nodes[0].label = '\ud800'; }],
  ['jumlah simpul', raw => { raw.nodes = Array.from({ length: 33 }, (_, i) => ({ id: `N${i}` })); }],
  ['jumlah sisi', raw => { raw.edges = Array(161).fill(raw.edges[0]); }],
];
for (const [name, mutate] of invalidInputs) test(`validasi menolak ${name}`, () => {
  const input = structuredClone(example()); mutate(input);
  assert.throws(() => parseGraph(input));
});

test('skenario menolak sisi asing, kosong, negatif, dan properti tidak dikenal', () => {
  for (const value of [
    { version: 1, capacities: { asing: 2 } }, { version: 1, capacities: {} },
    { version: 1, capacities: { DT: -1 } }, { version: 1, capacities: { DT: 4 }, other: true },
  ]) assert.throws(() => applyScenario(example(), value));
});

const tamperCases = [
  ['nilai', result => { result.value++; }],
  ['digest', result => { result.graphSha256 = '0'.repeat(64); }],
  ['flow melampaui kapasitas', result => { result.flows[0].flow = 100; }],
  ['flow negatif', result => { result.flows[0].flow = -1; }],
  ['konservasi', result => { result.flows[0].flow--; }],
  ['sisi aliran duplikat', result => { result.flows[1] = result.flows[0]; }],
  ['partisi cut', result => { result.cut.sourceSide.push(result.cut.sinkSide[0]); }],
  ['kapasitas cut', result => { result.cut.capacity++; }],
  ['daftar sisi cut', result => { result.cut.edgeIds = []; }],
  ['trace hilang', result => { result.trace = []; }],
  ['trace delta', result => { result.trace[0].delta++; }],
  ['trace arah', result => { result.trace[0].path[0].direction = 'reverse'; }],
  ['trace simpul', result => { result.trace[0].path[0].to = 'T'; }],
  ['trace akumulasi', result => { result.trace[0].valueAfter++; }],
];
for (const [name, mutate] of tamperCases) test(`verifier independen menolak manipulasi ${name}`, () => {
  const input = example(), result = solve(input); mutate(result);
  const checked = verify(input, result);
  assert.equal(checked.valid, false); assert.ok(checked.errors[0]);
});

test('verifier aman terhadap jenis data hasil yang salah', () => {
  for (const value of [null, [], {}, 42, { schemaVersion: 1, algorithm: 'edmonds-karp' }]) {
    assert.equal(verify(example(), value).valid, false);
  }
});

test('laporan SVG meng-escape semua label dan tidak menyertakan skrip', () => {
  const input = example();
  input.title = '<script>alert("x")</script> & laporan';
  input.nodes[0].label = '<img onerror="x">';
  const svg = renderSvg(input, solve(input));
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('&lt;img onerror=&quot;x&quot;&gt;'));
  assert.ok(!svg.includes('<script>') && !svg.includes('<img '));
  assert.ok(!svg.includes('href=') && !svg.includes('<foreignObject'));
  assert.match(svg, /^<\?xml/); assert.match(svg, /<\/svg>\n$/);
});
