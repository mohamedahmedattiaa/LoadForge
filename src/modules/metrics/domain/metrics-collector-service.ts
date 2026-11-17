import type { GeneratorHealthSnapshot, IGeneratorHealthMonitor } from "./generator-health-port.js";
import type { ITimeBucketAggregator, ThroughputSummary } from "./time-bucket-port.js";
import type {
    IMetricsCollector,
    IMetricsCollectorFactory,
} from "./metrics-port.js";
import type {
    DualLatencyStatistics,
    LatencyStatistics,
    MetricsSummary,
    RequestExecutionRecord,
    RequestMetric,
} from "./metrics-types.js";
import { LogarithmicHistogram } from "../infrastructure/logarithmic-histogram.js";
import { TimeBucketAggregator } from "../infrastructure/time-bucket-aggregator.js";
import { NodeGeneratorHealthMonitor } from "../infrastructure/node-generator-health-monitor.js";

const DELAYED_TOLERANCE_THRESHOLD_MS = 10;

function validateMetric(metric: RequestMetric): void {
    if (
        typeof metric.durationMs !== "number" ||
        !Number.isFinite(metric.durationMs) ||
        metric.durationMs < 0
    ) {
        throw new Error(
            "Metric durationMs must be a non-negative finite number"
        );
    }

    if (metric.kind === "http") {
        if (
            typeof metric.statusCode !== "number" ||
            !Number.isInteger(metric.statusCode) ||
            metric.statusCode < 100 ||
            metric.statusCode > 599
        ) {
            throw new Error(
                "HTTP metric statusCode must be an integer between 100 and 599"
            );
        }
        return;
    }

    if (metric.kind !== "network_error" && metric.kind !== "timeout") {
        throw new Error("Invalid metric kind");
    }
}

export class MetricsCollector implements IMetricsCollector {
    private totalRequests = 0;
    private successfulRequests = 0;

    private httpErrors = 0;
    private networkErrors = 0;
    private timeouts = 0;

    private readonly latencies: number[] = [];
    private readonly statusCodes = new Map<number, number>();

    // Milestone 1: Fixed-memory histograms, time-buckets, and generator health
    private readonly serviceHistogram = new LogarithmicHistogram();
    private readonly scheduledHistogram = new LogarithmicHistogram();
    private readonly queueDelayHistogram = new LogarithmicHistogram();
    private readonly bucketAggregator: ITimeBucketAggregator = new TimeBucketAggregator();
    private readonly healthMonitor: IGeneratorHealthMonitor = new NodeGeneratorHealthMonitor();

    get failedRequests(): number {
        return this.httpErrors + this.networkErrors + this.timeouts;
    }

    startHealthMonitoring(): void {
        this.healthMonitor.start();
    }

    stopHealthMonitoring(): void {
        this.healthMonitor.stop();
    }

    record(metric: RequestMetric): void {
        validateMetric(metric);

        this.totalRequests++;
        this.latencies.push(metric.durationMs);

        // Record in fixed-memory histograms
        this.serviceHistogram.record(metric.durationMs);
        this.scheduledHistogram.record(metric.durationMs);
        this.queueDelayHistogram.record(0);

        let isSuccess = false;

        switch (metric.kind) {
            case "http": {
                const { statusCode } = metric;
                const currentCount = this.statusCodes.get(statusCode) ?? 0;
                this.statusCodes.set(statusCode, currentCount + 1);

                if (statusCode >= 200 && statusCode <= 299) {
                    this.successfulRequests++;
                    isSuccess = true;
                } else {
                    this.httpErrors++;
                }
                break;
            }

            case "network_error":
                this.networkErrors++;
                break;

            case "timeout":
                this.timeouts++;
                break;
        }

        const now = performance.now();
        this.bucketAggregator.recordCompleted({
            intendedScheduledTimeMs: Math.max(0, now - metric.durationMs),
            actualDispatchTimeMs: Math.max(0, now - metric.durationMs),
            completionTimeMs: now,
            isSuccess,
            isDelayed: false,
        });
    }

    recordExecution(record: RequestExecutionRecord): void {
        const queueDelay = Math.max(
            0,
            record.actualDispatchTime - record.intendedScheduledTime
        );
        const serviceLatency = Math.max(
            0,
            record.completionTime - record.actualDispatchTime
        );
        const scheduledLatency = Math.max(
            0,
            record.completionTime - record.intendedScheduledTime
        );

        this.totalRequests++;
        this.latencies.push(serviceLatency);

        this.serviceHistogram.record(serviceLatency);
        this.scheduledHistogram.record(scheduledLatency);
        this.queueDelayHistogram.record(queueDelay);

        let isSuccess = false;

        switch (record.outcome.kind) {
            case "http": {
                const { statusCode } = record.outcome;
                const currentCount = this.statusCodes.get(statusCode) ?? 0;
                this.statusCodes.set(statusCode, currentCount + 1);

                if (statusCode >= 200 && statusCode <= 299) {
                    this.successfulRequests++;
                    isSuccess = true;
                } else {
                    this.httpErrors++;
                }
                break;
            }

            case "network_error":
                this.networkErrors++;
                break;

            case "timeout":
                this.timeouts++;
                break;
        }

        const isDelayed = queueDelay > DELAYED_TOLERANCE_THRESHOLD_MS;
        this.bucketAggregator.recordCompleted({
            intendedScheduledTimeMs: record.intendedScheduledTime,
            actualDispatchTimeMs: record.actualDispatchTime,
            completionTimeMs: record.completionTime,
            isSuccess,
            isDelayed,
        });
    }

    recordDropped(dropTimeMs: number): void {
        this.bucketAggregator.recordDropped(dropTimeMs);
    }

    getSummary(): MetricsSummary {
        return {
            totalRequests: this.totalRequests,
            successfulRequests: this.successfulRequests,
            failedRequests: this.failedRequests,

            httpErrors: this.httpErrors,
            networkErrors: this.networkErrors,
            timeouts: this.timeouts,

            statusCodes: new Map(this.statusCodes),
        };
    }

    getLatencies(): number[] {
        return [...this.latencies];
    }

    getStatistics(): LatencyStatistics {
        return this.serviceHistogram.getStatistics();
    }

    getDualLatencyStatistics(): DualLatencyStatistics {
        return {
            service: this.serviceHistogram.getStatistics(),
            scheduled: this.scheduledHistogram.getStatistics(),
            queueDelay: this.queueDelayHistogram.getStatistics(),
        };
    }

    getThroughputSummary(referenceTimeMs?: number): ThroughputSummary {
        return this.bucketAggregator.getSummary(referenceTimeMs);
    }

    getHealthSnapshot(): GeneratorHealthSnapshot {
        return this.healthMonitor.getSnapshot();
    }
}

export class MetricsCollectorFactory implements IMetricsCollectorFactory {
    create(): IMetricsCollector {
        return new MetricsCollector();
    }
}
