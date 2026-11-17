import type { HttpMethod } from "../../http/domain/http-types.js";

export type CapacityStepVerdict = "healthy" | "degraded" | "saturated";

export type CapacityDiscoveryMode = "sustained" | "burst";

export type CapacityStopPolicy = "slo" | "rejection";

export type CapacityStopReason =
    | "rate_limited"
    | "server_errors"
    | "timeouts_exceeded"
    | "error_rate_exceeded"
    | "latency_slo_exceeded"
    | "throughput_plateau"
    | "max_concurrency_reached";

export interface CapacityDiscoveryConfig {
    url: string;
    method: HttpMethod;
    headers?: Record<string, string>;
    body?: string;
    mode: CapacityDiscoveryMode;
    stepDurationSeconds: number;
    initialConcurrency: number;
    maxConcurrency: number;
    stepMultiplier: number;
    stopPolicy: CapacityStopPolicy;
    maxErrorRate: number;
    maxP95LatencyMs?: number;
    maxLatencyMultiplier: number;
    stopOnRateLimit: boolean;
    timeout: number | "auto";
    queueCapacity: number;
}

export interface CapacityStepResult {
    stepNumber: number;
    concurrency: number;
    durationSeconds: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    errorRate: number;
    requestsPerSecond: number;
    goodputRps: number;
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
    p99LatencyMs: number | null;
    rateLimitedCount: number;
    http5xxCount: number;
    timeoutCount: number;
    networkErrorCount: number;
    serverErrorCount: number;
    verdict: CapacityStepVerdict;
    stopReason?: CapacityStopReason;
    reason?: string;
}

export interface CapacityReport {
    url: string;
    method: HttpMethod;
    mode: CapacityDiscoveryMode;
    stepDurationSeconds: number;
    stopPolicy: CapacityStopPolicy;
    resolvedTimeoutMs: number;
    baselineMinRttMs: number | null;
    baselineP95Ms: number | null;
    maxSafeConcurrency: number;
    maxSafeRps: number;
    breakingConcurrency: number | null;
    recommendedConcurrency: number;
    stopReason: CapacityStopReason;
    summary: string;
    steps: CapacityStepResult[];
}
