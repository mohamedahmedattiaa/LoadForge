
import { describe, it, expect } from "vitest";
import { MetricsCollector } from "../../src/modules/metrics/domain/metrics-collector-service.js";

describe("MetricsCollector", () => {
    describe("record()", () => {
        it("should record a successful HTTP request", () => {
            const collector = new MetricsCollector();

            collector.record({
                kind: "http",
                durationMs: 120,
                statusCode: 200,
            });

            const summary = collector.getSummary();

            expect(summary.totalRequests).toBe(1);
            expect(summary.successfulRequests).toBe(1);
            expect(summary.failedRequests).toBe(0);
            expect(summary.statusCodes).toEqual(
                new Map([[200, 1]])
            );
            expect(collector.getLatencies()).toEqual([120]);
        });

        it("should record a failed HTTP request", () => {
            const collector = new MetricsCollector();

            collector.record({
                kind: "http",
                durationMs: 250,
                statusCode: 500,
            });

            const summary = collector.getSummary();

            expect(summary.totalRequests).toBe(1);
            expect(summary.successfulRequests).toBe(0);
            expect(summary.failedRequests).toBe(1);
            expect(summary.httpErrors).toBe(1);
            expect(summary.statusCodes).toEqual(
                new Map([[500, 1]])
            );
            expect(collector.getLatencies()).toEqual([250]);
        });

        it("should record a network error", () => {
            const collector = new MetricsCollector();

            collector.record({
                kind: "network_error",
                durationMs: 50,
            });

            const summary = collector.getSummary();

            expect(summary.totalRequests).toBe(1);
            expect(summary.successfulRequests).toBe(0);
            expect(summary.failedRequests).toBe(1);
            expect(summary.networkErrors).toBe(1);
            expect(collector.getLatencies()).toEqual([50]);
        });

        it("should record a timeout", () => {
            const collector = new MetricsCollector();

            collector.record({
                kind: "timeout",
                durationMs: 5000,
            });

            const summary = collector.getSummary();

            expect(summary.totalRequests).toBe(1);
            expect(summary.successfulRequests).toBe(0);
            expect(summary.failedRequests).toBe(1);
            expect(summary.timeouts).toBe(1);
            expect(collector.getLatencies()).toEqual([5000]);
        });
    });

    describe("aggregation", () => {
        it("should aggregate multiple request outcomes correctly", () => {
            const collector = new MetricsCollector();

            collector.record({
                kind: "http",
                durationMs: 100,
                statusCode: 200,
            });

            collector.record({
                kind: "http",
                durationMs: 150,
                statusCode: 200,
            });

            collector.record({
                kind: "http",
                durationMs: 200,
                statusCode: 201,
            });

            collector.record({
                kind: "http",
                durationMs: 300,
                statusCode: 404,
            });

            collector.record({
                kind: "http",
                durationMs: 400,
                statusCode: 500,
            });

            collector.record({
                kind: "network_error",
                durationMs: 50,
            });

            collector.record({
                kind: "timeout",
                durationMs: 5000,
            });

            const summary = collector.getSummary();

            expect(summary.totalRequests).toBe(7);
            expect(summary.successfulRequests).toBe(3);
            expect(summary.failedRequests).toBe(4);

            expect(summary.httpErrors).toBe(2);
            expect(summary.networkErrors).toBe(1);
            expect(summary.timeouts).toBe(1);

            expect(summary.statusCodes).toEqual(
                new Map([
                    [200, 2],
                    [201, 1],
                    [404, 1],
                    [500, 1],
                ])
            );

            expect(collector.getLatencies()).toEqual([
                100, 150, 200, 300, 400, 50, 5000,
            ]);
        });

        it("should increment the same status code count", () => {
            const collector = new MetricsCollector();

            collector.record({
                kind: "http",
                durationMs: 100,
                statusCode: 200,
            });

            collector.record({
                kind: "http",
                durationMs: 120,
                statusCode: 200,
            });

            collector.record({
                kind: "http",
                durationMs: 140,
                statusCode: 200,
            });

            expect(
                collector.getSummary().statusCodes.get(200)
            ).toBe(3);
        });

        it("should maintain consistent request counts", () => {
            const collector = new MetricsCollector();

            collector.record({
                kind: "http",
                durationMs: 100,
                statusCode: 200,
            });

            collector.record({
                kind: "http",
                durationMs: 200,
                statusCode: 500,
            });

            collector.record({
                kind: "network_error",
                durationMs: 50,
            });

            collector.record({
                kind: "timeout",
                durationMs: 3000,
            });

            const summary = collector.getSummary();

            expect(summary.totalRequests).toBe(
                summary.successfulRequests + summary.failedRequests
            );
        });
    });

    describe("latency recording", () => {
        it("should record latency for successful and failed requests", () => {
            const collector = new MetricsCollector();

            collector.record({
                kind: "http",
                durationMs: 100,
                statusCode: 200,
            });

            collector.record({
                kind: "http",
                durationMs: 500,
                statusCode: 500,
            });

            collector.record({
                kind: "network_error",
                durationMs: 30,
            });

            collector.record({
                kind: "timeout",
                durationMs: 5000,
            });

            expect(collector.getLatencies()).toEqual([
                100, 500, 30, 5000,
            ]);
        });

        it("should return an empty array when no requests are recorded", () => {
            const collector = new MetricsCollector();

            expect(collector.getLatencies()).toEqual([]);
        });
    });

    describe("getSummary()", () => {
        it("should return zero counters initially", () => {
            const collector = new MetricsCollector();

            expect(collector.getSummary()).toEqual({
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                httpErrors: 0,
                networkErrors: 0,
                timeouts: 0,
                statusCodes: new Map(),
            });
        });

        it("should return a defensive copy of status codes", () => {
            const collector = new MetricsCollector();

            collector.record({
                kind: "http",
                durationMs: 100,
                statusCode: 200,
            });

            const summary = collector.getSummary();

            summary.statusCodes.set(200, 999);

            expect(
                collector.getSummary().statusCodes.get(200)
            ).toBe(1);
        });

        it("should return a defensive copy of latencies", () => {
            const collector = new MetricsCollector();

            collector.record({
                kind: "http",
                durationMs: 100,
                statusCode: 200,
            });

            const latencies = collector.getLatencies();

            latencies.push(999);

            expect(collector.getLatencies()).toEqual([100]);
        });
    });

    describe("validation", () => {
        it("should reject a negative duration", () => {
            const collector = new MetricsCollector();

            expect(() => {
                collector.record({
                    kind: "http",
                    durationMs: -100,
                    statusCode: 200,
                });
            }).toThrow();
        });

        it("should reject an invalid HTTP status code", () => {
            const collector = new MetricsCollector();

            expect(() => {
                collector.record({
                    kind: "http",
                    durationMs: 100,
                    statusCode: 99,
                });
            }).toThrow();
        });

        it("should reject an invalid metric kind", () => {
            const collector = new MetricsCollector();

            expect(() => {
                collector.record({
                    kind: "invalid",
                    durationMs: 100,
                } as never);
            }).toThrow();
        });

        it("should reject a non-finite duration", () => {
            const collector = new MetricsCollector();

            expect(() => {
                collector.record({
                    kind: "http",
                    durationMs: Infinity,
                    statusCode: 200,
                });
            }).toThrow();
        });

        it("should not update metrics when validation fails", () => {
            const collector = new MetricsCollector();

            expect(() => {
                collector.record({
                    kind: "http",
                    durationMs: -100,
                    statusCode: 200,
                });
            }).toThrow();

            const summary = collector.getSummary();

            expect(summary.totalRequests).toBe(0);
            expect(summary.successfulRequests).toBe(0);
            expect(summary.failedRequests).toBe(0);
            expect(collector.getLatencies()).toEqual([]);
        });
    });

    describe("Milestone 1: High-Precision Dual Latency, Throughput & Health", () => {
        it("records execution records and accurately separates service latency from queue delay", () => {
            const collector = new MetricsCollector();

            // Request 1: Intended at 100ms, dispatched at 120ms (20ms queue delay), finished at 150ms (30ms service latency, 50ms total)
            collector.recordExecution({
                intendedScheduledTime: 100,
                actualDispatchTime: 120,
                completionTime: 150,
                outcome: { kind: "http", statusCode: 200 },
            });

            // Request 2: Intended at 200ms, dispatched at 200ms (0ms queue delay), finished at 240ms (40ms service latency, 40ms total)
            collector.recordExecution({
                intendedScheduledTime: 200,
                actualDispatchTime: 200,
                completionTime: 240,
                outcome: { kind: "http", statusCode: 200 },
            });

            const dual = collector.getDualLatencyStatistics();

            // Service latencies: 30ms, 40ms -> min 30, max 40, avg 35
            expect(dual.service.min).toBe(30);
            expect(dual.service.max).toBe(40);
            expect(dual.service.average).toBe(35);

            // Queue delay: 20ms, 0ms -> min 0, max 20, avg 10
            expect(dual.queueDelay.min).toBe(0);
            expect(dual.queueDelay.max).toBe(20);
            expect(dual.queueDelay.average).toBe(10);

            // Scheduled latency: 50ms, 40ms -> min 40, max 50, avg 45
            expect(dual.scheduled.min).toBe(40);
            expect(dual.scheduled.max).toBe(50);
            expect(dual.scheduled.average).toBe(45);
        });

        it("integrates throughput summary and health monitoring", () => {
            const collector = new MetricsCollector();
            collector.startHealthMonitoring();

            collector.recordExecution({
                intendedScheduledTime: 1000,
                actualDispatchTime: 1000,
                completionTime: 1050,
                outcome: { kind: "http", statusCode: 200 },
            });

            const throughput = collector.getThroughputSummary();
            expect(throughput.totalCompleted).toBe(1);

            const health = collector.getHealthSnapshot();
            expect(["HEALTHY", "DEGRADED", "SATURATED"]).toContain(health.healthState);
            expect(health.heapUsedMb).toBeGreaterThan(0);

            collector.stopHealthMonitoring();
        });

        it("computes getStatistics() directly in O(B) from the histogram without sorting", () => {
            const collector = new MetricsCollector();

            for (let i = 1; i <= 100; i++) {
                collector.record({
                    kind: "http",
                    statusCode: 200,
                    durationMs: i,
                });
            }

            const stats = collector.getStatistics();
            expect(stats.min).toBe(1);
            expect(stats.max).toBe(100);
            expect(stats.average).toBe(50.5);
            // P50 should be around 50
            expect(stats.p50!).toBeGreaterThanOrEqual(49);
            expect(stats.p50!).toBeLessThanOrEqual(51);
        });
    });
});
