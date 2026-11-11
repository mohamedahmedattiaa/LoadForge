import { describe, it, expect } from "vitest";
import {
    AdaptiveConcurrencyController,
    FixedConcurrencyController,
} from "../../src/modules/concurrency/domain/adaptive-concurrency-service.js";

describe("FixedConcurrencyController", () => {
    it("should always keep concurrency fixed", () => {
        const controller = new FixedConcurrencyController(15);

        expect(controller.getInitialConcurrency()).toBe(15);
        controller.recordSample({ durationMs: 500, isCongestionError: true });
        expect(controller.evaluate(15)).toBe(15);
        expect(controller.getSummary(15)).toEqual({
            mode: "fixed",
            initialConcurrency: 15,
            peakConcurrency: 15,
            finalConcurrency: 15,
            minObservedRttMs: null,
        });
    });
});

describe("AdaptiveConcurrencyController", () => {
    it("should ramp concurrency up when latency is close to baseline and no errors", () => {
        const controller = new AdaptiveConcurrencyController({
            initialConcurrency: 5,
            baselineMinRttMs: 50,
            minSamplesPerWindow: 5,
        });

        for (let i = 0; i < 5; i++) {
            controller.recordSample({
                durationMs: 55,
                isCongestionError: false,
            });
        }

        const next = controller.evaluate(5);
        expect(next).toBeGreaterThan(5);
        expect(controller.getSummary(next).peakConcurrency).toBe(next);
    });

    it("should hold concurrency steady in the saturation knee zone", () => {
        const controller = new AdaptiveConcurrencyController({
            initialConcurrency: 20,
            baselineMinRttMs: 100,
            minSamplesPerWindow: 5,
        });

        // 100 / 150 = 0.667 -> between 0.55 and 0.75 (Hold steady)
        for (let i = 0; i < 5; i++) {
            controller.recordSample({
                durationMs: 150,
                isCongestionError: false,
            });
        }

        const next = controller.evaluate(20);
        expect(next).toBe(20);
    });

    it("should scale down when queueing delay increases significantly", () => {
        const controller = new AdaptiveConcurrencyController({
            initialConcurrency: 20,
            baselineMinRttMs: 50,
            minSamplesPerWindow: 5,
        });

        // 50 / 200 = 0.25 < 0.55 -> scale down
        for (let i = 0; i < 5; i++) {
            controller.recordSample({
                durationMs: 200,
                isCongestionError: false,
            });
        }

        const next = controller.evaluate(20);
        expect(next).toBeLessThan(20);
        expect(next).toBe(17); // floor(20 * 0.85)
    });

    it("should perform multiplicative decrease on congestion errors", () => {
        const controller = new AdaptiveConcurrencyController({
            initialConcurrency: 30,
            minSamplesPerWindow: 5,
        });

        // 2 errors out of 5 = 40% > 5% threshold
        controller.recordSample({ durationMs: 40, isCongestionError: false });
        controller.recordSample({ durationMs: 40, isCongestionError: false });
        controller.recordSample({ durationMs: 40, isCongestionError: false });
        controller.recordSample({ durationMs: 1000, isCongestionError: true });
        controller.recordSample({ durationMs: 1000, isCongestionError: true });

        const next = controller.evaluate(30);
        expect(next).toBe(21); // floor(30 * 0.7)
    });

    it("should respect minConcurrency and maxConcurrency bounds", () => {
        const controller = new AdaptiveConcurrencyController({
            initialConcurrency: 2,
            minConcurrency: 2,
            maxConcurrency: 10,
            minSamplesPerWindow: 2,
        });

        controller.recordSample({ durationMs: 1000, isCongestionError: true });
        controller.recordSample({ durationMs: 1000, isCongestionError: true });
        expect(controller.evaluate(2)).toBe(2);

        const maxController = new AdaptiveConcurrencyController({
            initialConcurrency: 9,
            maxConcurrency: 10,
            baselineMinRttMs: 20,
            minSamplesPerWindow: 2,
        });
        maxController.recordSample({ durationMs: 20, isCongestionError: false });
        maxController.recordSample({ durationMs: 20, isCongestionError: false });
        expect(maxController.evaluate(9)).toBe(10);
    });

    it("should wait for minSamplesPerWindow unless all samples failed", () => {
        const controller = new AdaptiveConcurrencyController({
            initialConcurrency: 10,
            minSamplesPerWindow: 5,
        });

        controller.recordSample({ durationMs: 50, isCongestionError: false });
        controller.recordSample({ durationMs: 50, isCongestionError: false });

        // Only 2 samples -> hold steady
        expect(controller.evaluate(10)).toBe(10);
    });
});
