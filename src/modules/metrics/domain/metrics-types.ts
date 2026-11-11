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
}
