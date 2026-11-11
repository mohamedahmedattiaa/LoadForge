import { describe, expect, it } from "vitest";
import { CAPACITY_DEFAULTS } from "../../src/modules/capacity/application/capacity-defaults.js";
import {
    advanceCapacitySearch,
    assembleCapacityReport,
    computeRecommendedConcurrency,
    createInitialSearchState,
    evaluateCapacityStep,
} from "../../src/modules/capacity/domain/capacity-evaluation-service.js";
import type { CapacityDiscoveryConfig } from "../../src/modules/capacity/domain/capacity-types.js";
import type { LoadTestReport } from "../../src/modules/metrics/domain/metrics-types.js";

function makeConfig(
    overrides: Partial<CapacityDiscoveryConfig> = {}
): CapacityDiscoveryConfig {
    return {
        url: "https://api.example.com/health",
        ...CAPACITY_DEFAULTS,
        ...overrides,
    };
}

function makeReport(overrides: Partial<LoadTestReport> = {}): LoadTestReport {
    return {
        totalRequests: 200,
        successfulRequests: 200,
        failedRequests: 0,
        httpErrors: 0,
        networkErrors: 0,
        timeouts: 0,
        durationMs: 2000,
        requestsPerSecond: 100,
        statusCodes: { "200": 200 },
        latency: {
            min: 5,
            max: 25,
            average: 12,
            p50: 11,
            p90: 20,
            p95: 22,
            p99: 24,
        },
        ...overrides,
    };
}

