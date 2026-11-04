
import { describe, it, expect } from "vitest";
import { RequestQueue } from "../src/modules/concurrency/request-queue.js";

describe("RequestQueue", () => {
    it("should enqueue and dequeue a task", async () => {
        const queue = new RequestQueue<string>();

        await queue.enqueue("Task A");

        await expect(queue.dequeue()).resolves.toBe("Task A");
    });

    it("should process tasks in FIFO order", async () => {
        const queue = new RequestQueue<string>();

        await queue.enqueue("Task A");
        await queue.enqueue("Task B");
        await queue.enqueue("Task C");

        await expect(queue.dequeue()).resolves.toBe("Task A");
        await expect(queue.dequeue()).resolves.toBe("Task B");
        await expect(queue.dequeue()).resolves.toBe("Task C");
    });

    it("should deliver a new task to a waiting worker", async () => {
        const queue = new RequestQueue<string>();

        const result = queue.dequeue();

        await queue.enqueue("Task A");

        await expect(result).resolves.toBe("Task A");
    });

    it("should deliver tasks to waiting workers in FIFO order", async () => {
        const queue = new RequestQueue<string>();

        const worker1 = queue.dequeue();
        const worker2 = queue.dequeue();

        await queue.enqueue("Task A");
        await queue.enqueue("Task B");

        await expect(worker1).resolves.toBe("Task A");
        await expect(worker2).resolves.toBe("Task B");
    });

    it("should resolve waiting workers with null when closed", async () => {
        const queue = new RequestQueue<string>();

        const worker1 = queue.dequeue();
        const worker2 = queue.dequeue();

        queue.close();

        await expect(worker1).resolves.toBeNull();
        await expect(worker2).resolves.toBeNull();
    });

    it("should process pending tasks before returning null after closure", async () => {
        const queue = new RequestQueue<string>();

        await queue.enqueue("Task A");
        await queue.enqueue("Task B");

        queue.close();

        await expect(queue.dequeue()).resolves.toBe("Task A");
        await expect(queue.dequeue()).resolves.toBe("Task B");
        await expect(queue.dequeue()).resolves.toBeNull();
    });

    it("should reject when enqueueing after closure", async () => {
        const queue = new RequestQueue<string>();

        queue.close();

        await expect(
            queue.enqueue("Task A")
        ).rejects.toThrow("Cannot enqueue into a closed queue");
    });

    it("should compact the internal array when head reaches half the length", async () => {
        const queue = new RequestQueue<number>();

        for (let i = 1; i <= 10; i++) {
            await queue.enqueue(i);
        }

        for (let i = 1; i <= 5; i++) {
            await queue.dequeue();
        }

        const internalQueue = queue as unknown as {
            items: number[];
            head: number;
        };

        expect(internalQueue.head).toBe(0);
        expect(internalQueue.items.length).toBe(5);

        await expect(queue.dequeue()).resolves.toBe(6);
    });

    // Bounded capacity tests

    it("should reject an invalid queue capacity", () => {
        expect(() => new RequestQueue<string>(0)).toThrow();
        expect(() => new RequestQueue<string>(-1)).toThrow();
        expect(() => new RequestQueue<string>(1.5)).toThrow();
    });

    it("should wait when the queue reaches its capacity", async () => {
        const queue = new RequestQueue<string>(2);

        await queue.enqueue("Task A");
        await queue.enqueue("Task B");

        let producerResumed = false;

        const producer = queue.enqueue("Task C").then(() => {
            producerResumed = true;
        });

        expect(producerResumed).toBe(false);

        await queue.dequeue();
        await producer;

        expect(producerResumed).toBe(true);
        expect(queue.size).toBe(2);
    });

    it("should resume a waiting producer after a worker dequeues a task", async () => {
        const queue = new RequestQueue<string>(1);

        await queue.enqueue("Task A");

        const producer = queue.enqueue("Task B");

        await expect(queue.dequeue()).resolves.toBe("Task A");

        await expect(producer).resolves.toBeUndefined();

        await expect(queue.dequeue()).resolves.toBe("Task B");
    });

    it("should resume waiting producers in FIFO order", async () => {
        const queue = new RequestQueue<string>(1);

        await queue.enqueue("Task A");

        const producer1 = queue.enqueue("Task B");
        const producer2 = queue.enqueue("Task C");

        await queue.dequeue();

        await producer1;

        await queue.dequeue();

        await producer2;

        await expect(queue.dequeue()).resolves.toBe("Task C");
    });

    it("should reject waiting producers when the queue is closed", async () => {
        const queue = new RequestQueue<string>(1);

        await queue.enqueue("Task A");

        const producer = queue.enqueue("Task B");

        queue.close();

        await expect(producer).rejects.toThrow(
            "Cannot enqueue into a closed queue"
        );

        await expect(queue.dequeue()).resolves.toBe("Task A");
        await expect(queue.dequeue()).resolves.toBeNull();
    });

    it("should not exceed its maximum capacity", async () => {
        const queue = new RequestQueue<string>(2);

        await queue.enqueue("Task A");
        await queue.enqueue("Task B");

        const producer = queue.enqueue("Task C");

        expect(queue.size).toBe(2);

        await queue.dequeue();
        await producer;

        expect(queue.size).toBe(2);
    });
});
