export type WorkerTask = () => Promise<void>;

export interface IWorkerPool {
    addTask(task: WorkerTask, signal?: AbortSignal): Promise<void>;
    start(): void;
    stop(): Promise<void>;
    setConcurrency(targetConcurrency: number): void;
    getConcurrency(): number;
    getActiveWorkers(): number;
}

export interface IWorkerPoolFactory {
    create(concurrency: number, queueCapacity: number): IWorkerPool;
}
