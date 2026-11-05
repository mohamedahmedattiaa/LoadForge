
import { requestMetricSchema } from "./metrics.schema.js";

import type {
    RequestMetric,
    MetricsSummary,
} from "./metrics.types.js";

export class MetricsCollector {
    private totalRequests = 0;
    private successfulRequests = 0;

    private httpErrors = 0;
    private networkErrors = 0;
    private timeouts = 0;

    private latencies: number[] = [];
    private statusCodes = new Map<number, number>();

    get failedRequests(): number {
        return (
            this.httpErrors +
            this.networkErrors +
            this.timeouts
        );
    }

    record(metric: RequestMetric): void {
        const validatedMetric = requestMetricSchema.parse(metric);

        this.totalRequests++;
        this.latencies.push(validatedMetric.durationMs);

        switch (validatedMetric.kind) {
            case "http": {
                const { statusCode } = validatedMetric;

                const currentCount =
                    this.statusCodes.get(statusCode) ?? 0;

                this.statusCodes.set(
                    statusCode,
                    currentCount + 1
                );

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
