import { describe, expect, it } from "vitest";
import { TimeBucketAggregator } from "../../src/modules/metrics/infrastructure/time-bucket-aggregator.js";

describe("TimeBucketAggregator", () => {
    it("starts empty with zero counters", () => {
        const aggregator = new TimeBucketAggregator(0);
        const summary = aggregator.getSummary(0);

        expect(summary.totalScheduled).toBe(0);
        expect(summary.totalStarted).toBe(0);
        expect(summary.totalCompleted).toBe(0);
        expect(summary.totalDropped).toBe(0);
        expect(summary.avgRps).toBe(0);
        expect(summary.minRps).toBe(0);
        expect(summary.maxRps).toBe(0);
        expect(summary.buckets).toHaveLength(0);
    });

    it("groups events into exact 1-second discrete windows", () => {
        const T0 = 10_000;
        const aggregator = new TimeBucketAggregator(T0);

        // Second 0 (10,000ms - 10,999ms)
        aggregator.recordScheduled(10_100);
        aggregator.recordStarted(10_105);
        aggregator.recordCompleted({
            intendedScheduledTimeMs: 10_100,
            actualDispatchTimeMs: 10_105,
            completionTimeMs: 10_125,
            isSuccess: true,
            isDelayed: false,
        });

        // Second 1 (11,000ms - 11,999ms)
        aggregator.recordScheduled(11_200);
        aggregator.recordStarted(11_202);
        aggregator.recordCompleted({
            intendedScheduledTimeMs: 11_200,
            actualDispatchTimeMs: 11_202,
            completionTimeMs: 11_250,
            isSuccess: true,
            isDelayed: false,
        });

        const summary = aggregator.getSummary(12_000);
        expect(summary.buckets).toHaveLength(2);

        expect(summary.buckets[0].secondIndex).toBe(0);
        expect(summary.buckets[0].completedCount).toBe(1);

        expect(summary.buckets[1].secondIndex).toBe(1);
        expect(summary.buckets[1].completedCount).toBe(1);
    });

    it("protects steady-state minRps from incomplete trailing windows", () => {
        const T0 = 0;
        const aggregator = new TimeBucketAggregator(T0);

        // Bucket 0 (0-1000ms): 100 completed requests
        for (let i = 0; i < 100; i++) {
            aggregator.recordCompleted({
                intendedScheduledTimeMs: 100,
                actualDispatchTimeMs: 100,
                completionTimeMs: 500,
                isSuccess: true,
                isDelayed: false,
            });
        }

        // Bucket 1 (1000-2000ms): 250 completed requests
        for (let i = 0; i < 250; i++) {
            aggregator.recordCompleted({
                intendedScheduledTimeMs: 1100,
                actualDispatchTimeMs: 1100,
                completionTimeMs: 1500,
                isSuccess: true,
                isDelayed: false,
            });
        }

        // Bucket 2 (2000-3000ms): Partial bucket at 2,300ms with only 12 completed requests
        for (let i = 0; i < 12; i++) {
            aggregator.recordCompleted({
                intendedScheduledTimeMs: 2100,
                actualDispatchTimeMs: 2100,
                completionTimeMs: 2200,
                isSuccess: true,
                isDelayed: false,
            });
        }

        // Query at 2,300ms (Bucket 0 and 1 are complete; Bucket 2 is incomplete at 300ms)
        const summary = aggregator.getSummary(2300);

        expect(summary.buckets).toHaveLength(3);
        expect(summary.buckets[0].isComplete).toBe(true);
        expect(summary.buckets[1].isComplete).toBe(true);
        expect(summary.buckets[2].isComplete).toBe(false);
        expect(summary.buckets[2].durationMs).toBe(300);

        // Crucial SRE requirement:
        // minRps MUST be 100 (from complete Bucket 0), NOT 12 (from partial Bucket 2)
        expect(summary.minRps).toBe(100);
        expect(summary.maxRps).toBe(250);
        expect(summary.totalCompleted).toBe(362);
    });

    it("accurately computes per-second tail latencies and failure rates", () => {
        const aggregator = new TimeBucketAggregator(0);

        // In second 0: 2 successful (20ms, 40ms) and 1 failure (timeout 1000ms)
        aggregator.recordCompleted({
            intendedScheduledTimeMs: 100,
            actualDispatchTimeMs: 100,
            completionTimeMs: 120, // 20ms
            isSuccess: true,
            isDelayed: false,
        });
        aggregator.recordCompleted({
            intendedScheduledTimeMs: 200,
            actualDispatchTimeMs: 210, // 10ms queue delay
            completionTimeMs: 250, // 40ms service, 50ms scheduled
            isSuccess: true,
            isDelayed: true,
        });
        aggregator.recordCompleted({
            intendedScheduledTimeMs: 300,
            actualDispatchTimeMs: 300,
            completionTimeMs: 800, // 500ms
            isSuccess: false,
            isDelayed: false,
        });

        const summary = aggregator.getSummary(1000);
        expect(summary.buckets[0].completedCount).toBe(3);
        expect(summary.buckets[0].successfulCount).toBe(2);
        expect(summary.buckets[0].failedCount).toBe(1);
        expect(summary.buckets[0].delayedCount).toBe(1);

        const serviceStats = summary.buckets[0].serviceStats;
        expect(serviceStats.min).toBe(20);
        expect(serviceStats.max).toBe(500);
    });

    it("records dropped requests and tracks total counts", () => {
        const aggregator = new TimeBucketAggregator(0);
        aggregator.recordScheduled(100);
        aggregator.recordDropped(150);

        const summary = aggregator.getSummary(1000);
        expect(summary.totalScheduled).toBe(1);
        expect(summary.totalDropped).toBe(1);
        expect(summary.buckets[0].droppedCount).toBe(1);
    });

    it("resets cleanly for a new test run", () => {
        const aggregator = new TimeBucketAggregator(0);
        aggregator.recordScheduled(100);
        aggregator.recordCompleted({
            intendedScheduledTimeMs: 100,
            actualDispatchTimeMs: 100,
            completionTimeMs: 150,
            isSuccess: true,
            isDelayed: false,
        });

        expect(aggregator.getSummary(1000).totalCompleted).toBe(1);

        aggregator.reset(5000);
        const resetSummary = aggregator.getSummary(5000);
        expect(resetSummary.totalCompleted).toBe(0);
        expect(resetSummary.buckets).toHaveLength(0);
    });
});
