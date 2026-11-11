import type { HttpRequest } from "../../http/domain/http-types.js";

export interface AdaptiveTimeoutOptions {
    probeCount?: number;
    probeTimeoutMs?: number;
    minTimeoutMs?: number;
    maxTimeoutMs?: number;
    fallbackTimeoutMs?: number;
    headroomMultiplier?: number;
}

export interface TimeoutEstimationResult {
    timeoutMs: number;
    baselineMinRttMs: number | null;
    baselineAvgRttMs: number | null;
    baselineJitterMs: number | null;
    probesSent: number;
    probesSucceeded: number;
    probesFailed: number;
}

export interface ITimeoutEstimator {
    estimate(
        baseRequest: Omit<HttpRequest, "timeout">
    ): Promise<TimeoutEstimationResult>;
}
