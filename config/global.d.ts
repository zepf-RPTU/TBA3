/**
 * Ambient types: Vite's `import.meta.env`, and d3's type namespace.
 *
 * Every runtime use of d3 is an explicit `import * as d3 from 'd3'`. The reference
 * below is for files that only name d3 types in JSDoc (`@type {d3.Selection<...>}`)
 * without importing the value; do NOT also `declare const d3` here — a value-only
 * declaration shadows the type namespace and breaks those annotations.
 */
/// <reference types="vite/client" />
/// <reference types="d3" />
