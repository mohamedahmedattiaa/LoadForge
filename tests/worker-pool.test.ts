
import { describe, it, expect, vi, afterEach } from "vitest";
import { WorkerPool } from "../src/modules/concurrency/worker-pool.js";

describe("WorkerPool", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should execute all queued tasks", async () => {
        const pool = new WorkerPool(2);
        let completed = 0;

        await pool.addTask(async () => {
            completed++;
        });

        await pool.addTask(async () => {
            completed++;
        });

        await pool.stop();

        expect(completed).toBe(2);
    });

    it("should never exceed the configured concurrency", async () => {
        const pool = new WorkerPool(3);

        let activeTasks = 0;
        let maxActiveTasks = 0;

        for (let i = 0; i < 10; i++) {
            await pool.addTask(async () => {
                activeTasks++;

                maxActiveTasks = Math.max(
                    maxActiveTasks,
                    activeTasks
                );

                await new Promise((resolve) =>
                    setTimeout(resolve, 20)
                );

                activeTasks--;
            });
        }

        pool.start();
        await pool.stop();

        expect(maxActiveTasks).toBe(3);
        expect(activeTasks).toBe(0);
    });

    it("should continue processing tasks after a task fails", async () => {
        const pool = new WorkerPool(1);
        const consoleSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});

        let completed = 0;

        await pool.addTask(async () => {
            completed++;
        });

        await pool.addTask(async () => {
            throw new Error("Task failed");
        });

        await pool.addTask(async () => {
            completed++;
        });

        pool.start();
        await pool.stop();

        expect(completed).toBe(2);
        expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it("should finish all pending tasks before stop resolves", async () => {
        const pool = new WorkerPool(2);
        let completed = 0;

        for (let i = 0; i < 5; i++) {
            await pool.addTask(async () => {
                await new Promise((resolve) =>
                    setTimeout(resolve, 20)
                );

                completed++;
            });
        }

        pool.start();
        await pool.stop();

        expect(completed).toBe(5);
    });

    it("should reject new tasks after the pool has stopped", async () => {
        const pool = new WorkerPool(2);

        await pool.stop();

        await expect(
            pool.addTask(async () => {})
        ).rejects.toThrow(
            "Cannot add tasks while the pool is stopping or stopped"
        );
    });

    it("should reject new tasks while the pool is stopping", async () => {
        let releaseTask!: () => void;
        let markStarted!: () => void;

        const taskPromise = new Promise<void>((resolve) => {
            releaseTask = resolve;
        });

        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });

        const pool = new WorkerPool(1);

        await pool.addTask(async () => {
            markStarted();
            await taskPromise;
        });

        pool.start();

        await started;

        const stopPromise = pool.stop();

        await expect(
            pool.addTask(async () => {})
        ).rejects.toThrow(
            "Cannot add tasks while the pool is stopping or stopped"
        );

        releaseTask();

        await stopPromise;
    });

    it("should reject waiting producers and drain accepted tasks when stopping", async () => {
        const pool = new WorkerPool(1, 1);

        let releaseFirstTask!: () => void;
        let markFirstTaskStarted!: () => void;

        const firstTaskStarted = new Promise<void>((resolve) => {
            markFirstTaskStarted = resolve;
        });

        const firstTaskRelease = new Promise<void>((resolve) => {
            releaseFirstTask = resolve;
        });

        let completed = 0;

        pool.start();

        await pool.addTask(async () => {
            markFirstTaskStarted();
            await firstTaskRelease;
            completed++;
        });

        await firstTaskStarted;

        await pool.addTask(async () => {
            completed++;
        });

        const waitingTask = pool.addTask(async () => {
            completed++;
        });

        const stopPromise = pool.stop();

        await expect(waitingTask).rejects.toThrow(
            "Cannot enqueue into a closed queue"
        );

        releaseFirstTask();

        await stopPromise;

        expect(completed).toBe(2);
    });

    // Cancellation tests

    it("should reject an aborted task waiting for queue capacity", async () => {
        const pool = new WorkerPool(1, 1);

        let releaseTask!: () => void;
        let markStarted!: () => void;

        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });

        const taskRelease = new Promise<void>((resolve) => {
            releaseTask = resolve;
        });

        pool.start();

        // Task A: currently executing.
        await pool.addTask(async () => {
            markStarted();
            await taskRelease;
        });

        await started;

        // Task B: fills the queue.
        await pool.addTask(async () => {});

        // Task C: waits for queue capacity.
        const controller = new AbortController();

        const waitingTask = pool.addTask(
            async () => {},
            controller.signal
        );

        controller.abort();

        await expect(waitingTask).rejects.toThrow(
            "Enqueue operation was aborted"
        );

        releaseTask();

        await pool.stop();
    });

    it("should drain accepted tasks after another producer is aborted", async () => {
        const pool = new WorkerPool(1, 1);

        let releaseFirstTask!: () => void;
        let markStarted!: () => void;

        const started = new Promise<void>((resolve) => {
            markStarted = resolve;
        });

        const taskRelease = new Promise<void>((resolve) => {
            releaseFirstTask = resolve;
        });

        let completed = 0;

        pool.start();

        // Task A: executing.
        await pool.addTask(async () => {
            markStarted();
            await taskRelease;
            completed++;
        });

        await started;

        // Task B: accepted into the queue.
        await pool.addTask(async () => {
            completed++;
        });

        // Task C: waiting for queue capacity.
        const controller = new AbortController();

        const waitingTask = pool.addTask(
            async () => {
                completed++;
            },
            controller.signal
        );

        controller.abort();

        await expect(waitingTask).rejects.toThrow(
            "Enqueue operation was aborted"
        );

        // Accepted tasks must still finish.
        releaseFirstTask();

        await pool.stop();

        expect(completed).toBe(2);
    });
});
