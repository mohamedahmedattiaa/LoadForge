import type { IReportBuilder } from "./metrics-port.js";
import type {
    AdaptiveExecutionSummary,
    LoadTestReport,
    MetricsSummary,
} from "./metrics-types.js";
import { calculateLatencyStatistics } from "./statistics-service.js";

export class ReportBuilder implements IReportBuilder {
    build(
        summary: MetricsSummary,
        latencies: readonly number[],
        durationMs: number,
        adaptive?: AdaptiveExecutionSummary
    ): LoadTestReport {
        const latency = calculateLatencyStatistics(latencies);

        const requestsPerSecond =
            durationMs > 0
                ? summary.totalRequests / (durationMs / 1000)
                : null;

        return {
            totalRequests: summary.totalRequests,
            successfulRequests: summary.successfulRequests,
            failedRequests: summary.failedRequests,

            httpErrors: summary.httpErrors,
            networkErrors: summary.networkErrors,
            timeouts: summary.timeouts,

            durationMs,
            requestsPerSecond,

            statusCodes: Object.fromEntries(summary.statusCodes),

            latency,

            ...(adaptive !== undefined ? { adaptive } : {}),
        };
    }
}
