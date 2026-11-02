import type { FlowResult, Graph } from './model.js';
/** Edmonds–Karp: setiap sisi asli mendapat pasangan residual sendiri. */
export declare function solve(graph: Graph): FlowResult;
