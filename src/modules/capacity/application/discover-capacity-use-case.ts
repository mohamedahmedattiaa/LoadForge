import type { IRunLoadTestUseCase } from "../../load-test/application/load-test-port.js";
import type { ITimeoutEstimator } from "../../load-test/domain/timeout-estimator-port.js";
import {
    advanceCapacitySearch,
    assembleCapacityReport,
    createInitialSearchState,
    evaluateCapacityStep,
} from "../domain/capacity-evaluation-service.js";
import type {
    CapacityLiveCallback,
    CapacityStepCallback,
    IDiscoverCapacityUseCase,
} from "../domain/capacity-port.js";
import type {
    CapacityDiscoveryConfig,
    CapacityReport,
    CapacityStepResult,
} from "../domain/capacity-types.js";
import { validateCapacityDiscoveryConfig } from "./capacity-validation.js";

const DEFAULT_FALLBACK_TIMEOUT_MS = 10_000;

export interface DiscoverCapacityDependencies {
    runLoadTestUseCase: IRunLoadTestUseCase;
    timeoutEstimator: ITimeoutEstimator;
}

export class DiscoverCapacityUseCase implements IDiscoverCapacityUseCase {
    constructor(private readonly deps: DiscoverCapacityDependencies) {}

    async execute(
        config: CapacityDiscoveryConfig,
        onStepComplete?: CapacityStepCallback,
        signal?: AbortSignal,
        onLiveProgress?: CapacityLiveCallback
    ): Promise<CapacityReport> {
        const validated = validateCapacityDiscoveryConfig(config);

        let resolvedTimeoutMs: number;
        let baselineMinRttMs: number | null = null;

        if (validated.timeout === "auto") {
            let probeTimer: ReturnType<typeof setInterval> | undefined;
            if (onLiveProgress) {
                const probeStart = performance.now();
                const emitProbeTick = () => {
                    onLiveProgress({
                        phase: "probing_timeout",
                        elapsedMs: Math.max(0, performance.now() - probeStart),
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
                emitProbeTick();
                probeTimer = setInterval(emitProbeTick, 200);
            }

            try {
                const estimation = await this.deps.timeoutEstimator.estimate({
                    url: validated.url,
                    method: validated.method,
                });
                resolvedTimeoutMs =
                    estimation.timeoutMs > 0
                        ? estimation.timeoutMs
                        : DEFAULT_FALLBACK_TIMEOUT_MS;
                baselineMinRttMs = estimation.baselineMinRttMs;
            } finally {
                if (probeTimer !== undefined) {
                    clearInterval(probeTimer);
                }
            }
        } else {
            resolvedTimeoutMs = validated.timeout;
        }

        let searchState = createInitialSearchState(validated);
        const steps: CapacityStepResult[] = [];
        let baselineP95Ms: number | null = null;
        let stepNumber = 1;

        while (searchState.phase !== "done" && !signal?.aborted) {
            const targetLoad = searchState.currentConcurrency;

            const stepConfig =
                validated.mode === "burst"
                    ? {
                          url: validated.url,
                          method: validated.method,
                          headers: validated.headers,
                          body: validated.body,
                          requests: targetLoad,
                          concurrency: targetLoad,
                          timeout: resolvedTimeoutMs,
                          queueCapacity: Math.max(
                              validated.queueCapacity,
                              targetLoad
                          ),
                      }
                    : {
                          url: validated.url,
                          method: validated.method,
                          headers: validated.headers,
                          body: validated.body,
                          duration: validated.stepDurationSeconds,
                          concurrency: targetLoad,
                          timeout: resolvedTimeoutMs,
                          queueCapacity: validated.queueCapacity,
                      };

            const executionOptions =
                signal || onLiveProgress
                    ? {
                          signal,
                          progressIntervalMs: 200,
                          onProgress: onLiveProgress,
                      }
                    : undefined;

            const stepReport = executionOptions
                ? await this.deps.runLoadTestUseCase.execute(
                      stepConfig,
                      executionOptions
                  )
                : await this.deps.runLoadTestUseCase.execute(stepConfig);

            if (baselineP95Ms === null && stepReport.latency.p95 !== null) {
                baselineP95Ms = stepReport.latency.p95;
            }

            const evaluatedStep = evaluateCapacityStep({
                stepNumber,
                concurrency: targetLoad,
                report: stepReport,
                config: validated,
                baselineP95Ms,
                previousHealthyStep: searchState.bestHealthyStep,
            });

            steps.push(evaluatedStep);
            onStepComplete?.(evaluatedStep);

            searchState = advanceCapacitySearch(
                searchState,
                evaluatedStep,
                validated
            );
            stepNumber++;

            // Allow real server sockets/queues a brief settle pause between steps
            if (
                searchState.phase !== "done" &&
                !signal?.aborted &&
                stepReport.durationMs >= 200
            ) {
                await new Promise<void>((resolve) => {
                    const timer = setTimeout(resolve, 200);
                    if (signal) {
                        const onAbort = () => {
                            clearTimeout(timer);
                            resolve();
                        };
                        signal.addEventListener("abort", onAbort, { once: true });
                    }
                });
            }
        }

        return assembleCapacityReport({
            config: validated,
            resolvedTimeoutMs,
            baselineMinRttMs,
            baselineP95Ms,
            state: searchState,
            steps,
        });
    }
}
