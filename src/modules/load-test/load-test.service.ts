import { HttpClient, HttpTimeoutError } from "../http/http-client.js";
import { WorkerPool } from "../concurrency/worker-pool.js";

import type { HttpRequest } from "../http/http-request.js";

import {
    validateLoadTestConfig,
    type LoadTestConfig,
} from "./load-test-config.js";

import { MetricsCollector } from "./metrics/metrics-collector.js";
import { ReportBuilder } from "./metrics/report-builder.js";

import type { LoadTestReport } from "./metrics/metrics.types.js";

export class LoadTestService {
    constructor(
        private readonly httpClient: HttpClient,
        private readonly reportBuilder = new ReportBuilder()
    ) {}

    async run(config: LoadTestConfig): Promise<LoadTestReport> {
        // 1. Validate configuration
        const validatedConfig = validateLoadTestConfig(config);

        // 2. Build HTTP request
        const request: HttpRequest = {
            url: validatedConfig.url,
            method: validatedConfig.method,
            timeout: validatedConfig.timeout,
        };

        // 3. Initialize metrics collector
        const metricsCollector = new MetricsCollector();

        // 4. Define request execution task
        const task = async (): Promise<void> => {
            const startedAt = performance.now();

            try {
                const response = await this.httpClient.send(request);

                // Record successful or HTTP-error response
                metricsCollector.record({
                    kind: "http",
                    statusCode: response.statusCode,
                    durationMs: response.duration,
                });
            } catch (error) {
                // Measure failed request duration
                const durationMs = performance.now() - startedAt;

                // Record failure metrics
                metricsCollector.record({
                    kind: error instanceof HttpTimeoutError
                        ? "timeout"
                        : "network_error",
                    durationMs,
                });

                // Let WorkerPool handle the task failure
                throw error;
            }
        };

        // 5. Initialize worker pool
        const pool = new WorkerPool(
            validatedConfig.concurrency,
            validatedConfig.queueCapacity
        );

        // 6. Initialize load-test execution state
        const testStartedAt = performance.now();

        const abortController = new AbortController();

        let submittedRequests = 0;
        let isDurationExpired = false;

        let durationTimer: ReturnType<typeof setTimeout> | undefined;

        pool.start();

        try {
            // 7. Start duration timer if configured
            if (validatedConfig.duration !== undefined) {
                durationTimer = setTimeout(() => {
                    isDurationExpired = true;
                    abortController.abort();
                }, validatedConfig.duration * 1000);
            }

            // 8. Produce requests until a configured limit is reached
            while (
                !isDurationExpired &&
                (
                    validatedConfig.requests === undefined ||
                    submittedRequests < validatedConfig.requests
                )
            ) {
                try {
                    await pool.addTask(
                        task,
                        abortController.signal
                    );

                    // Count only accepted requests
                    submittedRequests++;
                } catch (error) {
                    // Duration expired while waiting for queue capacity
                    if (abortController.signal.aborted) {
                        break;
                    }

                    throw error;
                }
            }
        } finally {
            // 9. Clear duration timer
            if (durationTimer !== undefined) {
                clearTimeout(durationTimer);
            }

            // 10. Gracefully drain accepted tasks
            await pool.stop();
        }

        // 11. Calculate total execution duration
        const durationMs = performance.now() - testStartedAt;

        // 12. Build final load-test report
        return this.reportBuilder.build(
            metricsCollector.getSummary(),
            metricsCollector.getLatencies(),
            durationMs
        );
    }
}