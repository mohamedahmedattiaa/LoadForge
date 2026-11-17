import type { LatencyStatistics } from "../domain/metrics-types.js";
import type { ILatencyHistogram } from "../domain/histogram-port.js";

const BUCKETS_PER_DECADE = 300;
const MIN_VALUE_MS = 0.1;
const MAX_VALUE_MS = 120_000;

// Log10(120,000 / 0.1) = Log10(1,200,000) ≈ 6.079181
// 6.079181 * 300 ≈ 1823.75 -> 1824 log buckets
const LOG_BUCKET_COUNT = Math.ceil(
    Math.log10(MAX_VALUE_MS / MIN_VALUE_MS) * BUCKETS_PER_DECADE
); // 1824
const TOTAL_BUCKETS = LOG_BUCKET_COUNT + 2; // +1 underflow (index 0), +1 overflow (index 1825)
const OVERFLOW_INDEX = TOTAL_BUCKETS - 1;

// Precompute geometric midpoint for each bucket once for all histogram instances
const BUCKET_MIDPOINTS = new Float64Array(TOTAL_BUCKETS);
BUCKET_MIDPOINTS[0] = MIN_VALUE_MS / 2; // Underflow bucket midpoint (0.05ms)
for (let i = 1; i <= LOG_BUCKET_COUNT; i++) {
    // Geometric mean of bucket bounds: 10^((i - 0.5) / 300) * MIN_VALUE_MS
    BUCKET_MIDPOINTS[i] =
        Math.pow(10, (i - 0.5) / BUCKETS_PER_DECADE) * MIN_VALUE_MS;
}
BUCKET_MIDPOINTS[OVERFLOW_INDEX] = MAX_VALUE_MS;

/**
 * Fixed-memory logarithmic latency histogram.
 *
 * Characteristics:
 * - Constant memory: exactly 1,826 32-bit unsigned integer counters (~7.3 KB).
 * - O(1) insertions: single logarithmic formula mapping value to bucket index.
 * - O(B) quantile queries: linear scan over 1,826 integers (~2-5 microseconds).
 * - High precision: guaranteed relative error <= 0.8% across 0.1ms to 120,000ms.
 * - Zero allocations on the hot path (record).
 */
export class LogarithmicHistogram implements ILatencyHistogram {
    private readonly buckets = new Uint32Array(TOTAL_BUCKETS);
    private count = 0;
    private sum = 0;
    private minVal: number | null = null;
    private maxVal: number | null = null;

    record(durationMs: number): void {
        if (
            typeof durationMs !== "number" ||
            !Number.isFinite(durationMs) ||
            durationMs < 0
        ) {
            throw new Error(
                "Histogram value must be a non-negative finite number"
            );
        }

        this.count++;
        this.sum += durationMs;

        if (this.minVal === null || durationMs < this.minVal) {
            this.minVal = durationMs;
        }
        if (this.maxVal === null || durationMs > this.maxVal) {
            this.maxVal = durationMs;
        }

        const bucketIndex = this.getBucketIndex(durationMs);
        this.buckets[bucketIndex]++;
    }

    private getBucketIndex(durationMs: number): number {
        if (durationMs < MIN_VALUE_MS) {
            return 0; // Underflow
        }
        if (durationMs >= MAX_VALUE_MS) {
            return OVERFLOW_INDEX; // Overflow
        }

        const ratio = durationMs / MIN_VALUE_MS;
        const bucketOffset = Math.floor(
            Math.log10(ratio) * BUCKETS_PER_DECADE
        );
        return Math.min(LOG_BUCKET_COUNT, Math.max(1, 1 + bucketOffset));
    }

    getValueCount(): number {
        return this.count;
    }

    getMin(): number | null {
        return this.minVal;
    }

    getMax(): number | null {
        return this.maxVal;
    }

    getAverage(): number | null {
        return this.count > 0 ? this.sum / this.count : null;
    }

    getPercentile(percentile: number): number | null {
        if (this.count === 0) {
            return null;
        }
        if (percentile < 0 || percentile > 1) {
            throw new Error("Percentile must be between 0.0 and 1.0");
        }

        if (percentile === 0) {
            return this.minVal;
        }
        if (percentile === 1) {
            return this.maxVal;
        }

        const targetRank = Math.max(1, Math.ceil(percentile * this.count));
        let accumulated = 0;

        for (let i = 0; i < TOTAL_BUCKETS; i++) {
            accumulated += this.buckets[i];
            if (accumulated >= targetRank) {
                // If it falls in the first bucket or last bucket, clamp to observed bounds
                if (i === 0 && this.minVal !== null) {
                    return Math.max(this.minVal, BUCKET_MIDPOINTS[0]);
                }
                if (i === OVERFLOW_INDEX && this.maxVal !== null) {
                    return Math.min(this.maxVal, BUCKET_MIDPOINTS[OVERFLOW_INDEX]);
                }
                return BUCKET_MIDPOINTS[i];
            }
        }

        return this.maxVal;
    }

    getStatistics(): LatencyStatistics {
        if (this.count === 0) {
            return {
                min: null,
                max: null,
                average: null,
                p50: null,
                p90: null,
                p95: null,
                p99: null,
            };
        }

        const average = this.sum / this.count;
        const r50 = Math.max(1, Math.ceil(0.5 * this.count));
        const r90 = Math.max(1, Math.ceil(0.9 * this.count));
        const r95 = Math.max(1, Math.ceil(0.95 * this.count));
        const r99 = Math.max(1, Math.ceil(0.99 * this.count));

        let p50: number | null = null;
        let p90: number | null = null;
        let p95: number | null = null;
        let p99: number | null = null;

        let accumulated = 0;
        for (let i = 0; i < TOTAL_BUCKETS; i++) {
            accumulated += this.buckets[i];

            if (p50 === null && accumulated >= r50) {
                p50 = BUCKET_MIDPOINTS[i];
            }
            if (p90 === null && accumulated >= r90) {
                p90 = BUCKET_MIDPOINTS[i];
            }
            if (p95 === null && accumulated >= r95) {
                p95 = BUCKET_MIDPOINTS[i];
            }
            if (p99 === null && accumulated >= r99) {
                p99 = BUCKET_MIDPOINTS[i];
                break; // Found all target quantiles
            }
        }

        return {
            min: this.minVal,
            max: this.maxVal,
            average,
            p50: p50 ?? this.maxVal,
            p90: p90 ?? this.maxVal,
            p95: p95 ?? this.maxVal,
            p99: p99 ?? this.maxVal,
        };
    }

    reset(): void {
        this.buckets.fill(0);
        this.count = 0;
        this.sum = 0;
        this.minVal = null;
        this.maxVal = null;
    }

    clone(): ILatencyHistogram {
        const cloned = new LogarithmicHistogram();
        cloned.buckets.set(this.buckets);
        cloned.count = this.count;
        cloned.sum = this.sum;
        cloned.minVal = this.minVal;
        cloned.maxVal = this.maxVal;
        return cloned;
    }

    /**
     * Diagnostic helper: returns the raw bucket memory consumption in bytes.
     */
    static getMemoryFootprintBytes(): number {
        return TOTAL_BUCKETS * Uint32Array.BYTES_PER_ELEMENT; // 1826 * 4 = 7304 bytes
    }
}
