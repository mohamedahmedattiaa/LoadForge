import type { GeneratorHealthSnapshot } from "./generator-health-port.js";
import type { ThroughputSummary } from "./time-bucket-port.js";
import type { IReportBuilder } from "./metrics-port.js";
import type {
    AdaptiveExecutionSummary,
    DualLatencyStatistics,
    LoadTestReport,
    MetricsSummary,
} from "./metrics-types.js";
import { calculateLatencyStatistics } from "./statistics-service.js";

export class ReportBuilder implements IReportBuilder {
    build(
        summary: MetricsSummary,
        latencies: readonly number[],
        durationMs: number,
        adaptive?: AdaptiveExecutionSummary,
        throughput?: ThroughputSummary,
        generatorHealth?: GeneratorHealthSnapshot,
        dualLatency?: DualLatencyStatistics
    ): LoadTestReport {
        const latency = dualLatency?.service ?? calculateLatencyStatistics(latencies);

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
            ...(throughput !== undefined ? { throughput } : {}),
            ...(generatorHealth !== undefined ? { generatorHealth } : {}),
            ...(dualLatency !== undefined ? { dualLatency } : {}),
        };
    }
}
