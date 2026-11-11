import {
    describe,
    it,
    expect,
    vi,
    beforeEach,
    afterEach,
} from "vitest";

import { ConcurrencyControllerFactory } from "../src/modules/concurrency/domain/adaptive-concurrency-service.js";
import { WorkerPoolFactory } from "../src/modules/concurrency/infrastructure/worker-pool.js";
import {
    HttpTimeoutError,
    type HttpResponse,
} from "../src/modules/http/domain/http-types.js";
import type { ITransportClient } from "../src/modules/http/domain/transport-port.js";
import { AdaptiveTimeoutEstimator } from "../src/modules/load-test/application/adaptive-timeout-estimator.js";
import { RunLoadTestUseCase } from "../src/modules/load-test/application/run-load-test-use-case.js";
import type { LoadTestConfig } from "../src/modules/load-test/domain/load-test-types.js";
import { MetricsCollectorFactory } from "../src/modules/metrics/domain/metrics-collector-service.js";
import { ReportBuilder } from "../src/modules/metrics/domain/report-builder-service.js";

describe("RunLoadTestUseCase", () => {
    let useCase: RunLoadTestUseCase;
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

        const transport: ITransportClient = {
            send: sendMock,
        };

        useCase = new RunLoadTestUseCase({
            transport,
            workerPoolFactory: new WorkerPoolFactory(),
            metricsCollectorFactory: new MetricsCollectorFactory(),
            reportBuilder: new ReportBuilder(),
            timeoutEstimator: new AdaptiveTimeoutEstimator(transport),
            concurrencyControllerFactory: new ConcurrencyControllerFactory(),
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe("request execution", () => {
        it("should send exactly the configured number of requests", async () => {
            const report = await useCase.execute(config);

            expect(sendMock).toHaveBeenCalledTimes(100);
            expect(report.totalRequests).toBe(100);
            expect(report.successfulRequests).toBe(100);
            expect(report.failedRequests).toBe(0);
        });

        it("should pass the correct request configuration to transport", async () => {
            await useCase.execute(config);

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

            await useCase.execute(config);

            expect(maxActiveRequests).toBeLessThanOrEqual(
                config.concurrency as number
            );
        });

        it("should wait for all requests to finish before resolving", async () => {
            let completedRequests = 0;

            sendMock.mockImplementation(async () => {
                await new Promise((resolve) => setTimeout(resolve, 20));
                completedRequests++;

                return {
                    statusCode: 200,
                    headers: new Headers(),
                    duration: 20,
                };
            });

            const report = await useCase.execute(config);

            expect(completedRequests).toBe(config.requests);
            expect(report.totalRequests).toBe(config.requests);
        });

        it("should handle network failures without stopping other tasks or logging noisy errors", async () => {
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

            const report = await useCase.execute(config);

            expect(sendMock).toHaveBeenCalledTimes(config.requests);
            expect(consoleError).not.toHaveBeenCalled();

            expect(report.totalRequests).toBe(config.requests);
            expect(report.successfulRequests).toBe(99);
            expect(report.failedRequests).toBe(1);
            expect(report.networkErrors).toBe(1);
        });

        it("should handle request timeouts without stopping other tasks or logging noisy errors", async () => {
            sendMock
                .mockRejectedValueOnce(new HttpTimeoutError())
                .mockResolvedValue({
                    statusCode: 200,
                    headers: new Headers(),
                    duration: 10,
                });

            const consoleError = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});

            const report = await useCase.execute(config);

            expect(sendMock).toHaveBeenCalledTimes(config.requests);
            expect(consoleError).not.toHaveBeenCalled();

            expect(report.totalRequests).toBe(config.requests);
            expect(report.successfulRequests).toBe(99);
            expect(report.failedRequests).toBe(1);
            expect(report.timeouts).toBe(1);
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

            const runPromise = useCase.execute({
                ...config,
                requests: undefined,
                duration: 0.025,
                concurrency: 2,
                queueCapacity: 2,
            });

            await vi.runAllTimersAsync();

            const report = await runPromise;

            expect(sendMock.mock.calls.length).toBeGreaterThan(0);
            expect(sendMock.mock.calls.length).toBeLessThan(100);
            expect(report.totalRequests).toBe(sendMock.mock.calls.length);
        });

        it("should stop when the request limit is reached before the duration", async () => {
            vi.useFakeTimers();

            const runPromise = useCase.execute({
                ...config,
                requests: 3,
                duration: 30,
            });

            const report = await runPromise;

            expect(sendMock).toHaveBeenCalledTimes(3);
            expect(report.totalRequests).toBe(3);
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

            const runPromise = useCase.execute({
                ...config,
                requests: 100,
                duration: 0.025,
                concurrency: 2,
                queueCapacity: 2,
            });

            await vi.runAllTimersAsync();

            const report = await runPromise;

            expect(sendMock.mock.calls.length).toBeGreaterThan(0);
            expect(sendMock.mock.calls.length).toBeLessThan(100);
            expect(report.totalRequests).toBe(sendMock.mock.calls.length);
        });

        it("should abort pending enqueue and drain accepted tasks after duration expires", async () => {
            vi.useFakeTimers();

            const resolvers: Array<(response: HttpResponse) => void> = [];

            sendMock.mockImplementation(
                () =>
                    new Promise<HttpResponse>((resolve) => {
                        resolvers.push(resolve);
                    })
            );

            const runPromise = useCase.execute({
                ...config,
                requests: undefined,
                duration: 0.1,
                concurrency: 1,
                queueCapacity: 1,
            });

            await vi.waitFor(() => {
                expect(sendMock).toHaveBeenCalledTimes(1);
            });

            await Promise.resolve();
            await Promise.resolve();

            await vi.advanceTimersByTimeAsync(100);

            resolvers[0]({
                statusCode: 200,
                headers: new Headers(),
                duration: 10,
            });

            await vi.waitFor(() => {
                expect(sendMock).toHaveBeenCalledTimes(2);
            });

            resolvers[1]({
                statusCode: 200,
                headers: new Headers(),
                duration: 10,
            });

            const report = await runPromise;

            expect(sendMock).toHaveBeenCalledTimes(2);
            expect(report.totalRequests).toBe(2);
            expect(report.successfulRequests).toBe(2);
            expect(report.failedRequests).toBe(0);
        });
    });

    describe("configuration validation", () => {
        it("should reject invalid configuration", async () => {
            const invalidConfig = {
                ...config,
                concurrency: 0,
            };

            await expect(
                useCase.execute(invalidConfig as LoadTestConfig)
            ).rejects.toThrow();

            expect(sendMock).not.toHaveBeenCalled();
        });

        it("should accept zero requests and return an empty report", async () => {
            const report = await useCase.execute({
                ...config,
                requests: 0,
            });

            expect(sendMock).not.toHaveBeenCalled();

            expect(report).toMatchObject({
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,

                httpErrors: 0,
                networkErrors: 0,
                timeouts: 0,

                requestsPerSecond: 0,
                statusCodes: {},

                latency: {
                    min: null,
                    max: null,
                    average: null,
                    p50: null,
                    p90: null,
                    p95: null,
                    p99: null,
                },
            });
        });
    });

    describe("adaptive auto mode", () => {
        it("should calibrate timeout via pre-flight probe when timeout is auto", async () => {
            sendMock.mockResolvedValue({
                statusCode: 200,
                headers: new Headers(),
                duration: 1_500,
            });

            const report = await useCase.execute({
                ...config,
                requests: 10,
                concurrency: 2,
                timeout: "auto",
            });

            expect(sendMock).toHaveBeenCalledTimes(15);
            expect(sendMock).toHaveBeenLastCalledWith({
                url: config.url,
                method: config.method,
                timeout: 6_000,
            });
            expect(report.adaptive).toMatchObject({
                timeoutMode: "auto",
                resolvedTimeoutMs: 6_000,
                concurrencyMode: "fixed",
                finalConcurrency: 2,
                baselineMinRttMs: 1_500,
            });
        });

        it("should adapt concurrency automatically when concurrency is auto", async () => {
            vi.useFakeTimers();

            sendMock.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        setTimeout(
                            () =>
                                resolve({
                                    statusCode: 200,
                                    headers: new Headers(),
                                    duration: 20,
                                }),
                            20
                        );
                    })
            );

            const runPromise = useCase.execute({
                ...config,
                requests: 80,
                concurrency: "auto",
                timeout: 5_000,
            });

            await vi.runAllTimersAsync();

            const report = await runPromise;

            expect(report.totalRequests).toBe(80);
            expect(report.adaptive?.concurrencyMode).toBe("auto");
            expect(report.adaptive?.initialConcurrency).toBe(5);
            expect(report.adaptive?.peakConcurrency).toBeGreaterThanOrEqual(5);
            expect(vi.getTimerCount()).toBe(0);
        });
    });
});
