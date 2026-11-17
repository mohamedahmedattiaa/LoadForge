import { afterEach, describe, expect, it } from "vitest";
import {
    applyCapacityStepToLiveState,
    applyLiveLoadTestSnapshot,
    createInitialAppState,
    createInitialLiveState,
} from "../../src/modules/tui/domain/tui-state-service.js";
import type { TuiAppState } from "../../src/modules/tui/domain/tui-types.js";
import { renderTuiScreen } from "../../src/modules/tui/presentation/tui-renderer.js";

function stripAnsi(text: string): string {
    return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

describe("renderTuiScreen", () => {
    const previousNoColor = process.env.NO_COLOR;

    afterEach(() => {
        if (previousNoColor === undefined) {
            delete process.env.NO_COLOR;
        } else {
            process.env.NO_COLOR = previousNoColor;
        }
    });

    it("renders all 8 TUI screens cleanly at 80x24 and 110x34 without throwing", () => {
        process.env.NO_COLOR = "1";

        const base = createInitialAppState();
        const screens: Array<{ name: string; state: TuiAppState; expected: string }> = [
            {
                name: "main-menu",
                state: { ...base, screen: "main-menu" },
                expected: "Start a new load test",
            },
            {
                name: "configure-body",
                state: {
                    ...base,
                    screen: "configure-body",
                    form: { ...base.form, method: "POST", bodySource: "manual" },
                },
                expected: "Request Body",
            },
            {
                name: "set-options-load",
                state: { ...base, screen: "set-options" },
                expected: "Start Test",
            },
            {
                name: "set-options-capacity",
                state: {
                    ...base,
                    screen: "set-options",
                    form: { ...base.form, testKind: "capacity" },
                },
                expected: "Capacity Discovery",
            },
            {
                name: "live-dashboard-load",
                state: {
                    ...base,
                    screen: "live-dashboard",
                    live: applyLiveLoadTestSnapshot(createInitialLiveState("load-test"), {
                        phase: "running",
                        elapsedMs: 1200,
                        targetRequests: 100,
                        totalRequests: 55,
                        successfulRequests: 54,
                        failedRequests: 1,
                        instantRps: 45.8,
                        avgLatencyMs: 21.4,
                        p95LatencyMs: 42.1,
                        errorRate: 0.018,
                        currentConcurrency: 10,
                        resolvedTimeoutMs: 2500,
                    }),
                },
                expected: "Live Telemetry",
            },
            {
                name: "live-dashboard-capacity",
                state: {
                    ...base,
                    screen: "live-dashboard",
                    form: { ...base.form, testKind: "capacity" },
                    live: applyCapacityStepToLiveState(createInitialLiveState("capacity"), {
                        stepNumber: 1,
                        concurrency: 5,
                        durationSeconds: 2,
                        totalRequests: 40,
                        successfulRequests: 40,
                        failedRequests: 0,
                        errorRate: 0,
                        requestsPerSecond: 20,
                        goodputRps: 20,
                        p50LatencyMs: 14,
                        p95LatencyMs: 28,
                        p99LatencyMs: 35,
                        rateLimitedCount: 0,
                        http5xxCount: 0,
                        timeoutCount: 0,
                        networkErrorCount: 0,
                        serverErrorCount: 0,
                        verdict: "healthy",
                    }),
                },
                expected: "P95 Latency:",
            },
            {
                name: "results-load-test",
                state: {
                    ...base,
                    screen: "results",
                    results: {
                        filePath: "/home/user/.loadforge/reports/report-1.json",
                        fromHistory: false,
                        aborted: false,
                        record: {
                            id: "rep-1",
                            kind: "load-test",
                            createdAt: new Date().toISOString(),
                            targetUrl: "https://api.example.com/users",
                            method: "POST",
                            report: {
                                totalRequests: 100,
                                successfulRequests: 100,
                                failedRequests: 0,
                                httpErrors: 0,
                                networkErrors: 0,
                                timeouts: 0,
                                durationMs: 950,
                                requestsPerSecond: 105.26,
                                statusCodes: { "200": 100 },
                                latency: {
                                    min: 8,
                                    max: 64,
                                    average: 19.2,
                                    p50: 17,
                                    p90: 36,
                                    p95: 44,
                                    p99: 58,
                                },
                            },
                        },
                    },
                },
                expected: "Load Test Report",
            },
            {
                name: "results-capacity",
                state: {
                    ...base,
                    screen: "results",
                    results: {
                        filePath: "/home/user/.loadforge/reports/cap-1.json",
                        fromHistory: false,
                        aborted: false,
                        record: {
                            id: "cap-1",
                            kind: "capacity",
                            createdAt: new Date().toISOString(),
                            targetUrl: "https://api.example.com/health",
                            method: "GET",
                            report: {
                                url: "https://api.example.com/health",
                                method: "GET",
                                mode: "sustained",
                                stepDurationSeconds: 2,
                                stopPolicy: "slo",
                                resolvedTimeoutMs: 1200,
                                baselineMinRttMs: 25,
                                baselineP95Ms: 42,
                                maxSafeConcurrency: 80,
                                maxSafeRps: 240.5,
                                breakingConcurrency: 160,
                                recommendedConcurrency: 64,
                                stopReason: "latency_slo_exceeded",
                                summary: "Server safely handles up to 80 concurrent users.",
                                steps: [
                                    {
                                        stepNumber: 1,
                                        concurrency: 10,
                                        durationSeconds: 2,
                                        totalRequests: 100,
                                        successfulRequests: 100,
                                        failedRequests: 0,
                                        errorRate: 0,
                                        requestsPerSecond: 50,
                                        goodputRps: 50,
                                        p50LatencyMs: 18,
                                        p95LatencyMs: 32,
                                        p99LatencyMs: 40,
                                        rateLimitedCount: 0,
                                        http5xxCount: 0,
                                        timeoutCount: 0,
                                        networkErrorCount: 0,
                                        serverErrorCount: 0,
                                        verdict: "healthy",
                                    },
                                ],
                            },
                        },
                    },
                },
                expected: "Capacity Discovery Report",
            },
            {
                name: "reports-history",
                state: { ...base, screen: "reports-history", savedReports: [] },
                expected: "Previous Reports",
            },
            {
                name: "configuration",
                state: { ...base, screen: "configuration" },
                expected: "Settings",
            },
            {
                name: "about",
                state: { ...base, screen: "about" },
                expected: "LoadForge",
            },
        ];

        for (const size of [
            { columns: 80, rows: 24 },
            { columns: 110, rows: 34 },
        ]) {
            for (const entry of screens) {
                const rawFrame = renderTuiScreen(entry.state, size);
                const plain = stripAnsi(rawFrame);
                expect(plain.length, `${entry.name} @ ${size.columns}x${size.rows}`).toBeGreaterThan(20);
                expect(plain, `${entry.name} missing marker`).toContain(entry.expected);
                expect(plain, `${entry.name} contains emojis`).not.toMatch(/[✨🚀🌐⚡⏱👥📈🛡🧱📏⏳📄💡⚠]/u);
                expect(plain, `${entry.name} contains legacy numbered badge`).not.toMatch(/\[\s*\d+\s*\]/);
                if (entry.name === "main-menu") {
                    expect(plain, "main-menu should not contain icons").not.toMatch(/[▶◈≡▪•✕]/u);
                    expect(plain, "main-menu should not show '1  LoadForge'").not.toContain("1  LoadForge");
                    expect(plain, "main-menu should not mention CEO").not.toContain("CEO");
                }
                expect(
                    rawFrame.split("\n").length,
                    `${entry.name} should fill full terminal height`
                ).toBe(size.rows);
                if (entry.name === "set-options-load" || entry.name === "set-options-capacity") {
                    expect(plain, `${entry.name} should hide Request Body for GET`).not.toContain("Request Body");
                }
                if (entry.name.startsWith("live-dashboard")) {
                    expect(plain, `${entry.name} missing Braille live graph`).toMatch(/[\u2800-\u28ff]/);
                }
            }
        }
    });
});
