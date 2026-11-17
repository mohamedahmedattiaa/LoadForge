import type { LoadTestReport } from "../../metrics/domain/metrics-types.js";
import type {
    CapacityDiscoveryConfig,
    CapacityReport,
    CapacityStepResult,
    CapacityStepVerdict,
    CapacityStopReason,
} from "./capacity-types.js";

const DEFAULT_DYNAMIC_LATENCY_FLOOR_MS = 250;
const THROUGHPUT_DROP_THRESHOLD = 0.85;
const SHORT_WINDOW_DROP_THRESHOLD = 0.72;
const THROUGHPUT_STALL_GROWTH_THRESHOLD = 1.03;
const LATENCY_GROWTH_KNEE_FACTOR = 1.5;
const MIN_KNEE_LATENCY_MS = 50;
const RECOMMENDED_HEADROOM_FACTOR = 0.8;
const MAX_REFINEMENT_PROBES = 3;

export interface EvaluateStepInput {
    stepNumber: number;
    concurrency: number;
    report: LoadTestReport;
    config: CapacityDiscoveryConfig;
    baselineP95Ms: number | null;
    previousHealthyStep: CapacityStepResult | null;
}

export interface CapacitySearchState {
    phase: "escalating" | "refining" | "done";
    currentConcurrency: number;
    bestHealthyConcurrency: number;
    bestHealthyRps: number;
    bestHealthyStep: CapacityStepResult | null;
    breakingConcurrency: number | null;
    lastStopReason: CapacityStopReason | null;
    testedConcurrencies: Set<number>;
    refinementProbesRemaining: number;
}

function countServerHttpErrors(statusCodes: Record<string, number>): number {
    let total = 0;

    for (const [code, count] of Object.entries(statusCodes)) {
        const numericCode = Number(code);
        if (numericCode >= 500 && numericCode <= 599) {
            total += count;
        }
    }

    return total;
}

function resolveEffectiveMaxP95(
    config: CapacityDiscoveryConfig,
    baselineP95Ms: number | null
): number {
    if (config.maxP95LatencyMs !== undefined) {
        return config.maxP95LatencyMs;
    }

    if (baselineP95Ms !== null) {
        return Math.max(
            DEFAULT_DYNAMIC_LATENCY_FLOOR_MS,
            baselineP95Ms * config.maxLatencyMultiplier
        );
    }

    return Number.POSITIVE_INFINITY;
}

/**
 * Pure domain evaluation of one stepped load-test window against SLOs
 * (HTTP 429 rate-limits, 5xx/timeouts, error rate, p95 latency knee, throughput plateau).
 */
