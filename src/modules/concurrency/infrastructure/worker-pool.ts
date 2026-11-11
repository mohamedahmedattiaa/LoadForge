import type {
    IWorkerPool,
    IWorkerPoolFactory,
    WorkerTask,
} from "../domain/worker-pool-port.js";
import { RequestQueue } from "./request-queue.js";

enum WorkerPoolState {
    CREATED,
    RUNNING,
    STOPPING,
    STOPPED,
}

export class WorkerPool implements IWorkerPool {
    private readonly queue: RequestQueue<WorkerTask>;
    private readonly workers = new Set<Promise<void>>();
    private targetConcurrency: number;
    private activeWorkerCount = 0;
    private state: WorkerPoolState = WorkerPoolState.CREATED;

    constructor(concurrency: number, queueCapacity: number = 100) {
        if (!Number.isInteger(concurrency) || concurrency <= 0) {
            throw new Error("Concurrency must be a positive integer");
        }

        this.targetConcurrency = concurrency;
        this.queue = new RequestQueue<WorkerTask>(queueCapacity);
    }

    async addTask(task: WorkerTask, signal?: AbortSignal): Promise<void> {
        if (
            this.state === WorkerPoolState.STOPPING ||
            this.state === WorkerPoolState.STOPPED
        ) {
            throw new Error(
                "Cannot add tasks while the pool is stopping or stopped"
            );
        }

        await this.queue.enqueue(task, signal);
    }

    start(): void {
        if (this.state !== WorkerPoolState.CREATED) {
            throw new Error("WorkerPool cannot be started in its current state");
        }

        this.state = WorkerPoolState.RUNNING;

        while (this.activeWorkerCount < this.targetConcurrency) {
            this.spawnWorker();
        }
    }

    setConcurrency(targetConcurrency: number): void {
        if (!Number.isInteger(targetConcurrency) || targetConcurrency <= 0) {
            throw new Error("Concurrency must be a positive integer");
        }

        this.targetConcurrency = targetConcurrency;

        if (this.state === WorkerPoolState.RUNNING) {
            while (this.activeWorkerCount < this.targetConcurrency) {
                this.spawnWorker();
            }
        }
    }

    getConcurrency(): number {
        return this.targetConcurrency;
    }

    getActiveWorkers(): number {
        return this.activeWorkerCount;
    }

    private spawnWorker(): void {
        this.activeWorkerCount++;

        const workerPromise = this.runWorker().finally(() => {
            this.workers.delete(workerPromise);
        });

        this.workers.add(workerPromise);
    }

    private async runWorker(): Promise<void> {
        try {
            while (true) {
                if (this.activeWorkerCount > this.targetConcurrency) {
                    break;
                }

                const task = await this.queue.dequeue();
                if (task === null) {
                    break;
                }

                try {
                    await task();
                } catch (error) {
                    console.error("Error executing task:", error);
                }
            }
        } finally {
            this.activeWorkerCount--;
        }
    }

    async stop(): Promise<void> {
        if (this.state === WorkerPoolState.STOPPED) {
            return;
        }

        if (this.state === WorkerPoolState.CREATED) {
            this.start();
        }

        if (this.state === WorkerPoolState.RUNNING) {
            this.state = WorkerPoolState.STOPPING;
            this.queue.close();
        }

        await Promise.all(Array.from(this.workers));
        this.state = WorkerPoolState.STOPPED;
    }
}

export class WorkerPoolFactory implements IWorkerPoolFactory {
    create(concurrency: number, queueCapacity: number): IWorkerPool {
        return new WorkerPool(concurrency, queueCapacity);
    }
}
