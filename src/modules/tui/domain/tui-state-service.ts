import { CAPACITY_DEFAULTS, REJECTION_MODE_DEFAULT_MAX_CONCURRENCY } from "../../capacity/application/capacity-defaults.js";
import { validateCapacityDiscoveryConfig } from "../../capacity/application/capacity-validation.js";
import type {
    CapacityDiscoveryConfig,
    CapacityStepResult,
} from "../../capacity/domain/capacity-types.js";
import type { HttpMethod } from "../../http/domain/http-types.js";
import type { LoadTestLiveSnapshot } from "../../load-test/application/load-test-port.js";
import { validateLoadTestConfig } from "../../load-test/application/load-test-validation.js";
import type { LoadTestConfig } from "../../load-test/domain/load-test-types.js";
import type {
    TuiAppState,
    TuiBodySource,
    TuiFormState,
    TuiHeaderEntry,
    TuiLiveState,
    TuiPreferences,
    TuiTestKind,
} from "./tui-types.js";

export const TUI_HTTP_METHODS: readonly HttpMethod[] = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
];

export const TUI_BODY_SOURCES: readonly TuiBodySource[] = [
    "manual",
    "file",
    "editor",
    "skip",
];

export const TUI_MAIN_MENU_ITEMS: ReadonlyArray<{
    id:
        | "new-load-test"
        | "capacity-discovery"
        | "previous-reports"
        | "configuration"
        | "about"
        | "exit";
    label: string;
}> = [
    { id: "new-load-test", label: "Start a new load test" },
    { id: "capacity-discovery", label: "Capacity Discovery" },
    { id: "previous-reports", label: "View previous reports" },
    { id: "configuration", label: "Configuration" },
    { id: "about", label: "About" },
    { id: "exit", label: "Exit" },
];

const MAX_LIVE_HISTORY_POINTS = 120;

export function createDefaultPreferences(): TuiPreferences {
    return {
        defaultMethod: "GET",
        defaultConcurrency: "auto",
        defaultTimeout: "auto",
        defaultWindowSeconds: "2",
        defaultCapacityMode: "sustained",
        autoSaveReports: true,
    };
}

export function createFormFromPreferences(
    preferences: TuiPreferences,
    testKind: TuiTestKind = "load-test"
): TuiFormState {
    return {
        testKind,
        method: preferences.defaultMethod,
        bodySource: preferences.defaultMethod === "GET" ? "skip" : "manual",
        bodyText: '{\n  "name": "LoadForge",\n  "sample": true\n}',
        bodyFilePath: "",
        url: "https://api.example.com/users",
        urlPristine: true,
        stopCondition: "duration",
        requests: "500",
        duration: "10",
        concurrency: preferences.defaultConcurrency,
        timeout: preferences.defaultTimeout,
        headers: [],
        capacityMode: preferences.defaultCapacityMode,
        capacityWindowSeconds: preferences.defaultWindowSeconds,
        startConcurrency: String(CAPACITY_DEFAULTS.initialConcurrency),
        maxConcurrency: String(CAPACITY_DEFAULTS.maxConcurrency),
        untilLimit: false,
        maxP95Ms: "",
    };
}

export function createInitialAppState(
    preferences: TuiPreferences = createDefaultPreferences()
): TuiAppState {
    const form = createFormFromPreferences(preferences);
    return {
        screen: "main-menu",
        menuIndex: 0,
        mainMenuTab: "details",
        bodyFocusIndex: 0,
        bodyOptionIndex: Math.max(0, TUI_BODY_SOURCES.indexOf(form.bodySource)),
        optionsFocusIndex: 0,
        headerEditDraft: "",
        isAddingHeader: false,
        historyIndex: 0,
        configFocusIndex: 0,
        validationError: null,
        statusMessage: null,
        preferences,
        form,
        live: null,
        results: null,
        savedReports: [],
    };
}

