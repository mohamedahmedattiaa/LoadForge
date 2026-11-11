import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { CAPACITY_DEFAULTS } from "../../src/modules/capacity/application/capacity-defaults.js";
import { validateCapacityDiscoveryConfig } from "../../src/modules/capacity/application/capacity-validation.js";
import { DiscoverCapacityUseCase } from "../../src/modules/capacity/application/discover-capacity-use-case.js";
import { ConsoleCapacityFormatter } from "../../src/modules/capacity/presentation/console-capacity-formatter.js";
import { registerDiscoverCommand } from "../../src/modules/capacity/presentation/cli/discover-command.js";
import type { IRunLoadTestUseCase } from "../../src/modules/load-test/application/load-test-port.js";
import type { ITimeoutEstimator } from "../../src/modules/load-test/domain/timeout-estimator-port.js";
import type { LoadTestReport } from "../../src/modules/metrics/domain/metrics-types.js";

function createStepReport(params: {
    rps: number;
    durationSec: number;
    p95: number;
    status429?: number;
    status500?: number;
}): LoadTestReport {
    const total = Math.round(params.rps * params.durationSec);
    const rateLimited = params.status429 ?? 0;
    const err500 = params.status500 ?? 0;
    const failed = rateLimited + err500;
    const ok = Math.max(0, total - failed);

    const statusCodes: Record<string, number> = {};
    if (ok > 0) statusCodes["200"] = ok;
    if (rateLimited > 0) statusCodes["429"] = rateLimited;
    if (err500 > 0) statusCodes["500"] = err500;

    return {
        totalRequests: total,
        successfulRequests: ok,
        failedRequests: failed,
        httpErrors: failed,
        networkErrors: 0,
        timeouts: 0,
        durationMs: params.durationSec * 1000,
        requestsPerSecond: params.rps,
        statusCodes,
        latency: {
            min: 5,
            max: params.p95 + 10,
            average: params.p95 * 0.6,
            p50: params.p95 * 0.5,
            p90: params.p95 * 0.9,
            p95: params.p95,
            p99: params.p95 + 5,
        },
    };
}

