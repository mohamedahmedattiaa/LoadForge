import type {
    ITimeBucketAggregator,
    ThroughputSummary,
    TimeBucketRecord,
} from "../domain/time-bucket-port.js";
import { LogarithmicHistogram } from "./logarithmic-histogram.js";

const WINDOW_SIZE_MS = 1000;
const DEFAULT_MAX_BUCKETS = 3600; // 1 hour of continuous 1s resolution

class BucketInternal {
    readonly secondIndex: number;
    readonly startTimeMs: number;

    scheduledCount = 0;
    startedCount = 0;
    completedCount = 0;
    successfulCount = 0;
    failedCount = 0;
    droppedCount = 0;
    delayedCount = 0;

    readonly serviceHistogram = new LogarithmicHistogram();
    readonly scheduledHistogram = new LogarithmicHistogram();

    constructor(secondIndex: number, testStartTimeMs: number) {
        this.secondIndex = secondIndex;
        this.startTimeMs = testStartTimeMs + secondIndex * WINDOW_SIZE_MS;
    }

    toRecord(isComplete: boolean, nowMs: number): TimeBucketRecord {
        const durationMs = isComplete
            ? WINDOW_SIZE_MS
            : Math.max(0, Math.min(WINDOW_SIZE_MS, nowMs - this.startTimeMs));

        return {
            secondIndex: this.secondIndex,
            startTimeMs: this.startTimeMs,
            durationMs,
            isComplete,
            scheduledCount: this.scheduledCount,
            startedCount: this.startedCount,
            completedCount: this.completedCount,
            successfulCount: this.successfulCount,
            failedCount: this.failedCount,
            droppedCount: this.droppedCount,
            delayedCount: this.delayedCount,
            serviceStats: this.serviceHistogram.getStatistics(),
            scheduledStats: this.scheduledHistogram.getStatistics(),
        };
    }
}

/**
 * High-performance 1-second non-overlapping time bucket aggregator.
 *
 * Characteristics:
 * - Groups telemetry into discrete 1-second windows aligned from test start.
 * - Protects against false minimums by flagging partial buckets at startup/shutdown.
 * - Tracks minRps, maxRps, p95Rps across full 1-second completed windows.
 * - Embeds LogarithmicHistogram per bucket for 1-second tail latency tracking.
 */
export class TimeBucketAggregator implements ITimeBucketAggregator {
    private startTimeMs: number;
    private readonly buckets = new Map<number, BucketInternal>();
    private totalScheduled = 0;
    private totalStarted = 0;
    private totalCompleted = 0;
    private totalDropped = 0;
    private totalDelayed = 0;

    constructor(
        initialStartTimeMs?: number,
        private readonly maxBuckets: number = DEFAULT_MAX_BUCKETS
    ) {
        this.startTimeMs = initialStartTimeMs ?? performance.now();
    }

    private getOrCreateBucket(eventTimeMs: number): BucketInternal {
        const offset = Math.max(0, eventTimeMs - this.startTimeMs);
        const secondIndex = Math.floor(offset / WINDOW_SIZE_MS);

        let bucket = this.buckets.get(secondIndex);
        if (!bucket) {
            // Evict oldest bucket if exceeding max capacity (e.g., tests > 1 hour)
            if (this.buckets.size >= this.maxBuckets) {
                const oldestKey = Math.min(...this.buckets.keys());
                this.buckets.delete(oldestKey);
            }

            bucket = new BucketInternal(secondIndex, this.startTimeMs);
            this.buckets.set(secondIndex, bucket);
        }

        return bucket;
    }

    recordScheduled(intendedScheduledTimeMs: number): void {
        this.totalScheduled++;
        const bucket = this.getOrCreateBucket(intendedScheduledTimeMs);
        bucket.scheduledCount++;
    }

    recordStarted(actualDispatchTimeMs: number): void {
        this.totalStarted++;
        const bucket = this.getOrCreateBucket(actualDispatchTimeMs);
        bucket.startedCount++;
    }

    recordCompleted(params: {
        intendedScheduledTimeMs: number;
        actualDispatchTimeMs: number;
        completionTimeMs: number;
        isSuccess: boolean;
        isDelayed: boolean;
    }): void {
        this.totalCompleted++;
        if (params.isDelayed) {
            this.totalDelayed++;
        }

        const bucket = this.getOrCreateBucket(params.completionTimeMs);
        bucket.completedCount++;

        if (params.isSuccess) {
            bucket.successfulCount++;
        } else {
            bucket.failedCount++;
        }

        if (params.isDelayed) {
            bucket.delayedCount++;
        }

        const serviceLatency = Math.max(
            0,
            params.completionTimeMs - params.actualDispatchTimeMs
        );
        const scheduledLatency = Math.max(
            0,
            params.completionTimeMs - params.intendedScheduledTimeMs
        );

        bucket.serviceHistogram.record(serviceLatency);
        bucket.scheduledHistogram.record(scheduledLatency);
    }

    recordDropped(dropTimeMs: number): void {
        this.totalDropped++;
        const bucket = this.getOrCreateBucket(dropTimeMs);
        bucket.droppedCount++;
    }

    getSummary(referenceTimeMs?: number): ThroughputSummary {
        const now = referenceTimeMs ?? performance.now();
        const totalDurationSeconds = Math.max(
            0.001,
            (now - this.startTimeMs) / 1000
        );
        const currentSecIndex = Math.floor(
            Math.max(0, now - this.startTimeMs) / WINDOW_SIZE_MS
        );

        const bucketIndices = Array.from(this.buckets.keys()).sort(
            (a, b) => a - b
        );
        const records: TimeBucketRecord[] = [];
        const completeThroughputs: number[] = [];

        for (const idx of bucketIndices) {
            const bucket = this.buckets.get(idx)!;
            const isComplete = idx < currentSecIndex;
            const record = bucket.toRecord(isComplete, now);
            records.push(record);

            if (isComplete) {
                completeThroughputs.push(record.completedCount);
            }
        }

        let minRps = 0;
        let maxRps = 0;
        let p95Rps = 0;

        if (completeThroughputs.length > 0) {
            minRps = Math.min(...completeThroughputs);
            maxRps = Math.max(...completeThroughputs);

            const sorted = [...completeThroughputs].sort((a, b) => a - b);
            const r95 = Math.max(1, Math.ceil(0.95 * sorted.length));
            p95Rps = sorted[r95 - 1];
        } else if (records.length > 0) {
            // No full second completed yet; report current in-flight window as provisional
            const currentCount = records[0].completedCount;
            minRps = currentCount;
            maxRps = currentCount;
            p95Rps = currentCount;
        }

        const avgRps = this.totalCompleted / totalDurationSeconds;

        return {
            avgRps,
            minRps,
            maxRps,
            p95Rps,
            totalScheduled: this.totalScheduled,
            totalStarted: this.totalStarted,
            totalCompleted: this.totalCompleted,
            totalDropped: this.totalDropped,
            totalDelayed: this.totalDelayed,
            buckets: records,
        };
    }

    reset(newStartTimeMs?: number): void {
        this.startTimeMs = newStartTimeMs ?? performance.now();
        this.buckets.clear();
        this.totalScheduled = 0;
        this.totalStarted = 0;
        this.totalCompleted = 0;
        this.totalDropped = 0;
        this.totalDelayed = 0;
    }
}
