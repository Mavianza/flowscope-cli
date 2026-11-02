import type { Graph } from './model.js';
export interface Verification {
    valid: boolean;
    errors: string[];
}
/** Membuktikan optimalitas melalui kelayakan aliran dan kesamaan nilai dengan kapasitas cut. */
export declare function verify(graph: Graph, candidate: unknown): Verification;