export function evaluateCapacityStep(
    input: EvaluateStepInput
): CapacityStepResult {
    const {
        stepNumber,
        concurrency,
        report,
        config,
        baselineP95Ms,
        previousHealthyStep,
    } = input;

    const durationSeconds = Math.max(report.durationMs / 1000, 0.001);
    const rateLimitedCount = report.statusCodes["429"] ?? 0;
    const http5xxCount = countServerHttpErrors(report.statusCodes);
    const timeoutCount = report.timeouts;
    const networkErrorCount = report.networkErrors;
    const serverErrorCount = http5xxCount + timeoutCount + networkErrorCount;

    const errorRate =
        report.totalRequests > 0
            ? report.failedRequests / report.totalRequests
            : 1;

    const requestsPerSecond =
        report.requestsPerSecond ?? report.totalRequests / durationSeconds;
    const goodputRps = report.successfulRequests / durationSeconds;
    const p95 = report.latency.p95;

    let verdict: CapacityStepVerdict = "healthy";
    let stopReason: CapacityStopReason | undefined;
    let reason: string | undefined;

    if (config.stopOnRateLimit && rateLimitedCount > 0) {
        verdict = "saturated";
        stopReason = "rate_limited";
        reason = `Server returned HTTP 429 (${rateLimitedCount}x)`;
    } else if (report.totalRequests === 0 || report.successfulRequests === 0) {
        verdict = "saturated";
        stopReason =
            timeoutCount > 0 && timeoutCount >= http5xxCount + networkErrorCount
                ? "timeouts_exceeded"
                : "server_errors";
        reason = `Zero successful requests completed (${report.failedRequests} failed)`;
    } else if (errorRate > config.maxErrorRate) {
        const isHeavyFailure =
            serverErrorCount > 0 &&
            errorRate >= Math.max(config.maxErrorRate * 2, 0.1);
        verdict = isHeavyFailure ? "saturated" : "degraded";
        if (
            timeoutCount > 0 &&
            timeoutCount >= http5xxCount + networkErrorCount &&
            timeoutCount >= report.failedRequests / 2
        ) {
            stopReason = "timeouts_exceeded";
        } else if (http5xxCount + networkErrorCount >= report.failedRequests / 2) {
            stopReason = "server_errors";
        } else {
            stopReason = "error_rate_exceeded";
        }
        reason = `Error rate ${(errorRate * 100).toFixed(1)}% exceeded limit ${(config.maxErrorRate * 100).toFixed(1)}%`;
    } else if (config.stopPolicy === "slo") {
        const effectiveMaxP95 = resolveEffectiveMaxP95(config, baselineP95Ms);
        const burstBudgetSeconds = config.stepDurationSeconds * 1.5;

        if (config.mode === "burst" && durationSeconds > burstBudgetSeconds) {
            verdict = "degraded";
            stopReason = "latency_slo_exceeded";
            reason = `Burst took ${durationSeconds.toFixed(2)}s (> ${burstBudgetSeconds.toFixed(2)}s budget for ${config.stepDurationSeconds}s window)`;
        } else if (p95 !== null && p95 > effectiveMaxP95) {
            verdict = "degraded";
            stopReason = "latency_slo_exceeded";
            reason = `p95 latency ${p95.toFixed(1)} ms exceeded threshold ${effectiveMaxP95.toFixed(1)} ms`;
        } else if (
            config.mode === "sustained" &&
            previousHealthyStep !== null &&
            concurrency > previousHealthyStep.concurrency
        ) {
            const dropRatio =
                config.stepDurationSeconds <= 2
                    ? SHORT_WINDOW_DROP_THRESHOLD
                    : THROUGHPUT_DROP_THRESHOLD;
            if (goodputRps < previousHealthyStep.goodputRps * dropRatio) {
                verdict = "degraded";
                stopReason = "throughput_plateau";
                reason = `Goodput dropped from ${previousHealthyStep.goodputRps.toFixed(1)} to ${goodputRps.toFixed(1)} req/s`;
            } else if (
                goodputRps <=
                    previousHealthyStep.goodputRps *
                        THROUGHPUT_STALL_GROWTH_THRESHOLD &&
                p95 !== null &&
                previousHealthyStep.p95LatencyMs !== null &&
                p95 >= previousHealthyStep.p95LatencyMs * LATENCY_GROWTH_KNEE_FACTOR &&
                p95 > MIN_KNEE_LATENCY_MS
            ) {
                verdict = "degraded";
                stopReason = "throughput_plateau";
                reason = `Goodput plateaued (${goodputRps.toFixed(1)} req/s) while p95 latency spiked`;
            }
        }
    }

    return {
        stepNumber,
        concurrency,
        durationSeconds,
        totalRequests: report.totalRequests,
        successfulRequests: report.successfulRequests,
        failedRequests: report.failedRequests,
        errorRate,
        requestsPerSecond,
        goodputRps,
        p50LatencyMs: report.latency.p50,
        p95LatencyMs: report.latency.p95,
        p99LatencyMs: report.latency.p99,
        rateLimitedCount,
        http5xxCount,
        timeoutCount,
        networkErrorCount,
        serverErrorCount,
        verdict,
        stopReason,
        reason,
    };
}