describe("DiscoverCapacityUseCase", () => {
    it("estimates timeout once, discovers breaking point with binary refinement, and emits progress", async () => {
        const estimateMock = vi.fn().mockResolvedValue({
            timeoutMs: 2400,
            baselineMinRttMs: 14,
            probesSent: 3,
            probesSucceeded: 3,
            probesFailed: 0,
        });

        const timeoutEstimator: ITimeoutEstimator = {
            estimate: estimateMock,
        };

        // Server breaks above 25 concurrent users (returns 429 rate limits).
        const runMock = vi.fn().mockImplementation(async (cfg) => {
            const c = cfg.concurrency as number;
            const dur = cfg.duration as number;
            if (c > 25) {
                return createStepReport({
                    rps: c * 15,
                    durationSec: dur,
                    p95: 45,
                    status429: 15,
                });
            }

            return createStepReport({
                rps: c * 20,
                durationSec: dur,
                p95: 18 + c * 0.5,
            });
        });

        const runLoadTestUseCase: IRunLoadTestUseCase = {
            execute: runMock,
        };

        const useCase = new DiscoverCapacityUseCase({
            runLoadTestUseCase,
            timeoutEstimator,
        });

        const progressEvents: number[] = [];
        const report = await useCase.execute(
            {
                url: "https://api.example.com/users",
                ...CAPACITY_DEFAULTS,
                stepDurationSeconds: 1,
                initialConcurrency: 5,
                maxConcurrency: 100,
            },
            (step) => {
                progressEvents.push(step.concurrency);
            }
        );

        expect(estimateMock).toHaveBeenCalledOnce();
        expect(runMock).toHaveBeenCalledWith(
            expect.objectContaining({
                timeout: 2400,
                duration: 1,
            })
        );

        // Escalated: 5 -> 10 -> 20 -> 40 (429), refined: 30 (429) -> 25 (ok) -> 27 (429)
        expect(progressEvents).toEqual([5, 10, 20, 40, 30, 25, 27]);
        expect(report.maxSafeConcurrency).toBe(25);
        expect(report.maxSafeRps).toBe(500);
        expect(report.breakingConcurrency).toBe(27);
        expect(report.recommendedConcurrency).toBe(20);
        expect(report.stopReason).toBe("rate_limited");
        expect(report.resolvedTimeoutMs).toBe(2400);
        expect(report.baselineMinRttMs).toBe(14);

        const formatted = new ConsoleCapacityFormatter().format(report);
        expect(formatted).toContain("LOADFORGE CAPACITY REPORT");
        expect(formatted).toContain("Max Safe Users:     25 concurrent");
        expect(formatted).toContain("Max Users / sec:    500.0 req/s (Peak Safe RPS)");
    });

    it("stops cleanly at maxConcurrency when server remains healthy throughout", async () => {
        const useCase = new DiscoverCapacityUseCase({
            runLoadTestUseCase: {
                execute: vi.fn().mockImplementation(async (cfg) =>
                    createStepReport({
                        rps: (cfg.concurrency as number) * 10,
                        durationSec: cfg.duration as number,
                        p95: 20,
                    })
                ),
            },
            timeoutEstimator: {
                estimate: vi.fn().mockResolvedValue({
                    timeoutMs: 3000,
                    baselineMinRttMs: 10,
                    probesSent: 3,
                    probesSucceeded: 3,
                    probesFailed: 0,
                }),
            },
        });

        const report = await useCase.execute({
            url: "https://api.example.com/health",
            ...CAPACITY_DEFAULTS,
            stepDurationSeconds: 1,
            initialConcurrency: 5,
            maxConcurrency: 20,
            timeout: 1500,
        });

        expect(report.maxSafeConcurrency).toBe(20);
        expect(report.breakingConcurrency).toBeNull();
        expect(report.stopReason).toBe("max_concurrency_reached");
        expect(report.resolvedTimeoutMs).toBe(1500);
    });

    it("rejects invalid capacity discovery configs", () => {
        expect(() =>
            validateCapacityDiscoveryConfig({
                url: "ftp://invalid.com",
                ...CAPACITY_DEFAULTS,
            })
        ).toThrow("Only HTTP and HTTPS URLs are supported");

        expect(() =>
            validateCapacityDiscoveryConfig({
                url: "https://example.com",
                ...CAPACITY_DEFAULTS,
                initialConcurrency: 50,
                maxConcurrency: 20,
            })
        ).toThrow(
            "Max concurrency must be greater than or equal to initial concurrency"
        );

        expect(() =>
            validateCapacityDiscoveryConfig({
                url: "https://example.com",
                ...CAPACITY_DEFAULTS,
                maxErrorRate: 1.5,
            })
        ).toThrow("Max error rate must be between 0 and 1");
    });

    it("parses and executes the CLI discover command with custom window and flags", async () => {
        const executeMock = vi.fn().mockResolvedValue({
            url: "https://example.com",
            method: "POST",
            stepDurationSeconds: 5,
            stopPolicy: "slo",
            resolvedTimeoutMs: 2000,
            baselineMinRttMs: 12,
            baselineP95Ms: 20,
            maxSafeConcurrency: 40,
            maxSafeRps: 400,
            breakingConcurrency: 80,
            recommendedConcurrency: 32,
            stopReason: "server_errors",
            summary: "Server safely handles up to 40 concurrent users.",
            steps: [],
        });

        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

        const program = new Command();
        registerDiscoverCommand(
            program,
            { execute: executeMock },
            new ConsoleCapacityFormatter()
        );

        await program.parseAsync([
            "node",
            "loadforge",
            "discover",
            "--url",
            "https://example.com",
            "--method",
            "post",
            "--window",
            "5",
            "--start-concurrency",
            "10",
            "--max-concurrency",
            "100",
            "--max-p95",
            "300",
            "--no-stop-on-rate-limit",
        ]);

        expect(executeMock).toHaveBeenCalledWith(
            expect.objectContaining({
                url: "https://example.com",
                method: "POST",
                stepDurationSeconds: 5,
                stopPolicy: "slo",
                initialConcurrency: 10,
                maxConcurrency: 100,
                maxP95LatencyMs: 300,
                stopOnRateLimit: false,
            }),
            expect.any(Function)
        );
        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining("LOADFORGE CAPACITY REPORT")
        );
    });

    it("enables rejection stopPolicy and higher default ceiling when --until-limit is passed", async () => {
        const executeMock = vi.fn().mockResolvedValue({
            url: "https://example.com",
            method: "GET",
            stepDurationSeconds: 1,
            stopPolicy: "rejection",
            resolvedTimeoutMs: 2000,
            baselineMinRttMs: 10,
            baselineP95Ms: 15,
            maxSafeConcurrency: 60,
            maxSafeRps: 600,
            breakingConcurrency: 80,
            recommendedConcurrency: 48,
            stopReason: "rate_limited",
            summary: "Rate limited at 80.",
            steps: [],
        });

        vi.spyOn(console, "log").mockImplementation(() => {});

        const program = new Command();
        registerDiscoverCommand(
            program,
            { execute: executeMock },
            new ConsoleCapacityFormatter()
        );

        await program.parseAsync([
            "node",
            "loadforge",
            "discover",
            "--url",
            "https://example.com",
            "--window",
            "1",
            "--until-limit",
        ]);

        expect(executeMock).toHaveBeenCalledWith(
            expect.objectContaining({
                url: "https://example.com",
                stepDurationSeconds: 1,
                stopPolicy: "rejection",
                maxConcurrency: 2000,
            }),
            expect.any(Function)
        );
    });

    it("executes burst mode by firing exact simultaneous request batches and supports --mode burst CLI flag", async () => {
        const runMock = vi.fn().mockImplementation(async (cfg) => {
            const batch = cfg.requests as number;
            const rateLimited = batch > 25 ? 10 : 0;
            return createStepReport({
                rps: batch * 2,
                durationSec: 0.5,
                p95: 35,
                status429: rateLimited,
            });
        });

        const useCase = new DiscoverCapacityUseCase({
            runLoadTestUseCase: { execute: runMock },
            timeoutEstimator: {
                estimate: vi.fn().mockResolvedValue({
                    timeoutMs: 2000,
                    baselineMinRttMs: 12,
                    probesSent: 3,
                    probesSucceeded: 3,
                    probesFailed: 0,
                }),
            },
        });

        const report = await useCase.execute({
            url: "https://api.example.com/burst",
            ...CAPACITY_DEFAULTS,
            mode: "burst",
            stepDurationSeconds: 1,
            initialConcurrency: 5,
            maxConcurrency: 100,
        });

        expect(runMock).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                requests: 5,
                concurrency: 5,
            })
        );
        expect(runMock.mock.calls[0][0].duration).toBeUndefined();
        expect(report.mode).toBe("burst");
        expect(report.maxSafeConcurrency).toBe(25);
        expect(report.breakingConcurrency).toBe(27);

        const cliMock = vi.fn().mockResolvedValue(report);
        vi.spyOn(console, "log").mockImplementation(() => {});
        const program = new Command();
        registerDiscoverCommand(
            program,
            { execute: cliMock },
            new ConsoleCapacityFormatter()
        );

        await program.parseAsync([
            "node",
            "loadforge",
            "discover",
            "--url",
            "https://api.example.com/burst",
            "--mode",
            "burst",
            "--window",
            "1",
        ]);

        expect(cliMock).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: "burst",
                stepDurationSeconds: 1,
            }),
            expect.any(Function)
        );
    });
});
