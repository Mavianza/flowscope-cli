import { graphDigest } from './model.js';
/** Edmonds–Karp: setiap sisi asli mendapat pasangan residual sendiri. */
export function solve(graph) {
    const index = new Map(graph.nodes.map((node, i) => [node.id, i]));
    const residual = graph.nodes.map(() => []);
    const flows = graph.edges.map(() => 0);
    graph.edges.forEach((edge, i) => {
        const u = index.get(edge.from), v = index.get(edge.to);
        const forward = { to: v, reverse: residual[v].length, remaining: edge.capacity, edge: i, direction: 1 };
        const backward = { to: u, reverse: residual[u].length, remaining: 0, edge: i, direction: -1 };
        residual[u].push(forward);
        residual[v].push(backward);
    });
    const source = index.get(graph.source), sink = index.get(graph.sink);
    const trace = [];
    let value = 0;
    while (true) {
        const parents = Array(graph.nodes.length);
        const visited = new Set([source]), queue = [source];
        for (let head = 0; head < queue.length && !visited.has(sink); head++) {
            const u = queue[head];
            for (let a = 0; a < residual[u].length; a++) {
                const arc = residual[u][a];
                if (arc.remaining <= 0 || visited.has(arc.to))
                    continue;
                visited.add(arc.to);
                parents[arc.to] = { from: u, arc: a };
                queue.push(arc.to);
                if (arc.to === sink)
                    break;
            }
        }
        if (!visited.has(sink)) {
            const sourceSide = graph.nodes.filter((_, i) => visited.has(i)).map(node => node.id);
            const sinkSide = graph.nodes.filter((_, i) => !visited.has(i)).map(node => node.id);
            const left = new Set(sourceSide);
            const cutEdges = graph.edges.filter(edge => left.has(edge.from) && !left.has(edge.to));
            return {
                schemaVersion: 1, algorithm: 'edmonds-karp', graphSha256: graphDigest(graph), value,
                flows: graph.edges.map((edge, i) => ({ edgeId: edge.id, flow: flows[i] })),
                cut: { sourceSide, sinkSide, edgeIds: cutEdges.map(edge => edge.id),
                    capacity: cutEdges.reduce((sum, edge) => sum + edge.capacity, 0) }, trace,
            };
        }
        const route = [];
        let delta = Infinity;
        for (let v = sink; v !== source;) {
            const parent = parents[v];
            const arc = residual[parent.from][parent.arc];
            route.push({ from: parent.from, arc });
            delta = Math.min(delta, arc.remaining);
            v = parent.from;
        }
        route.reverse();
        const path = route.map(({ from, arc }) => ({
            edgeId: graph.edges[arc.edge].id, from: graph.nodes[from].id, to: graph.nodes[arc.to].id,
            direction: arc.direction === 1 ? 'forward' : 'reverse',
        }));
        for (const { from, arc } of route) {
            arc.remaining -= delta;
            const backward = residual[arc.to][arc.reverse];
            if (backward.to !== from)
                throw new Error('Pasangan residual tidak konsisten.');
            backward.remaining += delta;
            flows[arc.edge] = flows[arc.edge] + arc.direction * delta;
        }
        value += delta;
        trace.push({ number: trace.length + 1, delta, valueAfter: value, path });
    }
}