export function validateJsonBody(bodyText: string): {
    ok: boolean;
    message: string;
} {
    const trimmed = bodyText.trim();
    if (trimmed.length === 0) {
        return { ok: false, message: "Body is empty (choose Skip body or enter JSON)" };
    }

    try {
        JSON.parse(trimmed);
        return { ok: true, message: "OK" };
    } catch (error) {
        const reason =
            error instanceof Error ? error.message : "Invalid JSON syntax";
        return { ok: false, message: reason };
    }
}

export function parseHeaderLine(
    rawLine: string
): TuiHeaderEntry | null {
    const separator = rawLine.indexOf(":");
    if (separator <= 0) {
        return null;
    }

    const key = rawLine.slice(0, separator).trim();
    const value = rawLine.slice(separator + 1).trim();
    if (!key) {
        return null;
    }

    return { key, value };
}

function buildHeadersRecord(
    headers: readonly TuiHeaderEntry[]
): Record<string, string> | undefined {
    if (headers.length === 0) {
        return undefined;
    }

    const record: Record<string, string> = {};
    for (const entry of headers) {
        record[entry.key] = entry.value;
    }
    return record;
}

function resolveRequestBody(form: TuiFormState): string | undefined {
    if (
        form.method === "GET" ||
        form.method === "HEAD" ||
        form.bodySource === "skip"
    ) {
        return undefined;
    }

    return form.bodyText;
}

function parseAutoOrInt(raw: string): number | "auto" {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === "auto" || trimmed === "") {
        return "auto";
    }
    return Number(trimmed);
}

export function buildLoadTestConfigFromForm(
    form: TuiFormState
): LoadTestConfig {
    const rawHeaders = buildHeadersRecord(form.headers);
    const body = resolveRequestBody(form);

    const headers =
        body !== undefined &&
        rawHeaders?.["Content-Type"] === undefined &&
        rawHeaders?.["content-type"] === undefined
            ? { "Content-Type": "application/json", ...rawHeaders }
            : rawHeaders;

    const candidate = {
        url: form.url.trim(),
        method: form.method,
        headers,
        body,
        requests:
            form.stopCondition === "requests"
                ? Number(form.requests.trim())
                : undefined,
        duration:
            form.stopCondition === "duration"
                ? Number(form.duration.trim())
                : undefined,
        concurrency: parseAutoOrInt(form.concurrency),
        timeout: parseAutoOrInt(form.timeout),
        queueCapacity: 10000,
    };

    return validateLoadTestConfig(candidate);
}

export function buildCapacityConfigFromForm(
    form: TuiFormState
): CapacityDiscoveryConfig {
    const rawHeaders = buildHeadersRecord(form.headers);
    const body = resolveRequestBody(form);
    const headers =
        body !== undefined &&
        rawHeaders?.["Content-Type"] === undefined &&
        rawHeaders?.["content-type"] === undefined
            ? { "Content-Type": "application/json", ...rawHeaders }
            : rawHeaders;

    const maxConcurrency =
        form.untilLimit &&
        form.maxConcurrency.trim() === String(CAPACITY_DEFAULTS.maxConcurrency)
            ? REJECTION_MODE_DEFAULT_MAX_CONCURRENCY
            : Number(form.maxConcurrency.trim());

    const maxP95Trimmed = form.maxP95Ms.trim();

    return validateCapacityDiscoveryConfig({
        url: form.url.trim(),
        method: form.method,
        headers,
        body,
        mode: form.capacityMode,
        stepDurationSeconds: Number(form.capacityWindowSeconds.trim()),
        initialConcurrency: Number(form.startConcurrency.trim()),
        maxConcurrency,
        stepMultiplier: CAPACITY_DEFAULTS.stepMultiplier,
        stopPolicy: form.untilLimit ? "rejection" : "slo",
        maxErrorRate: CAPACITY_DEFAULTS.maxErrorRate,
        maxP95LatencyMs:
            maxP95Trimmed.length > 0 ? Number(maxP95Trimmed) : undefined,
        maxLatencyMultiplier: CAPACITY_DEFAULTS.maxLatencyMultiplier,
        stopOnRateLimit: CAPACITY_DEFAULTS.stopOnRateLimit,
        timeout: parseAutoOrInt(form.timeout),
        queueCapacity: CAPACITY_DEFAULTS.queueCapacity,
    });
}

