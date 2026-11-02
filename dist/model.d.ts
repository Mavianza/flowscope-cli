export declare class InputError extends Error {
    constructor(message: string);
}
export interface Vertex {
    id: string;
    label: string;
}
export interface Edge {
    id: string;
    from: string;
    to: string;
    capacity: number;
}
export interface Graph {
    version: 1;
    title: string;
    unit: string;
    source: string;
    sink: string;
    nodes: Vertex[];
    edges: Edge[];
}
export interface PathStep {
    edgeId: string;
    from: string;
    to: string;
    direction: 'forward' | 'reverse';
}
export interface Augmentation {
    number: number;
    delta: number;
    valueAfter: number;
    path: PathStep[];
}
export interface FlowResult {
    schemaVersion: 1;
    algorithm: 'edmonds-karp';
    graphSha256: string;
    value: number;
    flows: {
        edgeId: string;
        flow: number;
    }[];
    cut: {
        sourceSide: string[];
        sinkSide: string[];
        edgeIds: string[];
        capacity: number;
    };
    trace: Augmentation[];
}
export declare function object(value: unknown, context: string): Record<string, unknown>;
export declare function capacity(value: unknown, context: string): number;
export declare function parseGraph(value: unknown): Graph;
export declare function graphDigest(graph: Graph): string;
export declare function applyScenario(graph: Graph, value: unknown): Graph;
