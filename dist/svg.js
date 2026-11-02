function xml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}
function short(value, max) {
    const chars = [...value];
    return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : value;
}
/** SVG statis tanpa skrip, tautan eksternal, atau markup dari masukan. */
export function renderSvg(graph, result) {
    const levels = new Map([[graph.source, 0]]), queue = [graph.source];
    for (let head = 0; head < queue.length; head++) {
        const node = queue[head];
        for (const edge of graph.edges) {
            if (edge.from === node && edge.capacity > 0 && !levels.has(edge.to)) {
                levels.set(edge.to, levels.get(node) + 1);
                queue.push(edge.to);
            }
        }
    }
    let maximum = Math.max(0, ...[...levels.entries()].filter(([id]) => id !== graph.sink).map(([, level]) => level));
    const unreachable = graph.nodes.filter(node => node.id !== graph.sink && !levels.has(node.id));
    if (unreachable.length) {
        maximum++;
        for (const node of unreachable)
            levels.set(node.id, maximum);
    }
    levels.set(graph.sink, maximum + 1);
    const columns = new Map();
    for (const node of graph.nodes) {
        const level = levels.get(node.id);
        if (!columns.has(level))
            columns.set(level, []);
        columns.get(level).push(node.id);
    }
    const ordered = [...columns.keys()].sort((a, b) => a - b);
    const width = Math.max(1120, ordered.length * 190 + 80);
    const diagramHeight = Math.max(310, Math.max(...[...columns.values()].map(ids => ids.length)) * 115);
    const positions = new Map();
    ordered.forEach((level, column) => {
        const ids = columns.get(level);
        ids.forEach((id, row) => positions.set(id, {
            x: 90 + column * (width - 180) / Math.max(1, ordered.length - 1),
            y: 275 + (row + 0.5) * diagramHeight / ids.length,
        }));
    });
    const tableY = 275 + diagramHeight + 80;
    const traceY = tableY + 65 + graph.edges.length * 31;
    const shownTrace = result.trace.slice(0, 12);
    const height = traceY + 85 + Math.max(1, shownTrace.length) * 34 + 70;
    const out = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="report-title report-description">`,
        `<title id="report-title">FlowScope — ${xml(graph.title)}</title>`,
        `<desc id="report-description">Aliran maksimum ${result.value} ${xml(graph.unit)}, kapasitas minimum cut ${result.cut.capacity}. Label sisi menunjukkan aliran per kapasitas.</desc>`,
        `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#64748b"/></marker><marker id="cut-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#c24136"/></marker></defs>`,
        `<style>text{font-family:Arial,DejaVu Sans,sans-serif;fill:#162c43}.mono{font-family:monospace}.small{font-size:13px}.muted{fill:#51677c}.label{font-size:12px;font-weight:bold;paint-order:stroke;stroke:#fff;stroke-width:5px;stroke-linejoin:round}.heading{font-size:20px;font-weight:bold}</style>`,
        `<rect width="${width}" height="${height}" fill="#f3f6fa"/>`,
        `<rect width="${width}" height="105" fill="#112d47"/>`,
        `<text x="36" y="34" style="fill:#91c8ee;font-size:13px;letter-spacing:3px">FLOWSCOPE / LAPORAN KAPASITAS</text>`,
        `<text x="36" y="74" style="fill:white;font-size:25px;font-weight:bold">${xml(short(graph.title, 72))}</text>`,
    ];
    const cards = [
        ['ALIRAN MAKSIMUM', `${result.value}`, graph.unit],
        ['KAPASITAS MINIMUM CUT', `${result.cut.capacity}`, `${result.cut.edgeIds.length} sisi pada cut`],
        ['PROSES EDMONDS–KARP', `${result.trace.length}`, 'augmentasi / sertifikat terverifikasi'],
    ];
    const cardWidth = (width - 96) / 3;
    cards.forEach(([title, amount, subtitle], index) => {
        const x = 32 + index * (cardWidth + 16);
        out.push(`<rect x="${x}" y="123" width="${cardWidth}" height="108" rx="12" fill="white" stroke="#dbe4ef"/>`, `<text x="${x + 18}" y="147" style="font-size:11px;letter-spacing:1px" class="muted">${xml(title)}</text>`, `<text x="${x + 18}" y="183" style="font-size:30px;font-weight:bold">${xml(amount)}</text>`, `<text x="${x + 18}" y="211" class="small muted">${xml(subtitle)}</text>`);
    });
    out.push(`<text x="36" y="263" class="small muted">Panah = arah sisi asli · label = ID: aliran / kapasitas · garis merah = satu minimum cut</text>`);
    const groups = new Map();
    for (const edge of graph.edges) {
        const key = [edge.from, edge.to].sort().join('|');
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(edge.id);
    }
    const flows = new Map(result.flows.map(row => [row.edgeId, row.flow]));
    for (const edge of graph.edges) {
        const a = positions.get(edge.from), b = positions.get(edge.to);
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length;
        const siblings = groups.get([edge.from, edge.to].sort().join('|'));
        // Pisahkan juga label sisi dua arah; lengkungan dibatasi untuk graf padat.
        const spacing = Math.min(200, 640 / Math.max(1, siblings.length - 1));
        const offset = (siblings.indexOf(edge.id) - (siblings.length - 1) / 2) * spacing;
        const sign = edge.from < edge.to ? 1 : -1;
        const control = { x: (a.x + b.x) / 2 - dy * offset * sign, y: (a.y + b.y) / 2 + dx * offset * sign };
        const cut = result.cut.edgeIds.includes(edge.id);
        const start = { x: a.x + dx * 28, y: a.y + dy * 28 }, end = { x: b.x - dx * 32, y: b.y - dy * 32 };
        const label = { x: (start.x + 2 * control.x + end.x) / 4, y: (start.y + 2 * control.y + end.y) / 4 - 8 };
        out.push(`<path d="M${start.x},${start.y} Q${control.x},${control.y} ${end.x},${end.y}" fill="none" stroke="${cut ? '#c24136' : '#64748b'}" stroke-width="${cut ? 3 : 1.8}" ${cut ? 'stroke-dasharray="7 4"' : ''} marker-end="url(#${cut ? 'cut-arrow' : 'arrow'})"><title>${xml(edge.id)}: ${xml(edge.from)} → ${xml(edge.to)}; ${flows.get(edge.id)} / ${edge.capacity}</title></path>`, `<text x="${label.x}" y="${label.y}" text-anchor="middle" class="label">${xml(short(edge.id, 12))}: ${flows.get(edge.id)}/${edge.capacity}</text>`);
    }
    const sourceSide = new Set(result.cut.sourceSide);
    for (const node of graph.nodes) {
        const p = positions.get(node.id);
        const left = sourceSide.has(node.id);
        out.push(`<g><title>${xml(node.id)} — ${xml(node.label)}; sisi cut ${left ? 'S' : 'T'}</title>`, `<circle cx="${p.x}" cy="${p.y}" r="27" fill="${left ? '#d9edff' : '#ffead2'}" stroke="${left ? '#276da8' : '#b6691f'}" stroke-width="2.5"/>`, `<text x="${p.x}" y="${p.y + 5}" text-anchor="middle" style="font-size:13px;font-weight:bold">${xml(short(node.id, 7))}</text>`, `<text x="${p.x}" y="${p.y + 49}" text-anchor="middle" class="small">${xml(short(node.label, 22))}</text>`, `<text x="${p.x}" y="${p.y + 66}" text-anchor="middle" style="font-size:11px" class="muted">${node.id === graph.source ? 'SOURCE' : node.id === graph.sink ? 'SINK' : ''}</text></g>`);
    }
    out.push(`<text x="36" y="${tableY - 23}" class="small muted">Biru: partisi S · jingga: partisi T. Menambah satu sisi cut belum tentu meningkatkan aliran; uji lewat skenario.</text>`, `<text x="36" y="${tableY + 10}" class="heading">Rincian sisi</text>`);
    const columnsX = [36, 260, 470, 655, 795, 925, width - 100];
    ['ID sisi', 'Dari', 'Ke', 'Aliran', 'Kapasitas', 'Sisa', 'Cut'].forEach((label, index) => {
        out.push(`<text x="${columnsX[index]}" y="${tableY + 42}" class="small muted">${label}</text>`);
    });
    graph.edges.forEach((edge, index) => {
        const y = tableY + 67 + index * 31;
        out.push(`<rect x="24" y="${y - 18}" width="${width - 48}" height="30" fill="${index % 2 === 0 ? '#fff' : '#eaf0f7'}"/>`);
        [edge.id, edge.from, edge.to, flows.get(edge.id), edge.capacity, edge.capacity - flows.get(edge.id), result.cut.edgeIds.includes(edge.id) ? 'Ya' : '—'].forEach((value, c) => {
            out.push(`<text x="${columnsX[c]}" y="${y + 2}" class="small mono">${xml(value)}</text>`);
        });
    });
    out.push(`<text x="36" y="${traceY + 24}" class="heading">Jejak augmentasi${result.trace.length > 12 ? ' (12 pertama)' : ''}</text>`, `<text x="36" y="${traceY + 49}" class="small muted">Tanda ← pada ID sisi berarti memakai residual balik. Jejak lengkap tersedia di result.json.</text>`);
    if (!shownTrace.length)
        out.push(`<text x="36" y="${traceY + 83}" class="small">Tidak ada jalur source → sink dengan kapasitas positif; aliran maksimum 0.</text>`);
    shownTrace.forEach((step, i) => {
        const route = step.path.map(arc => `${arc.direction === 'reverse' ? '←' : ''}${arc.edgeId}`).join(' → ');
        out.push(`<text x="36" y="${traceY + 83 + i * 34}" class="small mono">#${step.number}  +${step.delta}  total=${step.valueAfter}  ${xml(short(route, Math.floor((width - 350) / 8)))}</text>`);
    });
    out.push(`<text x="36" y="${height - 28}" class="small muted">FlowScope 1.0.0 · kapasitas bulat · SHA-256 graf: ${result.graphSha256.slice(0, 24)}…</text>`, '</svg>');
    return out.join('\n') + '\n';
}
