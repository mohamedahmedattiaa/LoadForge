
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
