import { describe, expect, it } from "vitest";
import {
    applyCapacityStepToLiveState,
    applyLiveLoadTestSnapshot,
    buildCapacityConfigFromForm,
    buildLoadTestConfigFromForm,
    createDefaultPreferences,
    createFormFromPreferences,
    createInitialLiveState,
    getSetOptionsFieldOrder,
    parseHeaderLine,
    validateJsonBody,
} from "../../src/modules/tui/domain/tui-state-service.js";
import { parseRawKeys } from "../../src/modules/tui/infrastructure/ansi-terminal-driver.js";

describe("parseRawKeys", () => {
    it("parses arrows, home/end, navigation, enter, backspace, escape, ctrl hotkeys and UTF-8 chars", () => {
        const events = parseRawKeys(
            Buffer.from("\u001b[A\u001b[B\u001b[C\u001b[D\u001b[H\u001b[F\u001b[Z\u001b[3~\t\r\n\x7f \u0003\u0012\u0015ab\u001b")
        );

        expect(events).toEqual([
            { name: "up" },
            { name: "down" },
            { name: "right" },
            { name: "left" },
            { name: "home" },
            { name: "end" },
            { name: "shift-tab" },
            { name: "delete" },
            { name: "tab" },
            { name: "enter" },
            { name: "backspace" },
            { name: "space", char: " " },
            { name: "ctrl-c" },
            { name: "ctrl-r" },
            { name: "ctrl-u" },
            { name: "char", char: "a" },
            { name: "char", char: "b" },
            { name: "escape" },
        ]);
    });
});

describe("tui-state-service", () => {
    it("validates JSON bodies cleanly", () => {
        expect(validateJsonBody('{"ok": true}')).toEqual({
            ok: true,
            message: "OK",
        });
        expect(validateJsonBody("   ").ok).toBe(false);
        expect(validateJsonBody("{ bad json").ok).toBe(false);
    });

    it("parses HTTP headers in Key: Value format", () => {
        expect(
            parseHeaderLine("Authorization: Bearer abc:123")
        ).toEqual({
            key: "Authorization",
            value: "Bearer abc:123",
        });
        expect(parseHeaderLine("NoColon")).toBeNull();
        expect(parseHeaderLine(": empty-key")).toBeNull();
    });

    it("builds LoadTestConfig with auto Content-Type when POST body is active", () => {
        const form = createFormFromPreferences(createDefaultPreferences(), "load-test");
        form.method = "POST";
        form.bodySource = "manual";
        form.bodyText = '{"hello":"world"}';
        form.url = "https://api.example.com/items";
        form.stopCondition = "requests";
        form.requests = "250";
        form.concurrency = "25";
        form.timeout = "3000";
        form.headers = [{ key: "X-Custom", value: "1" }];

        const config = buildLoadTestConfigFromForm(form);
        expect(config.method).toBe("POST");
        expect(config.requests).toBe(250);
        expect(config.concurrency).toBe(25);
        expect(config.timeout).toBe(3000);
        expect(config.body).toBe('{"hello":"world"}');
        expect(config.headers).toEqual({
            "Content-Type": "application/json",
            "X-Custom": "1",
        });
    });

    it("builds CapacityDiscoveryConfig and resolves rejection ceiling when untilLimit is enabled", () => {
        const form = createFormFromPreferences(createDefaultPreferences(), "capacity");
        form.method = "GET";
        form.bodySource = "skip";
        form.url = "https://api.example.com/health";
        form.capacityMode = "burst";
        form.capacityWindowSeconds = "1";
        form.startConcurrency = "10";
        form.untilLimit = true;
        form.maxP95Ms = "900";

        const config = buildCapacityConfigFromForm(form);
        expect(config.mode).toBe("burst");
        expect(config.stopPolicy).toBe("rejection");
        expect(config.maxConcurrency).toBeGreaterThanOrEqual(320);
        expect(config.maxP95LatencyMs).toBe(900);
    });

    it("accumulates live load-test snapshots and capacity steps into bounded chart history", () => {
        let loadLive = createInitialLiveState("load-test");
        loadLive = applyLiveLoadTestSnapshot(loadLive, {
            phase: "running",
            elapsedMs: 500,
            targetRequests: 100,
            totalRequests: 40,
            successfulRequests: 39,
            failedRequests: 1,
            instantRps: 80,
            avgLatencyMs: 24.5,
            p95LatencyMs: 51.2,
            errorRate: 0.025,
            currentConcurrency: 10,
            resolvedTimeoutMs: 2000,
        });

        expect(loadLive.historyRps).toEqual([80]);
        expect(loadLive.historyP95Latency).toEqual([51.2]);
        expect(loadLive.historyErrorRate).toEqual([2.5]);

        let capLive = createInitialLiveState("capacity");
        capLive = applyCapacityStepToLiveState(capLive, {
            stepNumber: 1,
            concurrency: 5,
            durationSeconds: 1,
            totalRequests: 25,
            successfulRequests: 25,
            failedRequests: 0,
            errorRate: 0,
            requestsPerSecond: 25,
            goodputRps: 25,
            p50LatencyMs: 12,
            p95LatencyMs: 22,
            p99LatencyMs: 28,
            rateLimitedCount: 0,
            http5xxCount: 0,
            timeoutCount: 0,
            networkErrorCount: 0,
            serverErrorCount: 0,
            verdict: "healthy",
        });

        expect(capLive.totalRequests).toBe(25);
        expect(capLive.capacitySteps).toHaveLength(1);
        expect(capLive.currentConcurrency).toBe(5);
    });

    it("switches Set Options field ordering between load-test and capacity modes and hides body for GET", () => {
        const getLoadForm = createFormFromPreferences(createDefaultPreferences(), "load-test");
        const postCapForm = createFormFromPreferences(createDefaultPreferences(), "capacity");
        postCapForm.method = "POST";

        const getFields = getSetOptionsFieldOrder(getLoadForm);
        const capFields = getSetOptionsFieldOrder(postCapForm);

        expect(getFields).not.toContain("edit-body");
        expect(getFields).not.toContain("capacity-mode");
        expect(capFields).toContain("edit-body");
        expect(capFields.indexOf("until-limit")).toBe(
            capFields.indexOf("capacity-mode") + 1
        );
    });
});
