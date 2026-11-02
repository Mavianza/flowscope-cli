import { createHash } from 'node:crypto';
export class InputError extends Error {
    constructor(message) { super(message); this.name = 'InputError'; }
}
export function object(value, context) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new InputError(`${context} harus berupa objek.`);
    }
    return value;
}
function keys(value, allowed, context) {
    const extra = Object.keys(value).filter(key => !allowed.includes(key));
    if (extra.length)
        throw new InputError(`${context}: properti tidak dikenal: ${extra.join(', ')}.`);
}
function text(value, context, maximum) {
    if (typeof value !== 'string' || !value.trim() || value.length > maximum ||
        /[\u0000-\u001f\u007f-\u009f]/u.test(value) ||
        [...value].some(c => { const code = c.codePointAt(0); return code >= 0xd800 && code <= 0xdfff; })) {
        throw new InputError(`${context} harus teks 1–${maximum} karakter tanpa karakter kontrol.`);
    }
    return value;
}
function id(value, context) {
    if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(value)) {
        throw new InputError(`${context}: ID harus diawali huruf, maksimal 32 karakter (huruf, angka, _ atau -).`);
    }
    return value;
}
export function capacity(value, context) {
    if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 0 || value > 1_000_000_000) {
        throw new InputError(`${context} harus bilangan bulat antara 0 dan 1000000000.`);
    }
    return value;
}
export function parseGraph(value) {
    const raw = object(value, 'Graf');
    keys(raw, ['version', 'title', 'unit', 'source', 'sink', 'nodes', 'edges'], 'Graf');
    if (raw.version !== 1)
        throw new InputError('version graf harus 1.');
    if (!Array.isArray(raw.nodes) || raw.nodes.length < 2 || raw.nodes.length > 32) {
        throw new InputError('Graf harus memiliki 2–32 simpul.');
    }
    if (!Array.isArray(raw.edges) || raw.edges.length > 160) {
        throw new InputError('edges harus berupa array dengan maksimal 160 sisi.');
    }
    const nodeIds = new Set();
    const nodes = raw.nodes.map((item, index) => {
        const node = object(item, `nodes[${index}]`);
        keys(node, ['id', 'label'], `nodes[${index}]`);
        const nodeId = id(node.id, `nodes[${index}].id`);
        if (nodeIds.has(nodeId))
            throw new InputError(`ID simpul duplikat: ${nodeId}.`);
        nodeIds.add(nodeId);
        return { id: nodeId, label: text(node.label ?? nodeId, `Label ${nodeId}`, 60) };
    });
    const edgeIds = new Set();
    const edges = raw.edges.map((item, index) => {
        const edge = object(item, `edges[${index}]`);
        keys(edge, ['id', 'from', 'to', 'capacity'], `edges[${index}]`);
        const edgeId = id(edge.id, `edges[${index}].id`);
        if (edgeIds.has(edgeId))
            throw new InputError(`ID sisi duplikat: ${edgeId}.`);
        edgeIds.add(edgeId);
        const from = id(edge.from, `Asal ${edgeId}`), to = id(edge.to, `Tujuan ${edgeId}`);
        if (!nodeIds.has(from) || !nodeIds.has(to))
            throw new InputError(`Sisi ${edgeId} merujuk simpul yang tidak ada.`);
        if (from === to)
            throw new InputError(`Self-loop tidak didukung: ${edgeId}.`);
        return { id: edgeId, from, to, capacity: capacity(edge.capacity, `Kapasitas ${edgeId}`) };
    });
    const source = id(raw.source, 'source'), sink = id(raw.sink, 'sink');
    if (source === sink || !nodeIds.has(source) || !nodeIds.has(sink)) {
        throw new InputError('source dan sink harus berbeda serta terdapat di nodes.');
    }
    return {
        version: 1, title: text(raw.title ?? 'Analisis jaringan', 'title', 100),
        unit: text(raw.unit ?? 'unit', 'unit', 20), source, sink, nodes, edges,
    };
}
export function graphDigest(graph) {
    return createHash('sha256').update(JSON.stringify(graph)).digest('hex');
}
export function applyScenario(graph, value) {
    const raw = object(value, 'Skenario');
    keys(raw, ['version', 'capacities'], 'Skenario');
    if (raw.version !== 1)
        throw new InputError('version skenario harus 1.');
    const overrides = object(raw.capacities, 'capacities skenario');
    if (!Object.keys(overrides).length)
        throw new InputError('Skenario harus mengubah minimal satu kapasitas.');
    const known = new Set(graph.edges.map(edge => edge.id));
    for (const [edgeId, amount] of Object.entries(overrides)) {
        if (!known.has(edgeId))
            throw new InputError(`Sisi skenario tidak dikenal: ${edgeId}.`);
        capacity(amount, `Kapasitas skenario ${edgeId}`);
    }
    return parseGraph({ ...graph, edges: graph.edges.map(edge => ({ ...edge,
            capacity: Object.hasOwn(overrides, edge.id) ? overrides[edge.id] : edge.capacity,
        })) });
}
