import {RequestQueue} from './request-queue.js';

type Task = () => Promise<void>;

enum WorkerPoolState {
    CREATED,
    RUNNING,
    STOPPING,
    STOPPED
}

export class WorkerPool {
    private readonly queue: RequestQueue<Task>;
    private readonly workers: Promise<void>[] = [];
    private readonly concurrency: number;
    private state: WorkerPoolState = WorkerPoolState.CREATED;

    constructor(
    concurrency: number,
    queueCapacity: number = 100
    ) {
        if (!Number.isInteger(concurrency) || concurrency <= 0) {
        throw new Error("Concurrency must be a positive integer");
        }

        this.concurrency = concurrency;
        this.queue = new RequestQueue<Task>(queueCapacity);
    }

     async addTask(task: Task,signal?:AbortSignal): Promise<void>{
        if (this.state === WorkerPoolState.STOPPING || this.state === WorkerPoolState.STOPPED) {
            throw new Error("Cannot add tasks while the pool is stopping or stopped");
        }
        await this.queue.enqueue(task,signal);
    }

    start():void{
        if (this.state !== WorkerPoolState.CREATED) {
            throw new Error("WorkerPool cannot be started in its current state");
        }
        this.state = WorkerPoolState.RUNNING;
        for(let i = 0; i < this.concurrency; i++){
            const workerPromise = this.runWorker();
            this.workers.push(workerPromise);
         }
    }

    private async runWorker(): Promise<void> {
        while(true){
            const task = await this.queue.dequeue();
            if(task === null){
                break;
            }
            try {
                await task();
            } catch (error) {
                console.error("Error executing task:", error);
            }
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
        await Promise.all(this.workers);  
        this.state = WorkerPoolState.STOPPED;
    }
}