export function createInitialLiveState(
    testKind: TuiTestKind
): TuiLiveState {
    return {
        startedAtMs: performance.now(),
        phase: testKind === "capacity" ? "discovering" : "probing_timeout",
        elapsedMs: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        instantRps: 0,
        avgLatencyMs: null,
        p95LatencyMs: null,
        errorRate: 0,
        currentConcurrency: 0,
        resolvedTimeoutMs: 0,
        historyRps: [],
        historyAvgLatency: [],
        historyP95Latency: [],
        historyErrorRate: [],
        capacitySteps: [],
        stepBaseRequests: 0,
        stepBaseSuccess: 0,
        stepBaseFailed: 0,
        stepHasLiveSamples: false,
        aborted: false,
    };
}

function appendCapped(list: readonly number[], value: number): number[] {
    const next = [...list, value];
    if (next.length > MAX_LIVE_HISTORY_POINTS) {
        return next.slice(next.length - MAX_LIVE_HISTORY_POINTS);
    }
    return next;
}

export function applyLiveLoadTestSnapshot(
    live: TuiLiveState,
    snapshot: LoadTestLiveSnapshot
): TuiLiveState {
    const shouldPushSample =
        snapshot.phase === "running" ||
        (snapshot.phase === "completing" &&
            (snapshot.totalRequests > live.totalRequests ||
                snapshot.instantRps > 0));

    return {
        ...live,
        phase: snapshot.phase,
        elapsedMs: snapshot.elapsedMs,
        targetDurationMs: snapshot.targetDurationMs,
        targetRequests: snapshot.targetRequests,
        totalRequests: snapshot.totalRequests,
        successfulRequests: snapshot.successfulRequests,
        failedRequests: snapshot.failedRequests,
        instantRps: snapshot.instantRps,
        avgLatencyMs: snapshot.avgLatencyMs,
        p95LatencyMs: snapshot.p95LatencyMs,
        errorRate: snapshot.errorRate,
        currentConcurrency: snapshot.currentConcurrency,
        resolvedTimeoutMs: snapshot.resolvedTimeoutMs,
        historyRps: shouldPushSample
            ? appendCapped(live.historyRps, snapshot.instantRps)
            : live.historyRps,
        historyAvgLatency: shouldPushSample
            ? appendCapped(live.historyAvgLatency, snapshot.avgLatencyMs ?? 0)
            : live.historyAvgLatency,
        historyP95Latency: shouldPushSample
            ? appendCapped(live.historyP95Latency, snapshot.p95LatencyMs ?? 0)
            : live.historyP95Latency,
        historyErrorRate: shouldPushSample
            ? appendCapped(live.historyErrorRate, snapshot.errorRate * 100)
            : live.historyErrorRate,
    };
}

export function applyCapacityLiveSnapshot(
    live: TuiLiveState,
    snapshot: LoadTestLiveSnapshot
): TuiLiveState {
    if (snapshot.phase === "probing_timeout") {
        return {
            ...live,
            elapsedMs: performance.now() - live.startedAtMs,
            currentConcurrency: snapshot.currentConcurrency || live.currentConcurrency,
            resolvedTimeoutMs: snapshot.resolvedTimeoutMs || live.resolvedTimeoutMs,
        };
    }

    const totalRequests = live.stepBaseRequests + snapshot.totalRequests;
    const successfulRequests =
        live.stepBaseSuccess + snapshot.successfulRequests;
    const failedRequests = live.stepBaseFailed + snapshot.failedRequests;
    const errorRate = totalRequests > 0 ? failedRequests / totalRequests : 0;
    const shouldPushSample =
        snapshot.phase === "running" ||
        totalRequests > live.totalRequests ||
        snapshot.instantRps > 0;

    return {
        ...live,
        phase: "discovering",
        elapsedMs: performance.now() - live.startedAtMs,
        totalRequests,
        successfulRequests,
        failedRequests,
        instantRps: snapshot.instantRps,
        avgLatencyMs: snapshot.avgLatencyMs,
        p95LatencyMs: snapshot.p95LatencyMs,
        errorRate,
        currentConcurrency:
            snapshot.currentConcurrency || live.currentConcurrency,
        resolvedTimeoutMs: snapshot.resolvedTimeoutMs || live.resolvedTimeoutMs,
        historyRps: shouldPushSample
            ? appendCapped(live.historyRps, snapshot.instantRps)
            : live.historyRps,
        historyAvgLatency: shouldPushSample
            ? appendCapped(live.historyAvgLatency, snapshot.avgLatencyMs ?? 0)
            : live.historyAvgLatency,
        historyP95Latency: shouldPushSample
            ? appendCapped(live.historyP95Latency, snapshot.p95LatencyMs ?? 0)
            : live.historyP95Latency,
        historyErrorRate: shouldPushSample
            ? appendCapped(live.historyErrorRate, snapshot.errorRate * 100)
            : live.historyErrorRate,
        stepHasLiveSamples: live.stepHasLiveSamples || shouldPushSample,
    };
}