export function createInitialSearchState(
    config: CapacityDiscoveryConfig
): CapacitySearchState {
    return {
        phase: "escalating",
        currentConcurrency: Math.min(
            config.initialConcurrency,
            config.maxConcurrency
        ),
        bestHealthyConcurrency: 0,
        bestHealthyRps: 0,
        bestHealthyStep: null,
        breakingConcurrency: null,
        lastStopReason: null,
        testedConcurrencies: new Set<number>(),
        refinementProbesRemaining: MAX_REFINEMENT_PROBES,
    };
}

function tryEnterRefinement(
    state: CapacitySearchState
): CapacitySearchState {
    if (
        state.bestHealthyConcurrency === 0 ||
        state.breakingConcurrency === null
    ) {
        return { ...state, phase: "done" };
    }

    const low = state.bestHealthyConcurrency;
    const high = state.breakingConcurrency;
    const gapThreshold = Math.max(2, Math.floor(low * 0.1));
    const mid = Math.floor((low + high) / 2);

    if (
        state.refinementProbesRemaining <= 0 ||
        high - low <= gapThreshold ||
        mid <= low ||
        state.testedConcurrencies.has(mid)
    ) {
        return { ...state, phase: "done" };
    }

    return {
        ...state,
        phase: "refining",
        currentConcurrency: mid,
        refinementProbesRemaining: state.refinementProbesRemaining - 1,
    };
}

/**
 * Advances the two-phase capacity search:
 * 1) Exponential escalation until first breaking/degraded point or maxConcurrency.
 * 2) Bounded binary-search refinement between best healthy concurrency and breaking concurrency.
 */
export function advanceCapacitySearch(
    state: CapacitySearchState,
    step: CapacityStepResult,
    config: CapacityDiscoveryConfig
): CapacitySearchState {
    const tested = new Set(state.testedConcurrencies);
    tested.add(step.concurrency);

    if (step.verdict === "healthy") {
        const nextBestConcurrency = Math.max(
            state.bestHealthyConcurrency,
            step.concurrency
        );
        const nextBestRps = Math.max(state.bestHealthyRps, step.goodputRps);
        const nextBestStep =
            step.concurrency >= state.bestHealthyConcurrency
                ? step
                : state.bestHealthyStep;

        const updated: CapacitySearchState = {
            ...state,
            testedConcurrencies: tested,
            bestHealthyConcurrency: nextBestConcurrency,
            bestHealthyRps: nextBestRps,
            bestHealthyStep: nextBestStep,
        };

        if (state.phase === "refining") {
            return tryEnterRefinement(updated);
        }

        if (step.concurrency >= config.maxConcurrency) {
            return {
                ...updated,
                phase: "done",
                lastStopReason: updated.lastStopReason ?? "max_concurrency_reached",
            };
        }

        const nextEscalated = Math.min(
            config.maxConcurrency,
            Math.max(
                step.concurrency + 1,
                Math.round(step.concurrency * config.stepMultiplier)
            )
        );

        if (tested.has(nextEscalated)) {
            return {
                ...updated,
                phase: "done",
                lastStopReason: updated.lastStopReason ?? "max_concurrency_reached",
            };
        }

        return {
            ...updated,
            currentConcurrency: nextEscalated,
        };
    }

    const narrowedBreaking =
        state.breakingConcurrency === null
            ? step.concurrency
            : Math.min(state.breakingConcurrency, step.concurrency);

    const updated: CapacitySearchState = {
        ...state,
        testedConcurrencies: tested,
        breakingConcurrency: narrowedBreaking,
        lastStopReason: step.stopReason ?? state.lastStopReason ?? "server_errors",
    };

    return tryEnterRefinement(updated);
}

export function computeRecommendedConcurrency(
    maxSafeConcurrency: number
): number {
    if (maxSafeConcurrency <= 0) {
        return 0;
    }

    return Math.max(1, Math.floor(maxSafeConcurrency * RECOMMENDED_HEADROOM_FACTOR));
}

