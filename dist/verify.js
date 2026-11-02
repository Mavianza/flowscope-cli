import { graphDigest, object } from './model.js';
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
function integer(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function list(value, context) { assert(Array.isArray(value), `${context} harus array.`); return value; }
/** Membuktikan optimalitas melalui kelayakan aliran dan kesamaan nilai dengan kapasitas cut. */
export function verify(graph, candidate) {
    try {
        const result = object(candidate, 'Hasil');
        assert(result.schemaVersion === 1 && result.algorithm === 'edmonds-karp', 'Format hasil tidak didukung.');
        assert(result.graphSha256 === graphDigest(graph), 'SHA-256 graf berbeda dari sertifikat.');
        assert(integer(result.value), 'Nilai aliran harus bilangan bulat nonnegatif.');
        const nodes = new Set(graph.nodes.map(node => node.id));
        const edges = new Map(graph.edges.map(edge => [edge.id, edge]));
        const balances = new Map(graph.nodes.map(node => [node.id, 0]));
        const flowRows = list(result.flows, 'flows');
        assert(flowRows.length === edges.size, 'Jumlah entri aliran tidak sama dengan jumlah sisi.');
        const flows = new Map();
        for (const item of flowRows) {
            const row = object(item, 'Entri aliran');
            assert(typeof row.edgeId === 'string' && edges.has(row.edgeId), 'ID sisi aliran tidak dikenal.');
            assert(!flows.has(row.edgeId), `Entri aliran duplikat: ${row.edgeId}.`);
            const edge = edges.get(row.edgeId);
            assert(integer(row.flow) && row.flow <= edge.capacity, `Aliran ${row.edgeId} melanggar batas kapasitas.`);
            flows.set(row.edgeId, row.flow);
            balances.set(edge.from, balances.get(edge.from) - row.flow);
            balances.set(edge.to, balances.get(edge.to) + row.flow);
        }
        for (const [node, balance] of balances) {
            const expected = node === graph.source ? -result.value : node === graph.sink ? result.value : 0;
            assert(balance === expected, `Konservasi aliran tidak terpenuhi di ${node}.`);
        }
        const cut = object(result.cut, 'cut');
        const left = list(cut.sourceSide, 'sourceSide'), right = list(cut.sinkSide, 'sinkSide');
        const partition = [...left, ...right];
        assert(partition.length === nodes.size && new Set(partition).size === nodes.size &&
            partition.every(node => typeof node === 'string' && nodes.has(node)), 'Partisi cut harus memuat setiap simpul tepat sekali.');
        assert(left.includes(graph.source) && right.includes(graph.sink), 'source dan sink harus berada pada sisi cut yang berbeda.');
        const cutEdges = graph.edges.filter(edge => left.includes(edge.from) && right.includes(edge.to));
        const edgeIds = list(cut.edgeIds, 'cut.edgeIds');
        assert(edgeIds.length === cutEdges.length && new Set(edgeIds).size === edgeIds.length &&
            cutEdges.every(edge => edgeIds.includes(edge.id)), 'Daftar sisi cut tidak sesuai partisi.');
        const amount = cutEdges.reduce((sum, edge) => sum + edge.capacity, 0);
        assert(integer(cut.capacity) && cut.capacity === amount && amount === result.value, 'Kapasitas cut tidak sama dengan nilai aliran.');
        // Replay jejak tanpa memanggil solver; setiap langkah harus jalur residual yang sah.
        const trace = list(result.trace, 'trace');
        assert(trace.length <= 100_000, 'Jejak augmentasi terlalu panjang.');
        const replay = new Map(graph.edges.map(edge => [edge.id, 0]));
        let total = 0;
        for (const [index, item] of trace.entries()) {
            const step = object(item, `Augmentasi ${index + 1}`);
            assert(step.number === index + 1 && integer(step.delta) && step.delta > 0, 'Nomor/delta augmentasi tidak valid.');
            const path = list(step.path, 'path');
            assert(path.length > 0 && path.length < nodes.size, 'Panjang jalur augmentasi tidak valid.');
            let current = graph.source;
            const visited = new Set([current]);
            for (const part of path) {
                const arc = object(part, 'Langkah jalur');
                assert(typeof arc.edgeId === 'string' && edges.has(arc.edgeId), 'Sisi jalur tidak dikenal.');
                const edge = edges.get(arc.edgeId);
                assert(arc.direction === 'forward' || arc.direction === 'reverse', 'Arah residual tidak valid.');
                const forward = arc.direction === 'forward';
                const from = forward ? edge.from : edge.to, to = forward ? edge.to : edge.from;
                assert(arc.from === from && arc.to === to && from === current && !visited.has(to), 'Jalur augmentasi terputus atau berulang.');
                const old = replay.get(edge.id);
                assert((forward ? edge.capacity - old : old) >= step.delta, 'Delta melampaui kapasitas residual.');
                replay.set(edge.id, old + (forward ? step.delta : -step.delta));
                visited.add(to);
                current = to;
            }
            assert(current === graph.sink, 'Jalur augmentasi tidak berakhir di sink.');
            total += step.delta;
            assert(step.valueAfter === total, 'Akumulasi augmentasi tidak sesuai.');
        }
        assert(total === result.value && graph.edges.every(edge => replay.get(edge.id) === flows.get(edge.id)), 'Jejak tidak menghasilkan aliran akhir yang diklaim.');
        return { valid: true, errors: [] };
    }
    catch (error) {
        return { valid: false, errors: [error instanceof Error ? error.message : 'Sertifikat tidak valid.'] };
    }
}
