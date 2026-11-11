import type {
    AdaptiveTimeoutOptions,
    TimeoutEstimationResult,
} from "./timeout-estimator-port.js";

export const DEFAULT_ADAPTIVE_TIMEOUT_OPTIONS: Required<AdaptiveTimeoutOptions> = {
    probeCount: 5,
    probeTimeoutMs: 10_000,
    minTimeoutMs: 1_000,
    maxTimeoutMs: 30_000,
    fallbackTimeoutMs: 10_000,
    headroomMultiplier: 4,
};

/**
 * Pure domain policy: computes adaptive timeout from RTT probe samples
 * combining RFC 6298 (SRTT + 4 * RTTVAR) and a load-headroom multiplier.
 */
export function calculateAdaptiveTimeout(
    rttSamples: readonly number[],
    probesSent: number,
    probesFailed: number,
    options: Required<AdaptiveTimeoutOptions> = DEFAULT_ADAPTIVE_TIMEOUT_OPTIONS
): TimeoutEstimationResult {
    if (rttSamples.length === 0) {
        return {
            timeoutMs: options.fallbackTimeoutMs,
            baselineMinRttMs: null,
            baselineAvgRttMs: null,
            baselineJitterMs: null,
            probesSent,
            probesSucceeded: 0,
            probesFailed,
        };
    }

    const minRtt = Math.min(...rttSamples);
    const srtt =
        rttSamples.reduce((sum, rtt) => sum + rtt, 0) / rttSamples.length;

    const rttVar =
        rttSamples.reduce((sum, rtt) => sum + Math.abs(rtt - srtt), 0) /
        rttSamples.length;

    const rfc6298Estimate = srtt + 4 * rttVar;
    const headroomEstimate = srtt * options.headroomMultiplier;
    const rawTimeout = Math.max(rfc6298Estimate, headroomEstimate);

    const timeoutMs = Math.round(
        Math.min(
            options.maxTimeoutMs,
            Math.max(options.minTimeoutMs, rawTimeout)
        )
    );

    return {
        timeoutMs,
        baselineMinRttMs: minRtt,
        baselineAvgRttMs: srtt,
        baselineJitterMs: rttVar,
        probesSent,
        probesSucceeded: rttSamples.length,
        probesFailed,
    };
}
