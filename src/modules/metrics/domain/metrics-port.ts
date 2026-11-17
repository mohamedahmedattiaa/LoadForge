import type { GeneratorHealthSnapshot } from "./generator-health-port.js";
import type { ThroughputSummary } from "./time-bucket-port.js";
import type {
    AdaptiveExecutionSummary,
    DualLatencyStatistics,
    LatencyStatistics,
    LoadTestReport,
    MetricsSummary,
    RequestExecutionRecord,
    RequestMetric,
} from "./metrics-types.js";

export interface IMetricsCollector {
    readonly failedRequests: number;

    /** Legacy single-metric record */
    record(metric: RequestMetric): void;

    /** High-precision timeline execution record */
    recordExecution?(record: RequestExecutionRecord): void;

    /** Record request dropped due to generator backpressure */
    recordDropped?(dropTimeMs: number): void;

    getSummary(): MetricsSummary;
    getLatencies(): number[];

    /** Fast O(B) quantile lookup directly from histogram (no sorting) */
    getStatistics(): LatencyStatistics;

    /** Dual latency stats (service time vs scheduled time vs queue delay) */
    getDualLatencyStatistics?(): DualLatencyStatistics;

    /** Steady-state 1-second throughput buckets and summary */
    getThroughputSummary?(referenceTimeMs?: number): ThroughputSummary;

    /** Real-time generator health metrics (event loop delay, CPU, memory) */
    getHealthSnapshot?(): GeneratorHealthSnapshot;

    startHealthMonitoring?(): void;
    stopHealthMonitoring?(): void;
}

export interface IMetricsCollectorFactory {
    create(): IMetricsCollector;
}

export interface IReportBuilder {
    build(
        summary: MetricsSummary,
        latencies: readonly number[],
        durationMs: number,
        adaptive?: AdaptiveExecutionSummary,
        throughput?: ThroughputSummary,
        generatorHealth?: GeneratorHealthSnapshot,
        dualLatency?: DualLatencyStatistics
    ): LoadTestReport;
}

export interface IReportFormatter {
    format(report: LoadTestReport): string;
}
