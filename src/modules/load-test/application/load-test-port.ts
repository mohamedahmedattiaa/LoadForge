import type { LoadTestReport } from "../../metrics/domain/metrics-types.js";
import type { LoadTestConfig } from "../domain/load-test-types.js";

export interface LoadTestLiveSnapshot {
    phase: "probing_timeout" | "running" | "completing";
    elapsedMs: number;
    targetDurationMs?: number;
    targetRequests?: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    instantRps: number;
    overallRps: number;
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
    errorRate: number;
    currentConcurrency: number;
    resolvedTimeoutMs: number;
}

export interface RunLoadTestExecutionOptions {
    onProgress?: (snapshot: LoadTestLiveSnapshot) => void;
    signal?: AbortSignal;
    progressIntervalMs?: number;
}

export interface IRunLoadTestUseCase {
    execute(
        config: LoadTestConfig,
        options?: RunLoadTestExecutionOptions
    ): Promise<LoadTestReport>;
}
