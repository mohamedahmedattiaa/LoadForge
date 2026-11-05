
import { describe, it, expect } from "vitest";

import {
    calculateLatencyStatistics,
} from "../../src/modules/load-test/metrics/statistics.js";

describe("calculateLatencyStatistics", () => {
    describe("empty input", () => {
        it("should return null for all statistics when no latencies exist", () => {
            const result = calculateLatencyStatistics([]);

            expect(result).toEqual({
                min: null,
                max: null,
                average: null,
                p50: null,
                p90: null,
                p95: null,
                p99: null,
            });
        });
    });

    describe("basic statistics", () => {
        it("should calculate min, max, and average correctly", () => {
            const latencies = [10, 20, 30, 40, 50];

            const result = calculateLatencyStatistics(latencies);

            expect(result.min).toBe(10);
            expect(result.max).toBe(50);
            expect(result.average).toBe(30);
        });

        it("should calculate statistics for a single latency", () => {
            const result = calculateLatencyStatistics([120]);

            expect(result).toEqual({
                min: 120,
                max: 120,
                average: 120,
                p50: 120,
                p90: 120,
                p95: 120,
                p99: 120,
            });
        });
    });

    describe("percentiles", () => {
        it("should calculate percentiles using the nearest-rank method", () => {
            const latencies = [10, 20, 30, 40, 50];

            const result = calculateLatencyStatistics(latencies);

            expect(result.p50).toBe(30);
            expect(result.p90).toBe(50);
            expect(result.p95).toBe(50);
            expect(result.p99).toBe(50);
        });

        it("should sort unsorted latencies before calculating statistics", () => {
            const latencies = [50, 10, 40, 20, 30];

            const result = calculateLatencyStatistics(latencies);

            expect(result.min).toBe(10);
            expect(result.max).toBe(50);
            expect(result.p50).toBe(30);
        });

        it("should handle duplicate latency values", () => {
            const latencies = [10, 10, 20, 20, 30];

            const result = calculateLatencyStatistics(latencies);

            expect(result.min).toBe(10);
            expect(result.max).toBe(30);
            expect(result.average).toBe(18);
            expect(result.p50).toBe(20);
        });
    });

    describe("immutability", () => {
        it("should not modify the original latency array", () => {
            const latencies = [50, 10, 40, 20, 30];
            const originalLatencies = [...latencies];

            calculateLatencyStatistics(latencies);

            expect(latencies).toEqual(originalLatencies);
        });
    });
});