function formatStopReasonLabel(stopReason: CapacityStopReason): string {
    switch (stopReason) {
        case "rate_limited":
            return "HTTP 429 rate limiting";
        case "server_errors":
            return "server 5xx / network errors";
        case "timeouts_exceeded":
            return "client request timeouts exceeded";
        case "error_rate_exceeded":
            return "error rate SLO exceeded";
        case "latency_slo_exceeded":
            return "latency / window SLO exceeded";
        case "throughput_plateau":
            return "throughput plateau / saturation";
        case "max_concurrency_reached":
            return "configured max concurrency reached";
    }
}

export function buildCapacitySummary(params: {
    mode: CapacityDiscoveryConfig["mode"];
    maxSafeConcurrency: number;
    maxSafeRps: number;
    breakingConcurrency: number | null;
    recommendedConcurrency: number;
    stepDurationSeconds: number;
    initialConcurrency: number;
    stopReason: CapacityStopReason;
}): string {
    const {
        mode,
        maxSafeConcurrency,
        maxSafeRps,
        breakingConcurrency,
        recommendedConcurrency,
        stepDurationSeconds,
        initialConcurrency,
        stopReason,
    } = params;

    const reasonLabel = formatStopReasonLabel(stopReason);
    const loadNoun = mode === "burst" ? "burst users" : "concurrent users";

    if (maxSafeConcurrency === 0) {
        const atConcurrency = breakingConcurrency ?? initialConcurrency;
        return `Target degraded or rejected traffic starting at ${atConcurrency} ${loadNoun} (${reasonLabel}). Lower --start-concurrency or inspect server limits.`;
    }

    if (breakingConcurrency !== null) {
        const scope =
            mode === "burst"
                ? `in ${stepDurationSeconds}s burst (peak ${maxSafeRps.toFixed(1)} users/sec)`
                : `(~${maxSafeRps.toFixed(1)} users/sec over ${stepDurationSeconds}s windows)`;
        return `Server safely handles up to ${maxSafeConcurrency} ${loadNoun} ${scope}. Degradation began at ${breakingConcurrency} ${loadNoun} (${reasonLabel}). Recommended production target: ${recommendedConcurrency} ${loadNoun} (20% headroom).`;
    }

    return `Server remained healthy up to the configured ceiling of ${maxSafeConcurrency} ${loadNoun} (~${maxSafeRps.toFixed(1)} users/sec). Increase --max-concurrency to locate the breaking point.`;
}

export function assembleCapacityReport(params: {
    config: CapacityDiscoveryConfig;
    resolvedTimeoutMs: number;
    baselineMinRttMs: number | null;
    baselineP95Ms: number | null;
    state: CapacitySearchState;
    steps: CapacityStepResult[];
}): CapacityReport {
    const {
        config,
        resolvedTimeoutMs,
        baselineMinRttMs,
        baselineP95Ms,
        state,
        steps,
    } = params;

    const maxSafeConcurrency = state.bestHealthyConcurrency;
    const maxSafeRps = state.bestHealthyRps;
    const breakingConcurrency = state.breakingConcurrency;
    const recommendedConcurrency =
        computeRecommendedConcurrency(maxSafeConcurrency);
    const stopReason: CapacityStopReason =
        state.lastStopReason ?? "max_concurrency_reached";

    const summary = buildCapacitySummary({
        mode: config.mode,
        maxSafeConcurrency,
        maxSafeRps,
        breakingConcurrency,
        recommendedConcurrency,
        stepDurationSeconds: config.stepDurationSeconds,
        initialConcurrency: config.initialConcurrency,
        stopReason,
    });

    return {
        url: config.url,
        method: config.method,
        mode: config.mode,
        stepDurationSeconds: config.stepDurationSeconds,
        stopPolicy: config.stopPolicy,
        resolvedTimeoutMs,
        baselineMinRttMs,
        baselineP95Ms,
        maxSafeConcurrency,
        maxSafeRps,
        breakingConcurrency,
        recommendedConcurrency,
        stopReason,
        summary,
        steps,
    };
}
