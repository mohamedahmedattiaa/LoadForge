import { describe, it, expect, vi } from "vitest";
import { AdaptiveTimeoutEstimator } from "../../src/modules/load-test/application/adaptive-timeout-estimator.js";
import type { ITransportClient } from "../../src/modules/http/domain/transport-port.js";

describe("AdaptiveTimeoutEstimator", () => {
    const baseRequest = {
        url: "https://example.com",
        method: "GET" as const,
    };

    it("should clamp fast responses to minTimeoutMs floor", async () => {
        const transport: ITransportClient = {
            send: vi.fn().mockResolvedValue({
                statusCode: 200,
                headers: new Headers(),
                duration: 25,
            }),
        };

        const estimator = new AdaptiveTimeoutEstimator(transport);
        const result = await estimator.estimate(baseRequest);

        expect(result.timeoutMs).toBe(1_000);
        expect(result.baselineMinRttMs).toBe(25);
        expect(result.baselineAvgRttMs).toBe(25);
        expect(result.baselineJitterMs).toBe(0);
        expect(result.probesSent).toBe(5);
        expect(result.probesSucceeded).toBe(5);
        expect(result.probesFailed).toBe(0);
    });

    it("should scale timeout proportionally for slower endpoints", async () => {
        const durations = [800, 900, 1000, 1100, 1200];
        let idx = 0;

        const transport: ITransportClient = {
            send: vi.fn().mockImplementation(async () => ({
                statusCode: 200,
                headers: new Headers(),
                duration: durations[idx++],
            })),
        };

        const estimator = new AdaptiveTimeoutEstimator(transport);
        const result = await estimator.estimate(baseRequest);

        // avg = 1000, 4 * avg = 4000
        expect(result.baselineMinRttMs).toBe(800);
        expect(result.baselineAvgRttMs).toBe(1000);
        expect(result.timeoutMs).toBe(4000);
    });

    it("should factor high jitter via RFC 6298 when jitter exceeds headroom", async () => {
        const durations = [100, 100, 100, 100, 2600];
        let idx = 0;

        const transport: ITransportClient = {
            send: vi.fn().mockImplementation(async () => ({
                statusCode: 200,
                headers: new Headers(),
                duration: durations[idx++],
            })),
        };

        const estimator = new AdaptiveTimeoutEstimator(transport);
        const result = await estimator.estimate(baseRequest);

        // avg = 600, rttVar = (500*4 + 2000)/5 = 800 -> srtt + 4*rttVar = 3800 > 4*600 = 2400
        expect(result.timeoutMs).toBe(3800);
    });

    it("should clamp extremely slow endpoints to maxTimeoutMs ceiling", async () => {
        const transport: ITransportClient = {
            send: vi.fn().mockResolvedValue({
                statusCode: 200,
                headers: new Headers(),
                duration: 12_000,
            }),
        };

        const estimator = new AdaptiveTimeoutEstimator(transport);
        const result = await estimator.estimate(baseRequest);

        expect(result.timeoutMs).toBe(30_000);
    });

    it("should use fallbackTimeoutMs when all probes fail", async () => {
        const transport: ITransportClient = {
            send: vi.fn().mockRejectedValue(new Error("Connection refused")),
        };

        const estimator = new AdaptiveTimeoutEstimator(transport, {
            probeCount: 3,
            fallbackTimeoutMs: 7_500,
        });
        const result = await estimator.estimate(baseRequest);

        expect(result.timeoutMs).toBe(7_500);
        expect(result.baselineMinRttMs).toBeNull();
        expect(result.probesSent).toBe(3);
        expect(result.probesSucceeded).toBe(0);
        expect(result.probesFailed).toBe(3);
    });

    it("should compute estimate from successful probes when some fail", async () => {
        const transport: ITransportClient = {
            send: vi
                .fn()
                .mockRejectedValueOnce(new Error("Timeout"))
                .mockResolvedValue({
                    statusCode: 200,
                    headers: new Headers(),
                    duration: 1_500,
                }),
        };

        const estimator = new AdaptiveTimeoutEstimator(transport, {
            probeCount: 3,
        });
        const result = await estimator.estimate(baseRequest);

        expect(result.probesSucceeded).toBe(2);
        expect(result.probesFailed).toBe(1);
        expect(result.timeoutMs).toBe(6_000);
    });
});
