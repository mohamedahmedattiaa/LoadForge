
interface WaitingProducer<T> {
    item: T;
    resolve: () => void;
    reject: (error: Error) => void;
}

export class RequestQueue<T> {
    private items: T[] = [];
    private waiters: Array<(item: T | null) => void> = [];
    private producers: WaitingProducer<T>[] = [];

    private closed = false;
    private head = 0;

    constructor(
        private readonly maxCapacity: number = 100
    ) {
        if (!Number.isInteger(maxCapacity) || maxCapacity <= 0) {
            throw new Error("Queue capacity must be a positive integer");
        }
    }

    async enqueue(item: T): Promise<void> {
        if (this.closed) {
            throw new Error("Cannot enqueue into a closed queue");
        }

        // Direct handoff to a waiting worker.
        const waiter = this.waiters.shift();

        if (waiter) {
            waiter(item);
            return;
        }

        // Add immediately if capacity is available.
        if (this.size < this.maxCapacity) {
            this.items.push(item);
            return;
        }

        // Wait until a worker frees a queue slot.
        return new Promise<void>((resolve, reject) => {
            this.producers.push({
                item,
                resolve,
                reject,
            });
        });
    }

    async dequeue(): Promise<T | null> {
        // Return the next available item.
        if (this.size > 0) {
            const item = this.items[this.head];
            this.head++;

            // A slot is now available.
            this.promoteProducer();

            this.compact();

            return item;
        }

        // Queue is closed and completely drained.
        if (this.closed) {
            return null;
        }

        // Wait until a producer provides an item.
        return new Promise<T | null>((resolve) => {
            this.waiters.push(resolve);
        });
    }

    close(): void {
        if (this.closed) {
            return;
        }

        this.closed = true;

        // Reject producers that haven't been accepted yet.
        while (this.producers.length > 0) {
            const producer = this.producers.shift()!;

            producer.reject(
                new Error("Cannot enqueue into a closed queue")
            );
        }

        // Wake waiting workers if there are no pending items.
        if (this.size === 0) {
            while (this.waiters.length > 0) {
                const waiter = this.waiters.shift()!;
                waiter(null);
            }
        }
    }

    get size(): number {
        return this.items.length - this.head;
    }

    get isClosed(): boolean {
        return this.closed;
    }

    private promoteProducer(): void {
        if (this.closed || this.producers.length === 0) {
            return;
        }

        const producer = this.producers.shift()!;

        this.items.push(producer.item);
        producer.resolve();
    }

    private compact(): void {
        if (
            this.head >= this.items.length / 2 &&
            this.head > 0
        ) {
            this.items = this.items.slice(this.head);
            this.head = 0;
        }
    }
}
