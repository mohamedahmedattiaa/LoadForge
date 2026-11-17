import { describe, expect, it } from "vitest";
import { LogarithmicHistogram } from "../../src/modules/metrics/infrastructure/logarithmic-histogram.js";

describe("LogarithmicHistogram", () => {
    describe("Basic Functionality", () => {
        it("starts empty with null statistics", () => {
            const hist = new LogarithmicHistogram();
            expect(hist.getValueCount()).toBe(0);
            expect(hist.getMin()).toBeNull();
            expect(hist.getMax()).toBeNull();
            expect(hist.getAverage()).toBeNull();
            expect(hist.getPercentile(0.5)).toBeNull();

            const stats = hist.getStatistics();
            expect(stats.p50).toBeNull();
            expect(stats.p95).toBeNull();
            expect(stats.p99).toBeNull();
        });

        it("records a single value accurately", () => {
            const hist = new LogarithmicHistogram();
            hist.record(42.5);

            expect(hist.getValueCount()).toBe(1);
            expect(hist.getMin()).toBe(42.5);
            expect(hist.getMax()).toBe(42.5);
            expect(hist.getAverage()).toBe(42.5);
            expect(hist.getPercentile(0)).toBe(42.5);
            expect(hist.getPercentile(1)).toBe(42.5);

            const p50 = hist.getPercentile(0.5)!;
            // Within 0.8% relative error of 42.5
            expect(Math.abs(p50 - 42.5) / 42.5).toBeLessThanOrEqual(0.008);
        });

        it("handles multiple values and resets cleanly", () => {
            const hist = new LogarithmicHistogram();
            hist.record(10);
            hist.record(20);
            hist.record(30);

            expect(hist.getValueCount()).toBe(3);
            expect(hist.getMin()).toBe(10);
            expect(hist.getMax()).toBe(30);
            expect(hist.getAverage()).toBe(20);

            hist.reset();
            expect(hist.getValueCount()).toBe(0);
            expect(hist.getMin()).toBeNull();
            expect(hist.getStatistics().average).toBeNull();
        });

        it("clones state into an independent snapshot", () => {
            const hist = new LogarithmicHistogram();
            hist.record(15);
            hist.record(35);

            const cloned = hist.clone();
            expect(cloned.getValueCount()).toBe(2);
            expect(cloned.getMin()).toBe(15);
            expect(cloned.getMax()).toBe(35);

            // Mutating original does not affect clone
            hist.record(100);
            expect(hist.getValueCount()).toBe(3);
            expect(cloned.getValueCount()).toBe(2);
        });

        it("throws on invalid inputs", () => {
            const hist = new LogarithmicHistogram();
            expect(() => hist.record(-1)).toThrow("non-negative finite number");
            expect(() => hist.record(Number.NaN)).toThrow("non-negative finite number");
            expect(() => hist.record(Number.POSITIVE_INFINITY)).toThrow("non-negative finite number");

            hist.record(10);
            expect(() => hist.getPercentile(-0.1)).toThrow("between 0.0 and 1.0");
            expect(() => hist.getPercentile(1.1)).toThrow("between 0.0 and 1.0");
        });
    });

    describe("Percentile Accuracy against Sorted Array Reference", () => {
        it("matches true mathematical percentiles within <= 0.8% relative error", () => {
            const hist = new LogarithmicHistogram();
            const samples: number[] = [];

            // Generate 10,000 synthetic latency samples with a realistic log-normal distribution
            // (Most between 5ms and 80ms, some between 100ms and 500ms, tail up to 3,000ms)
            for (let i = 0; i < 10_000; i++) {
                // Log-normal distribution: exp(mean + stdev * z)
                const u1 = Math.max(1e-9, Math.random());
                const u2 = Math.random();
                const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
                const val = Math.max(0.1, Math.exp(3.2 + 0.8 * z)); // median ≈ 24.5ms
                samples.push(val);
                hist.record(val);
            }

            // True reference values via TimSort
            samples.sort((a, b) => a - b);
            const getRefPercentile = (pct: number) => {
                const rank = Math.max(1, Math.ceil(pct * samples.length));
                return samples[rank - 1];
            };

            const refP50 = getRefPercentile(0.5);
            const refP90 = getRefPercentile(0.9);
            const refP95 = getRefPercentile(0.95);
            const refP99 = getRefPercentile(0.99);

            const stats = hist.getStatistics();

            // Verify relative error |Histogram - Reference| / Reference <= 0.008 (0.8%)
            const errorP50 = Math.abs(stats.p50! - refP50) / refP50;
            const errorP90 = Math.abs(stats.p90! - refP90) / refP90;
            const errorP95 = Math.abs(stats.p95! - refP95) / refP95;
            const errorP99 = Math.abs(stats.p99! - refP99) / refP99;

            expect(errorP50).toBeLessThanOrEqual(0.008);
            expect(errorP90).toBeLessThanOrEqual(0.008);
            expect(errorP95).toBeLessThanOrEqual(0.008);
            expect(errorP99).toBeLessThanOrEqual(0.008);

            // Exact arithmetic average match
            const refAvg = samples.reduce((s, v) => s + v, 0) / samples.length;
            expect(Math.abs(stats.average! - refAvg) / refAvg).toBeLessThan(1e-6);
        });
    });

    describe("Boundary & Extreme Values", () => {
        it("handles sub-millisecond values (< 0.1ms) without underflow errors", () => {
            const hist = new LogarithmicHistogram();
            hist.record(0.02);
            hist.record(0.05);

            expect(hist.getMin()).toBe(0.02);
            expect(hist.getMax()).toBe(0.05);
            expect(hist.getAverage()).toBeCloseTo(0.035, 4);
        });

        it("handles extreme values (> 120,000ms) in overflow bucket without crash", () => {
            const hist = new LogarithmicHistogram();
            hist.record(150_000);
            hist.record(300_000);

            expect(hist.getMin()).toBe(150_000);
            expect(hist.getMax()).toBe(300_000);
            expect(hist.getPercentile(0.99)).toBe(120_000);
        });
    });

    describe("Memory Footprint & Performance Benchmark", () => {
        it("verifies constant memory footprint is under 10 KB", () => {
            const bytes = LogarithmicHistogram.getMemoryFootprintBytes();
            expect(bytes).toBe(7304); // 1,826 buckets * 4 bytes = 7,304 bytes (~7.13 KB)
        });

        it("benchmarks 1,000,000 insertions at high speed", () => {
            const hist = new LogarithmicHistogram();
            const start = performance.now();

            for (let i = 0; i < 1_000_000; i++) {
                // Pseudo-random value without Math.random() overhead in bench
                const val = (i % 500) + 0.5;
                hist.record(val);
            }

            const elapsed = performance.now() - start;
            expect(hist.getValueCount()).toBe(1_000_000);

            // 1,000,000 operations should complete in under 250ms (typically < 60ms)
            expect(elapsed).toBeLessThan(250);
        });
    });
});
