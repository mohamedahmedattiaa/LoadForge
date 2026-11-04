
import { HttpClient } from "../http/http-client.js";
import { WorkerPool } from "../concurrency/worker-pool.js";
import type { HttpRequest } from "../http/http-request.js";
import {
    validateLoadTestConfig,
    type LoadTestConfig,
} from "./load-test-config.js";

export class LoadTestService {
    constructor(
        private readonly httpClient: HttpClient
    ) {}

    async run(config: LoadTestConfig): Promise<void> {
        // 1. Validate configuration
        const validatedConfig = validateLoadTestConfig(config);

        // 2. Build the request once
        const request: HttpRequest = {
            url: validatedConfig.url,
            method: validatedConfig.method,
            timeout: validatedConfig.timeout,
        };

        // 3. Build the task once
        const task = async (): Promise<void> => {
            await this.httpClient.send(request);
        };

        // 4. Create and start the WorkerPool
        const pool = new WorkerPool(
            validatedConfig.concurrency,
            validatedConfig.queueCapacity
        );

        pool.start();

        // 5. Track production state
        const abortController = new AbortController();

        let submittedRequests = 0;
        let isDurationExpired = false;

        let durationTimer: ReturnType<typeof setTimeout> | undefined;

        try {
            // 6. Start the duration timer if duration is configured
            if (validatedConfig.duration !== undefined) {
                durationTimer = setTimeout(() => {
                    isDurationExpired = true;
                    abortController.abort();
                }, validatedConfig.duration * 1000);
            }

            // 7. Produce requests until either limit is reached
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

                    // Count only successfully accepted tasks
                    submittedRequests++;
                } catch (error) {
                    // Duration expired while waiting for queue capacity
                    if (abortController.signal.aborted) {
                        break;
                    }

                    // Unexpected errors should propagate
                    throw error;
                }
            }
        } finally {
            // 8. Stop the timer
            if (durationTimer !== undefined) {
                clearTimeout(durationTimer);
            }

            // 9. Graceful shutdown: drain accepted tasks
            await pool.stop();
        }
    }
}
