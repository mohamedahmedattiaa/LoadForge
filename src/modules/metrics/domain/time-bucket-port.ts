import type { LatencyStatistics } from "./metrics-types.js";

/**
 * Snapshot of telemetry metrics recorded within a discrete 1-second window.
 */
export interface TimeBucketRecord {
    readonly secondIndex: number;
    readonly startTimeMs: number;
    readonly durationMs: number;
    /**
     * True only if a full 1,000ms has elapsed for this window.
     * Partial startup or shutdown buckets have isComplete = false
     * and are excluded from steady-state minRps calculations.
     */
    readonly isComplete: boolean;

    readonly scheduledCount: number;
    readonly startedCount: number;
    readonly completedCount: number;
    readonly successfulCount: number;
    readonly failedCount: number;
    readonly droppedCount: number;
    readonly delayedCount: number;

    readonly serviceStats: LatencyStatistics;
    readonly scheduledStats: LatencyStatistics;
}

/**
 * Global summary across all 1-second time buckets.
 */
export interface ThroughputSummary {
    readonly avgRps: number;
    readonly minRps: number;
    readonly maxRps: number;
    readonly p95Rps: number;

    readonly totalScheduled: number;
    readonly totalStarted: number;
    readonly totalCompleted: number;
    readonly totalDropped: number;
    readonly totalDelayed: number;

    readonly buckets: readonly TimeBucketRecord[];
}

/**
 * Port for recording and aggregating per-second time-bucketed telemetry.
 */
export interface ITimeBucketAggregator {
    /**
     * Record that a request was mathematically scheduled at intendedScheduledTime.
     */
    recordScheduled(intendedScheduledTimeMs: number): void;

    /**
     * Record that a request was dispatched to the network at actualDispatchTimeMs.
     */
    recordStarted(actualDispatchTimeMs: number): void;

    /**
     * Record that a request finished at completionTimeMs.
     */
    recordCompleted(params: {
        intendedScheduledTimeMs: number;
        actualDispatchTimeMs: number;
        completionTimeMs: number;
        isSuccess: boolean;
        isDelayed: boolean;
    }): void;

    /**
     * Record that a request was dropped due to generator backpressure/limits.
     */
    recordDropped(dropTimeMs: number): void;

    /**
     * Query steady-state throughput statistics up to the given reference time.
     */
    getSummary(referenceTimeMs?: number): ThroughputSummary;

    /**
     * Reset aggregator to initial state.
     */
    reset(newStartTimeMs?: number): void;
}
