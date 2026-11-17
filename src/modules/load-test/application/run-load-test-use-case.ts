import type { IConcurrencyControllerFactory } from "../../concurrency/domain/concurrency-controller-port.js";
import type { IWorkerPoolFactory } from "../../concurrency/domain/worker-pool-port.js";
import {
    isTimeoutError,
    type HttpRequest,
} from "../../http/domain/http-types.js";
import type { ITransportClient } from "../../http/domain/transport-port.js";
import type {
    IMetricsCollectorFactory,
    IReportBuilder,
} from "../../metrics/domain/metrics-port.js";
import { calculateLatencyStatistics } from "../../metrics/domain/statistics-service.js";
import type {
    AdaptiveExecutionSummary,
    LoadTestReport,
} from "../../metrics/domain/metrics-types.js";
import type { LoadTestConfig } from "../domain/load-test-types.js";
import type { ITimeoutEstimator } from "../domain/timeout-estimator-port.js";
import type {
    IRunLoadTestUseCase,
    RunLoadTestExecutionOptions,
} from "./load-test-port.js";
import { validateLoadTestConfig } from "./load-test-validation.js";

const ADAPTIVE_EVALUATE_INTERVAL_MS = 500;
const DEFAULT_PROGRESS_INTERVAL_MS = 250;
const DEFAULT_FALLBACK_TIMEOUT_MS = 10_000;

export interface RunLoadTestDependencies {
    transport: ITransportClient;
    workerPoolFactory: IWorkerPoolFactory;
    metricsCollectorFactory: IMetricsCollectorFactory;
    reportBuilder: IReportBuilder;
    timeoutEstimator: ITimeoutEstimator;
    concurrencyControllerFactory: IConcurrencyControllerFactory;
}

export class RunLoadTestUseCase implements IRunLoadTestUseCase {
    constructor(private readonly deps: RunLoadTestDependencies) {}

