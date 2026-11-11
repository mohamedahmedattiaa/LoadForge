import type {
    AdaptiveExecutionSummary,
    LoadTestReport,
    MetricsSummary,
    RequestMetric,
} from "./metrics-types.js";

export interface IMetricsCollector {
    readonly failedRequests: number;
    record(metric: RequestMetric): void;
    getSummary(): MetricsSummary;
    getLatencies(): number[];
}

export interface IMetricsCollectorFactory {
    create(): IMetricsCollector;
}

export interface IReportBuilder {
    build(
        summary: MetricsSummary,
        latencies: readonly number[],
        durationMs: number,
        adaptive?: AdaptiveExecutionSummary
    ): LoadTestReport;
}

export interface IReportFormatter {
    format(report: LoadTestReport): string;
}
