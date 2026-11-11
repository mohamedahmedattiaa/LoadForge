import type {
    IMetricsCollector,
    IMetricsCollectorFactory,
} from "./metrics-port.js";
import type { MetricsSummary, RequestMetric } from "./metrics-types.js";

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

    private latencies: number[] = [];
    private statusCodes = new Map<number, number>();

    get failedRequests(): number {
        return this.httpErrors + this.networkErrors + this.timeouts;
    }

    record(metric: RequestMetric): void {
        validateMetric(metric);

        this.totalRequests++;
        this.latencies.push(metric.durationMs);

        switch (metric.kind) {
            case "http": {
                const { statusCode } = metric;

                const currentCount = this.statusCodes.get(statusCode) ?? 0;
                this.statusCodes.set(statusCode, currentCount + 1);

                if (statusCode >= 200 && statusCode <= 299) {
                    this.successfulRequests++;
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
}

export class MetricsCollectorFactory implements IMetricsCollectorFactory {
    create(): IMetricsCollector {
        return new MetricsCollector();
    }
}
