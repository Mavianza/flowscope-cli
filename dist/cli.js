import { InputError, parseGraph, applyScenario } from './model.js';
import { solve } from './solver.js';
import { verify } from './verify.js';
import { renderSvg } from './svg.js';
import { readJson, writeBundle } from './io.js';
const HELP = `FlowScope 1.0.0 — aliran maksimum, minimum cut, dan skenario kapasitas

Pemakaian:
  flowscope solve GRAF.json [--scenario SKENARIO.json] [--out DIREKTORI_BARU]
  flowscope verify GRAF.json HASIL.json
  flowscope --help
  flowscope --version

Contoh tanpa instalasi:
  node bin/flowscope.mjs solve examples/logistik.json --out hasil
  node bin/flowscope.mjs verify examples/logistik.json hasil/result.json

Output solve: ringkasan JSON ke stdout. --out menyimpan graf normalisasi,
sertifikat JSON, dan laporan SVG; direktori yang sudah ada selalu ditolak.
Dengan --scenario, laporan dasar dan laporan skenario disimpan terpisah.
Exit: 0 berhasil, 1 sertifikat tidak valid, 2 input/IO bermasalah.
`;
function pretty(value) { return JSON.stringify(value, null, 2) + '\n'; }
export async function main(args) {
    try {
        if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) {
            process.stdout.write(HELP);
            return 0;
        }
        if (args.length === 1 && args[0] === '--version') {
            process.stdout.write('1.0.0\n');
            return 0;
        }
        const command = args[0];
        if (command === 'verify') {
            if (args.length !== 3 || args.slice(1).some(arg => arg.startsWith('--')))
                throw new InputError('Gunakan verify GRAF.json HASIL.json.');
            const graph = parseGraph(await readJson(args[1]));
            const result = verify(graph, await readJson(args[2], 16 * 1024 * 1024));
            process.stdout.write(pretty(result));
            return result.valid ? 0 : 1;
        }
        if (command !== 'solve' || !args[1] || args[1].startsWith('--'))
            throw new InputError('Gunakan solve GRAF.json. Lihat --help.');
        const options = new Map();
        for (let i = 2; i < args.length; i += 2) {
            const option = args[i];
            if (!['--out', '--scenario'].includes(option) || options.has(option) || !args[i + 1] || args[i + 1].startsWith('--')) {
                throw new InputError(`Opsi tidak valid atau duplikat: ${option}.`);
            }
            options.set(option, args[i + 1]);
        }
        const graph = parseGraph(await readJson(args[1]));
        const baseline = solve(graph);
        const certificate = verify(graph, baseline);
        if (!certificate.valid)
            throw new Error(`Verifikasi internal gagal: ${certificate.errors.join('; ')}`);
        const files = {
            'graph.json': pretty(graph), 'result.json': pretty(baseline), 'report.svg': renderSvg(graph, baseline),
        };
        const summary = {
            title: graph.title, unit: graph.unit, value: baseline.value, cutCapacity: baseline.cut.capacity,
            cutEdges: baseline.cut.edgeIds, augmentations: baseline.trace.length, certificateValid: true,
        };
        const scenarioPath = options.get('--scenario');
        if (scenarioPath) {
            const changed = applyScenario(graph, await readJson(scenarioPath));
            const result = solve(changed), checked = verify(changed, result);
            if (!checked.valid)
                throw new Error(`Verifikasi skenario gagal: ${checked.errors.join('; ')}`);
            const difference = result.value - baseline.value;
            summary.scenario = {
                value: result.value, change: difference, cutCapacity: result.cut.capacity,
                cutEdges: result.cut.edgeIds, certificateValid: true,
            };
            files['scenario-graph.json'] = pretty(changed);
            files['scenario-result.json'] = pretty(result);
            files['scenario-report.svg'] = renderSvg(changed, result);
            files['comparison.json'] = pretty({ baseline: baseline.value, scenario: result.value, change: difference, unit: graph.unit });
        }
        const output = options.get('--out');
        if (output)
            summary.output = await writeBundle(output, files);
        process.stdout.write(pretty(summary));
        return 0;
    }
    catch (error) {
        const code = error?.code;
        const message = code === 'EEXIST' ? 'Direktori output sudah ada. Pilih nama baru.' :
            code === 'ENOENT' ? 'Berkas input atau direktori induk output tidak ditemukan.' :
                code === 'EACCES' || code === 'EPERM' ? 'Tidak mempunyai izin membaca/menulis lokasi tersebut.' :
                    error instanceof Error ? error.message : 'Kesalahan yang tidak dikenal.';
        process.stderr.write(`FlowScope: ${message}\n`);
        return 2;
    }
}