    async execute(
        config: LoadTestConfig,
        options?: RunLoadTestExecutionOptions
    ): Promise<LoadTestReport> {
        const validatedConfig = validateLoadTestConfig(config);

        const metricsCollector = this.deps.metricsCollectorFactory.create();

        const timeoutMode =
            validatedConfig.timeout === "auto" ? "auto" : "fixed";
        let resolvedTimeoutMs: number;
        let baselineMinRttMs: number | null = null;

        if (validatedConfig.timeout === "auto" && validatedConfig.requests !== 0) {
            const probeStartedAt = performance.now();
            const emitProbe = () => {
                options?.onProgress?.({
                    phase: "probing_timeout",
                    elapsedMs: Math.max(0, performance.now() - probeStartedAt),
                    targetDurationMs:
                        validatedConfig.duration !== undefined
                            ? validatedConfig.duration * 1000
                            : undefined,
                    targetRequests: validatedConfig.requests,
                    totalRequests: 0,
                    successfulRequests: 0,
                    failedRequests: 0,
                    instantRps: 0,
                    overallRps: 0,
                    avgLatencyMs: null,
                    p95LatencyMs: null,
                    errorRate: 0,
                    currentConcurrency: 0,
                    resolvedTimeoutMs: DEFAULT_FALLBACK_TIMEOUT_MS,
                });
            };
            emitProbe();

            let probeTimer: ReturnType<typeof setInterval> | undefined;
            if (options?.onProgress) {
                const intervalMs = Math.max(
                    50,
                    options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS
                );
                probeTimer = setInterval(emitProbe, intervalMs);
            }

            try {
                const estimation = await this.deps.timeoutEstimator.estimate({
                    url: validatedConfig.url,
                    method: validatedConfig.method,
                });
                resolvedTimeoutMs = estimation.timeoutMs;
                baselineMinRttMs = estimation.baselineMinRttMs;
            } finally {
                if (probeTimer !== undefined) {
                    clearInterval(probeTimer);
                }
            }
        } else {
            resolvedTimeoutMs =
                validatedConfig.timeout === "auto"
                    ? DEFAULT_FALLBACK_TIMEOUT_MS
                    : validatedConfig.timeout;
        }

        const request: HttpRequest = {
            url: validatedConfig.url,
            method: validatedConfig.method,
            headers: validatedConfig.headers,
            body: validatedConfig.body,
            timeout: resolvedTimeoutMs,
        };

        const concurrencyMode =
            validatedConfig.concurrency === "auto" ? "auto" : "fixed";
        const concurrencyController =
            concurrencyMode === "auto"
                ? this.deps.concurrencyControllerFactory.createAdaptive(
                      baselineMinRttMs
                  )
                : this.deps.concurrencyControllerFactory.createFixed(
                      validatedConfig.concurrency as number
                  );

        const task = async (): Promise<void> => {
            const startedAt = performance.now();

            try {
                const response = await this.deps.transport.send(request);

                metricsCollector.record({
                    kind: "http",
                    statusCode: response.statusCode,
                    durationMs: response.duration,
                });

                const isCongestion =
                    response.statusCode === 429 || response.statusCode >= 500;
                concurrencyController.recordSample({
                    durationMs: response.duration,
                    isCongestionError: isCongestion,
                });
            } catch (error) {
                const durationMs = performance.now() - startedAt;

                metricsCollector.record({
                    kind: isTimeoutError(error) ? "timeout" : "network_error",
                    durationMs,
                });

                concurrencyController.recordSample({
                    durationMs,
                    isCongestionError: true,
                });
            }
        };

        const initialConcurrency =
            concurrencyController.getInitialConcurrency();
        const effectiveQueueCapacity =
            validatedConfig.duration !== undefined &&
            validatedConfig.requests === undefined
                ? Math.min(validatedConfig.queueCapacity, initialConcurrency)
                : validatedConfig.queueCapacity;

        const pool = this.deps.workerPoolFactory.create(
            initialConcurrency,
            effectiveQueueCapacity
        );

        const testStartedAt = performance.now();
        const abortController = new AbortController();
        const externalSignal = options?.signal;
        const onExternalAbort = () => {
            isDurationExpired = true;
            abortController.abort();
        };

        let submittedRequests = 0;
        let isDurationExpired = false;

        if (externalSignal) {
            if (externalSignal.aborted) {
                onExternalAbort();
            } else {
                externalSignal.addEventListener("abort", onExternalAbort, {
                    once: true,
                });
            }
        }

        let durationTimer: ReturnType<typeof setTimeout> | undefined;
        let adaptiveTimer: ReturnType<typeof setInterval> | undefined;
        let progressTimer: ReturnType<typeof setInterval> | undefined;

        let lastTickAt = testStartedAt;
        let lastTickTotal = 0;

        const emitProgress = (
            phase: "running" | "completing"
        ): void => {
            if (!options?.onProgress) {
                return;
            }

            const now = performance.now();
            const elapsedMs = Math.max(1, now - testStartedAt);
            const deltaMs = Math.max(1, now - lastTickAt);
            const summary = metricsCollector.getSummary();
            const latencies = metricsCollector.getLatencies();
            const stats = calculateLatencyStatistics(latencies);

            const deltaRequests = Math.max(0, summary.totalRequests - lastTickTotal);
            const instantRps = deltaRequests / (deltaMs / 1000);
            const overallRps = summary.totalRequests / (elapsedMs / 1000);
            const errorRate =
                summary.totalRequests > 0
                    ? summary.failedRequests / summary.totalRequests
                    : 0;

            lastTickAt = now;
            lastTickTotal = summary.totalRequests;

            options.onProgress({
                phase,
                elapsedMs,
                targetDurationMs:
                    validatedConfig.duration !== undefined
                        ? validatedConfig.duration * 1000
                        : undefined,
                targetRequests: validatedConfig.requests,
                totalRequests: summary.totalRequests,
                successfulRequests: summary.successfulRequests,
                failedRequests: summary.failedRequests,
                instantRps,
                overallRps,
                avgLatencyMs: stats.average,
                p95LatencyMs: stats.p95,
                errorRate,
                currentConcurrency: pool.getConcurrency(),
                resolvedTimeoutMs,
            });
        };

        pool.start();

        try {
            if (options?.onProgress) {
                emitProgress("running");
                const intervalMs = Math.max(
                    50,
                    options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS
                );
                progressTimer = setInterval(() => {
                    emitProgress("running");
                }, intervalMs);
            }

            if (concurrencyMode === "auto") {
                adaptiveTimer = setInterval(() => {
                    const nextConcurrency = concurrencyController.evaluate(
                        pool.getConcurrency()
                    );
                    if (nextConcurrency !== pool.getConcurrency()) {
                        pool.setConcurrency(nextConcurrency);
                    }
                }, ADAPTIVE_EVALUATE_INTERVAL_MS);
            }

            if (validatedConfig.duration !== undefined) {
                durationTimer = setTimeout(() => {
                    isDurationExpired = true;
                    abortController.abort();
                }, validatedConfig.duration * 1000);
            }

            while (
                !isDurationExpired &&
                (validatedConfig.requests === undefined ||
                    submittedRequests < validatedConfig.requests)
            ) {
                try {
                    await pool.addTask(task, abortController.signal);
                    submittedRequests++;
                } catch (error) {
                    if (abortController.signal.aborted) {
                        break;
                    }
                    throw error;
                }
            }
        } finally {
            if (progressTimer !== undefined) {
                clearInterval(progressTimer);
            }

            if (adaptiveTimer !== undefined) {
                clearInterval(adaptiveTimer);
            }

            if (durationTimer !== undefined) {
                clearTimeout(durationTimer);
            }

            externalSignal?.removeEventListener("abort", onExternalAbort);

            emitProgress("completing");
            let drainTimer: ReturnType<typeof setInterval> | undefined;
            if (options?.onProgress) {
                const intervalMs = Math.max(
                    50,
                    options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS
                );
                drainTimer = setInterval(() => {
                    emitProgress("completing");
                }, intervalMs);
            }
            try {
                await pool.stop();
            } finally {
                if (drainTimer !== undefined) {
                    clearInterval(drainTimer);
                }
            }
            emitProgress("completing");
        }

        const durationMs = performance.now() - testStartedAt;
        const concurrencySummary = concurrencyController.getSummary(
            pool.getConcurrency()
        );

        const adaptiveSummary: AdaptiveExecutionSummary = {
            timeoutMode,
            resolvedTimeoutMs,
            concurrencyMode: concurrencySummary.mode,
            initialConcurrency: concurrencySummary.initialConcurrency,
            peakConcurrency: concurrencySummary.peakConcurrency,
            finalConcurrency: concurrencySummary.finalConcurrency,
            baselineMinRttMs:
                concurrencySummary.minObservedRttMs ?? baselineMinRttMs,
        };

        return this.deps.reportBuilder.build(
            metricsCollector.getSummary(),
            metricsCollector.getLatencies(),
            durationMs,
            adaptiveSummary
        );
    }
}
