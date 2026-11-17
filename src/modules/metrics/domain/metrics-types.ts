import type { GeneratorHealthSnapshot } from "./generator-health-port.js";
import type { ThroughputSummary } from "./time-bucket-port.js";

export type RequestMetric =
    | {
          kind: "http";
          durationMs: number;
          statusCode: number;
      }
    | {
          kind: "network_error";
          durationMs: number;
      }
    | {
          kind: "timeout";
          durationMs: number;
      };

export type RequestOutcome =
    | { kind: "http"; statusCode: number }
    | { kind: "network_error"; errorCode?: string }
    | { kind: "timeout"; timeoutMs?: number };

export interface RequestExecutionRecord {
    readonly intendedScheduledTime: number; // t_sched
    readonly actualDispatchTime: number;    // t_dispatch
    readonly completionTime: number;        // t_complete
    readonly outcome: RequestOutcome;
}

export interface MetricsSummary {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;

    httpErrors: number;
    networkErrors: number;
    timeouts: number;

    statusCodes: Map<number, number>;
}

export interface LatencyStatistics {
    min: number | null;
    max: number | null;
    average: number | null;
    p50: number | null;
    p90: number | null;
    p95: number | null;
    p99: number | null;
}

export interface DualLatencyStatistics {
    service: LatencyStatistics;
    scheduled: LatencyStatistics;
    queueDelay: LatencyStatistics;
}

export interface AdaptiveExecutionSummary {
    timeoutMode: "auto" | "fixed";
    resolvedTimeoutMs: number;
    concurrencyMode: "auto" | "fixed";
    initialConcurrency: number;
    peakConcurrency: number;
    finalConcurrency: number;
    baselineMinRttMs: number | null;
}

export interface LoadTestReport {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;

    httpErrors: number;
    networkErrors: number;
    timeouts: number;

    durationMs: number;
    requestsPerSecond: number | null;

    statusCodes: Record<string, number>;

    latency: LatencyStatistics;

    adaptive?: AdaptiveExecutionSummary;
    throughput?: ThroughputSummary;
    generatorHealth?: GeneratorHealthSnapshot;
    dualLatency?: DualLatencyStatistics;
}
