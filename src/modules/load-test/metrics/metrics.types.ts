
import { z } from "zod";

import { requestMetricSchema } from "./metrics.schema.js";

import type { LatencyStatistics } from "./statistics.js";

export type RequestMetric = z.infer<
    typeof requestMetricSchema
>;

export interface MetricsSummary {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;

    httpErrors: number;
    networkErrors: number;
    timeouts: number;

    statusCodes: Map<number, number>;
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
}
