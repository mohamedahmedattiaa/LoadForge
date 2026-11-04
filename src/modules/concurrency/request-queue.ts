
interface WaitingProducer<T> {
    item: T;
    resolve: () => void;
    reject: (error: Error) => void;
    signal?: AbortSignal;
    abortListener?: () => void;
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

    async enqueue(item: T, signal?: AbortSignal): Promise<void> {
        if (this.closed) {
            throw new Error("Cannot enqueue into a closed queue");
        }

        if (signal?.aborted) {
            throw new Error("Enqueue operation was aborted");
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
            const producer: WaitingProducer<T> = {
                item,
                resolve,
                reject,
                signal,
            };

            if (signal) {
                const abortListener = () => {
                    const index = this.producers.indexOf(producer);

                    if (index === -1) {
                        return;
                    }

                    this.producers.splice(index, 1);

                    signal.removeEventListener("abort", abortListener);

                    reject(new Error("Enqueue operation was aborted"));
                };

                producer.abortListener = abortListener;

                signal.addEventListener("abort", abortListener, {
                    once: true,
                });

                // Handle an abort that happened during registration.
                if (signal.aborted) {
                    abortListener();
                    return;
                }
            }

            this.producers.push(producer);
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

            if (producer.signal && producer.abortListener) {
                producer.signal.removeEventListener(
                    "abort",
                    producer.abortListener
                );
            }

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

        // The producer is now accepted. Cancellation must not
        // remove the task after this point.
        if (producer.signal && producer.abortListener) {
            producer.signal.removeEventListener(
                "abort",
                producer.abortListener
            );
        }

        // Direct handoff if a worker is waiting.
        const waiter = this.waiters.shift();

        if (waiter) {
            waiter(producer.item);
        } else {
            this.items.push(producer.item);
        }

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
