import type { LatencyStatistics } from "./metrics-types.js";

/**
 * Interface for fixed-memory latency histogram.
 * Provides O(1) insertions, constant memory footprint, and O(B) percentile lookups
 * with bounded relative error across the range [0.1ms, 120,000ms].
 */
export interface ILatencyHistogram {
    /**
     * Record a latency sample in milliseconds.
     * Must be a non-negative finite number.
     * Complexity: O(1)
     */
    record(durationMs: number): void;

    /**
     * Total number of recorded latency samples.
     */
    getValueCount(): number;

    /**
     * Minimum observed latency value in ms, or null if no values recorded.
     */
    getMin(): number | null;

    /**
     * Maximum observed latency value in ms, or null if no values recorded.
     */
    getMax(): number | null;

    /**
     * Arithmetic mean latency in ms, or null if no values recorded.
     */
    getAverage(): number | null;

    /**
     * Get latency at a given percentile (0.0 to 1.0).
     * e.g., 0.5 for P50, 0.95 for P95.
     * Returns null if no values recorded.
     * Complexity: O(B) where B is the number of buckets (~1,850).
     */
    getPercentile(percentile: number): number | null;

    /**
     * Get full summary of standard percentiles (min, max, avg, p50, p90, p95, p99).
     * Single-pass scan over buckets.
     */
    getStatistics(): LatencyStatistics;

    /**
     * Reset all counters and statistics to initial state.
     */
    reset(): void;

    /**
     * Create an independent snapshot of this histogram.
     */
    clone(): ILatencyHistogram;
}