export function applyCapacityStepToLiveState(
    live: TuiLiveState,
    step: CapacityStepResult
): TuiLiveState {
    const nextBaseRequests = live.stepBaseRequests + step.totalRequests;
    const nextBaseSuccess = live.stepBaseSuccess + step.successfulRequests;
    const nextBaseFailed = live.stepBaseFailed + step.failedRequests;
    const errorRate =
        nextBaseRequests > 0 ? nextBaseFailed / nextBaseRequests : 0;

    const pushSummarySample = !live.stepHasLiveSamples;

    return {
        ...live,
        phase: "discovering",
        elapsedMs: performance.now() - live.startedAtMs,
        totalRequests: nextBaseRequests,
        successfulRequests: nextBaseSuccess,
        failedRequests: nextBaseFailed,
        stepBaseRequests: nextBaseRequests,
        stepBaseSuccess: nextBaseSuccess,
        stepBaseFailed: nextBaseFailed,
        stepHasLiveSamples: false,
        instantRps: step.goodputRps,
        avgLatencyMs: step.p50LatencyMs,
        p95LatencyMs: step.p95LatencyMs,
        errorRate,
        currentConcurrency: step.concurrency,
        historyRps: pushSummarySample
            ? appendCapped(live.historyRps, step.goodputRps)
            : live.historyRps,
        historyAvgLatency: pushSummarySample
            ? appendCapped(live.historyAvgLatency, step.p50LatencyMs ?? 0)
            : live.historyAvgLatency,
        historyP95Latency: pushSummarySample
            ? appendCapped(live.historyP95Latency, step.p95LatencyMs ?? 0)
            : live.historyP95Latency,
        historyErrorRate: pushSummarySample
            ? appendCapped(live.historyErrorRate, step.errorRate * 100)
            : live.historyErrorRate,
        capacitySteps: [...live.capacitySteps, step],
    };
}

export type SetOptionsFieldId =
    | "url"
    | "method"
    | "edit-body"
    | "test-kind"
    | "stop-condition"
    | "requests"
    | "duration"
    | "concurrency"
    | "timeout"
    | "capacity-mode"
    | "capacity-window"
    | "start-concurrency"
    | "max-concurrency"
    | "until-limit"
    | "max-p95"
    | "add-header"
    | "start-test";

export function getSetOptionsFieldOrder(
    form: TuiFormState
): SetOptionsFieldId[] {
    const sharedTail: SetOptionsFieldId[] = ["timeout", "add-header", "start-test"];
    const supportsBody = form.method !== "GET" && form.method !== "HEAD";
    const baseHead: SetOptionsFieldId[] = supportsBody
        ? ["url", "method", "edit-body", "test-kind"]
        : ["url", "method", "test-kind"];

    if (form.testKind === "capacity") {
        return [
            ...baseHead,
            "capacity-mode",
            "until-limit",
            "capacity-window",
            "start-concurrency",
            "max-concurrency",
            "max-p95",
            ...sharedTail,
        ];
    }

    return [
        ...baseHead,
        "stop-condition",
        form.stopCondition === "requests" ? "requests" : "duration",
        "concurrency",
        ...sharedTail,
    ];
}
