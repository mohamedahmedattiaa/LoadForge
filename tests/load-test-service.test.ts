
import {
    describe,
    it,
    expect,
    vi,
    beforeEach,
    afterEach,
} from "vitest";

import { LoadTestService } from "../src/modules/load-test/load-test.service.js";
import { HttpClient } from "../src/modules/http/http-client.js";
import type { LoadTestConfig } from "../src/modules/load-test/load-test-config.js";

describe("LoadTestService", () => {
    let service: LoadTestService;
    let sendMock: ReturnType<typeof vi.fn>;

    const config: LoadTestConfig = {
        url: "https://example.com",
        method: "GET",
        requests: 100,
        concurrency: 10,
        timeout: 5000,
        queueCapacity: 20,
    };

    beforeEach(() => {
        sendMock = vi.fn().mockResolvedValue({
            statusCode: 200,
            headers: new Headers(),
            duration: 10,
        });

        const httpClient = {
            send: sendMock,
        } as unknown as HttpClient;

        service = new LoadTestService(httpClient);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe("request execution", () => {
        it("should send exactly the configured number of requests", async () => {
            await service.run(config);

            expect(sendMock).toHaveBeenCalledTimes(100);
        });

        it("should pass the correct request configuration to HttpClient", async () => {
            await service.run(config);

            expect(sendMock).toHaveBeenCalledWith({
                url: config.url,
                method: config.method,
                timeout: config.timeout,
            });
        });

        it("should not exceed the configured concurrency", async () => {
            let activeRequests = 0;
            let maxActiveRequests = 0;

            sendMock.mockImplementation(async () => {
                activeRequests++;

                maxActiveRequests = Math.max(
                    maxActiveRequests,
                    activeRequests
                );

                await new Promise((resolve) => setTimeout(resolve, 10));

                activeRequests--;

                return {
                    statusCode: 200,
                    headers: new Headers(),
                    duration: 10,
                };
            });

            await service.run(config);

            expect(maxActiveRequests).toBeLessThanOrEqual(
                config.concurrency
            );
        });

        it("should wait for all requests to finish before resolving", async () => {
            let completedRequests = 0;

            sendMock.mockImplementation(async () => {
                await new Promise((resolve) => setTimeout(resolve, 20));
                completedRequests++;
            });

            await service.run(config);

            expect(completedRequests).toBe(config.requests);
        });

        it("should handle HTTP request failures without stopping other tasks", async () => {
            sendMock
                .mockRejectedValueOnce(new Error("Network error"))
                .mockResolvedValue({
                    statusCode: 200,
                    headers: new Headers(),
                    duration: 10,
                });

            const consoleError = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});

            await expect(service.run(config)).resolves.toBeUndefined();

            expect(sendMock).toHaveBeenCalledTimes(config.requests);
            expect(consoleError).toHaveBeenCalled();
        });
    });

    describe("duration-based execution", () => {
        it("should produce requests until the duration expires", async () => {
            vi.useFakeTimers();

            sendMock.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        setTimeout(
                            () =>
                                resolve({
                                    statusCode: 200,
                                    headers: new Headers(),
                                    duration: 10,
                                }),
                            10
                        );
                    })
            );

            const runPromise = service.run({
                ...config,
                requests: undefined,
                duration: 0.025,
                concurrency: 2,
                queueCapacity: 2,
            });

            await vi.runAllTimersAsync();
            await runPromise;

            expect(sendMock.mock.calls.length).toBeGreaterThan(0);
            expect(sendMock.mock.calls.length).toBeLessThan(100);
        });

        it("should stop when the request limit is reached before the duration", async () => {
            vi.useFakeTimers();

            const runPromise = service.run({
                ...config,
                requests: 3,
                duration: 30,
            });

            await runPromise;

            expect(sendMock).toHaveBeenCalledTimes(3);
            expect(vi.getTimerCount()).toBe(0);
        });

        it("should stop when the duration expires before the request limit", async () => {
            vi.useFakeTimers();

            sendMock.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        setTimeout(
                            () =>
                                resolve({
                                    statusCode: 200,
                                    headers: new Headers(),
                                    duration: 10,
                                }),
                            10
                        );
                    })
            );

            const runPromise = service.run({
                ...config,
                requests: 100,
                duration: 0.025,
                concurrency: 2,
                queueCapacity: 2,
            });

            await vi.runAllTimersAsync();
            await runPromise;

            expect(sendMock.mock.calls.length).toBeGreaterThan(0);
            expect(sendMock.mock.calls.length).toBeLessThan(100);
        });

        it("should abort pending enqueue and drain accepted tasks after duration expires", async () => {
            vi.useFakeTimers();

            const resolvers: Array<() => void> = [];

            sendMock.mockImplementation(
                () =>
                    new Promise<void>((resolve) => {
                        resolvers.push(resolve);
                    })
            );

            const runPromise = service.run({
                ...config,
                requests: undefined,
                duration: 0.1,
                concurrency: 1,
                queueCapacity: 1,
            });

            // Wait until the first accepted task starts executing.
            await vi.waitFor(() => {
                expect(sendMock).toHaveBeenCalledTimes(1);
            });

            // Allow the producer to enqueue the second task
            // and block while trying to enqueue the third.
            await Promise.resolve();
            await Promise.resolve();

            // Expire the duration while the producer is blocked.
            await vi.advanceTimersByTimeAsync(100);

            // The first accepted task finishes.
            resolvers[0]();

            // The second accepted task starts executing.
            await vi.waitFor(() => {
                expect(sendMock).toHaveBeenCalledTimes(2);
            });

            // Finish the second accepted task.
            resolvers[1]();

            await runPromise;

            // Only the two accepted tasks should execute.
            // The pending third enqueue should have been aborted.
            expect(sendMock).toHaveBeenCalledTimes(2);
        });
    });

    describe("configuration validation", () => {
        it("should reject invalid configuration", async () => {
            const invalidConfig = {
                ...config,
                concurrency: 0,
            };

            await expect(
                service.run(invalidConfig as LoadTestConfig)
            ).rejects.toThrow();

            expect(sendMock).not.toHaveBeenCalled();
        });

        it("should accept zero requests", async () => {
            await expect(
                service.run({
                    ...config,
                    requests: 0,
                })
            ).resolves.toBeUndefined();

            expect(sendMock).not.toHaveBeenCalled();
        });
    });
});