describe("capacity-evaluation-service", () => {
    it("marks a clean step with high success rate and low latency as healthy", () => {
        const config = makeConfig();
        const step = evaluateCapacityStep({
            stepNumber: 1,
            concurrency: 5,
            report: makeReport(),
            config,
            baselineP95Ms: 22,
            previousHealthyStep: null,
        });

        expect(step.verdict).toBe("healthy");
        expect(step.stopReason).toBeUndefined();
        expect(step.goodputRps).toBe(100);
        expect(step.errorRate).toBe(0);
    });

    it("marks HTTP 429 responses as saturated with rate_limited stop reason", () => {
        const config = makeConfig({ stopOnRateLimit: true });
        const step = evaluateCapacityStep({
            stepNumber: 2,
            concurrency: 20,
            report: makeReport({
                totalRequests: 200,
                successfulRequests: 195,
                failedRequests: 5,
                httpErrors: 5,
                statusCodes: { "200": 195, "429": 5 },
            }),
            config,
            baselineP95Ms: 20,
            previousHealthyStep: null,
        });

        expect(step.verdict).toBe("saturated");
        expect(step.stopReason).toBe("rate_limited");
        expect(step.rateLimitedCount).toBe(5);
    });

    it("detects explicit maxP95LatencyMs SLO breach", () => {
        const config = makeConfig({ maxP95LatencyMs: 150 });
        const step = evaluateCapacityStep({
            stepNumber: 3,
            concurrency: 40,
            report: makeReport({
                latency: {
                    min: 20,
                    max: 300,
                    average: 110,
                    p50: 100,
                    p90: 170,
                    p95: 190,
                    p99: 280,
                },
            }),
            config,
            baselineP95Ms: 25,
            previousHealthyStep: null,
        });

        expect(step.verdict).toBe("degraded");
        expect(step.stopReason).toBe("latency_slo_exceeded");
    });

    it("detects retrograde throughput drop when concurrency increases", () => {
        const config = makeConfig();
        const prevHealthy = evaluateCapacityStep({
            stepNumber: 1,
            concurrency: 20,
            report: makeReport({
                successfulRequests: 400,
                totalRequests: 400,
                requestsPerSecond: 200,
            }),
            config,
            baselineP95Ms: 20,
            previousHealthyStep: null,
        });

        const nextStep = evaluateCapacityStep({
            stepNumber: 2,
            concurrency: 40,
            report: makeReport({
                successfulRequests: 240,
                totalRequests: 240,
                requestsPerSecond: 120,
            }),
            config,
            baselineP95Ms: 20,
            previousHealthyStep: prevHealthy,
        });

        expect(nextStep.verdict).toBe("degraded");
        expect(nextStep.stopReason).toBe("throughput_plateau");
    });

    it("escalates exponentially then binary-searches between healthy and breaking concurrency", () => {
        const config = makeConfig({
            initialConcurrency: 5,
            stepMultiplier: 2,
            maxConcurrency: 200,
        });

        let state = createInitialSearchState(config);
        expect(state.currentConcurrency).toBe(5);

        const s1 = evaluateCapacityStep({
            stepNumber: 1,
            concurrency: 5,
            report: makeReport({ successfulRequests: 100, totalRequests: 100 }),
            config,
            baselineP95Ms: 20,
            previousHealthyStep: null,
        });
        state = advanceCapacitySearch(state, s1, config);
        expect(state.phase).toBe("escalating");
        expect(state.currentConcurrency).toBe(10);

        const s2 = evaluateCapacityStep({
            stepNumber: 2,
            concurrency: 10,
            report: makeReport({ successfulRequests: 200, totalRequests: 200 }),
            config,
            baselineP95Ms: 20,
            previousHealthyStep: s1,
        });
        state = advanceCapacitySearch(state, s2, config);
        expect(state.currentConcurrency).toBe(20);

        const s3 = evaluateCapacityStep({
            stepNumber: 3,
            concurrency: 20,
            report: makeReport({ successfulRequests: 360, totalRequests: 360 }),
            config,
            baselineP95Ms: 20,
            previousHealthyStep: s2,
        });
        state = advanceCapacitySearch(state, s3, config);
        expect(state.currentConcurrency).toBe(40);

        const s4 = evaluateCapacityStep({
            stepNumber: 4,
            concurrency: 40,
            report: makeReport({
                totalRequests: 300,
                successfulRequests: 290,
                failedRequests: 10,
                httpErrors: 10,
                statusCodes: { "200": 290, "429": 10 },
            }),
            config,
            baselineP95Ms: 20,
            previousHealthyStep: s3,
        });
        state = advanceCapacitySearch(state, s4, config);
        expect(state.phase).toBe("refining");
        expect(state.currentConcurrency).toBe(30);
        expect(state.bestHealthyConcurrency).toBe(20);
        expect(state.breakingConcurrency).toBe(40);
    });

    it("stops immediately if the initial concurrency already fails", () => {
        const config = makeConfig({ initialConcurrency: 10 });
        let state = createInitialSearchState(config);

        const s1 = evaluateCapacityStep({
            stepNumber: 1,
            concurrency: 10,
            report: makeReport({
                totalRequests: 50,
                successfulRequests: 0,
                failedRequests: 50,
                networkErrors: 50,
                statusCodes: {},
            }),
            config,
            baselineP95Ms: null,
            previousHealthyStep: null,
        });

        state = advanceCapacitySearch(state, s1, config);
        expect(state.phase).toBe("done");
        expect(state.bestHealthyConcurrency).toBe(0);

        const report = assembleCapacityReport({
            config,
            resolvedTimeoutMs: 5000,
            baselineMinRttMs: 12,
            baselineP95Ms: null,
            state,
            steps: [s1],
        });
        expect(report.maxSafeConcurrency).toBe(0);
        expect(report.recommendedConcurrency).toBe(0);
        expect(report.summary).toContain("starting at 10 concurrent users");
    });

    it("computes recommended concurrency with 20% safety headroom", () => {
        expect(computeRecommendedConcurrency(0)).toBe(0);
        expect(computeRecommendedConcurrency(1)).toBe(1);
        expect(computeRecommendedConcurrency(25)).toBe(20);
    });

    it("ignores latency spikes and throughput plateaus in rejection policy until HTTP 429 or errors occur", () => {
        const config = makeConfig({
            stopPolicy: "rejection",
            maxP95LatencyMs: 100,
        });

        const healthyPrev = evaluateCapacityStep({
            stepNumber: 1,
            concurrency: 20,
            report: makeReport({
                successfulRequests: 400,
                totalRequests: 400,
                requestsPerSecond: 200,
            }),
            config,
            baselineP95Ms: 20,
            previousHealthyStep: null,
        });

        // Slow p95 (600ms) and lower RPS (100 < 200*0.85) still stay healthy under "rejection" policy
        const slowButSuccessful = evaluateCapacityStep({
            stepNumber: 2,
            concurrency: 40,
            report: makeReport({
                successfulRequests: 200,
                totalRequests: 200,
                requestsPerSecond: 100,
                latency: {
                    min: 50,
                    max: 800,
                    average: 400,
                    p50: 380,
                    p90: 550,
                    p95: 600,
                    p99: 790,
                },
            }),
            config,
            baselineP95Ms: 20,
            previousHealthyStep: healthyPrev,
        });

        expect(slowButSuccessful.verdict).toBe("healthy");

        // HTTP 429 still stops immediately under "rejection" policy
        const rateLimited = evaluateCapacityStep({
            stepNumber: 3,
            concurrency: 80,
            report: makeReport({
                totalRequests: 200,
                successfulRequests: 195,
                failedRequests: 5,
                httpErrors: 5,
                statusCodes: { "200": 195, "429": 5 },
            }),
            config,
            baselineP95Ms: 20,
            previousHealthyStep: slowButSuccessful,
        });

        expect(rateLimited.verdict).toBe("saturated");
        expect(rateLimited.stopReason).toBe("rate_limited");
    });

    it("classifies client timeouts distinctly as timeouts_exceeded and checks burst completion window in slo mode", () => {
        const timeoutStep = evaluateCapacityStep({
            stepNumber: 1,
            concurrency: 80,
            report: makeReport({
                totalRequests: 100,
                successfulRequests: 70,
                failedRequests: 30,
                httpErrors: 0,
                timeouts: 30,
                statusCodes: { "200": 70 },
            }),
            config: makeConfig(),
            baselineP95Ms: 20,
            previousHealthyStep: null,
        });

        expect(timeoutStep.stopReason).toBe("timeouts_exceeded");
        expect(timeoutStep.timeoutCount).toBe(30);

        const slowBurst = evaluateCapacityStep({
            stepNumber: 2,
            concurrency: 160,
            report: makeReport({
                totalRequests: 160,
                successfulRequests: 160,
                durationMs: 2200,
                requestsPerSecond: 72.7,
            }),
            config: makeConfig({ mode: "burst", stepDurationSeconds: 1 }),
            baselineP95Ms: 20,
            previousHealthyStep: null,
        });

        expect(slowBurst.verdict).toBe("degraded");
        expect(slowBurst.stopReason).toBe("latency_slo_exceeded");
        expect(slowBurst.reason).toContain("Burst took 2.20s");
    });
});
