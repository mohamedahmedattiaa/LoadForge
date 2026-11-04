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

        // 2. Build the request once. It is identical for every iteration.
        const request: HttpRequest = {
            url: validatedConfig.url,
            method: validatedConfig.method,
            timeout: validatedConfig.timeout,
        };

        // 3. Build the task once. Workers only call it, they never modify it.
        const task = async (): Promise<void> => {
            await this.httpClient.send(request);
        };

        // 4. Create and start the WorkerPool
        const pool = new WorkerPool(
            validatedConfig.concurrency,
            validatedConfig.queueCapacity
        );
        pool.start();

        try {
            // 5. Submit tasks. The sequential await keeps backpressure.
            for (let i = 0; i < validatedConfig.requests; i++) {
                await pool.addTask(task);
            }
        } finally {
            // 6. Graceful shutdown: drain accepted tasks, then stop.
            await pool.stop();
        }
    }
}