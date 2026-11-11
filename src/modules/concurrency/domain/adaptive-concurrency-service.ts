import type {
    ConcurrencySample,
    ConcurrencySummary,
    IConcurrencyController,
    IConcurrencyControllerFactory,
} from "./concurrency-controller-port.js";

export class FixedConcurrencyController implements IConcurrencyController {
    constructor(private readonly concurrency: number) {}

    getInitialConcurrency(): number {
        return this.concurrency;
    }

    recordSample(_sample: ConcurrencySample): void {
        // No-op for fixed concurrency
    }

    evaluate(currentConcurrency: number): number {
        return currentConcurrency;
    }

    getSummary(finalConcurrency: number): ConcurrencySummary {
        return {
            mode: "fixed",
            initialConcurrency: this.concurrency,
            peakConcurrency: this.concurrency,
            finalConcurrency,
            minObservedRttMs: null,
        };
    }
}

export interface AdaptiveConcurrencyOptions {
    initialConcurrency?: number;
    minConcurrency?: number;
    maxConcurrency?: number;
    minSamplesPerWindow?: number;
    errorRateThreshold?: number;
    gradientLowThreshold?: number;
    gradientHighThreshold?: number;
    baselineMinRttMs?: number | null;
}

const DEFAULT_ADAPTIVE_OPTIONS: Required<
    Omit<AdaptiveConcurrencyOptions, "baselineMinRttMs">
> = {
    initialConcurrency: 5,
    minConcurrency: 2,
    maxConcurrency: 200,
    minSamplesPerWindow: 5,
    errorRateThreshold: 0.05,
    gradientLowThreshold: 0.55,
    gradientHighThreshold: 0.75,
};

export class AdaptiveConcurrencyController implements IConcurrencyController {
    private readonly options: Required<
        Omit<AdaptiveConcurrencyOptions, "baselineMinRttMs">
    >;

    private minObservedRttMs: number | null;
    private peakConcurrency: number;

    private windowTotalSamples = 0;
    private windowErrorCount = 0;
    private windowSuccessRttSum = 0;
    private windowSuccessCount = 0;
    private windowMinSuccessRtt = Infinity;

    constructor(options: AdaptiveConcurrencyOptions = {}) {
        this.options = {
            initialConcurrency:
                options.initialConcurrency ??
                DEFAULT_ADAPTIVE_OPTIONS.initialConcurrency,
            minConcurrency:
                options.minConcurrency ??
                DEFAULT_ADAPTIVE_OPTIONS.minConcurrency,
            maxConcurrency:
                options.maxConcurrency ??
                DEFAULT_ADAPTIVE_OPTIONS.maxConcurrency,
            minSamplesPerWindow:
                options.minSamplesPerWindow ??
                DEFAULT_ADAPTIVE_OPTIONS.minSamplesPerWindow,
            errorRateThreshold:
                options.errorRateThreshold ??
                DEFAULT_ADAPTIVE_OPTIONS.errorRateThreshold,
            gradientLowThreshold:
                options.gradientLowThreshold ??
                DEFAULT_ADAPTIVE_OPTIONS.gradientLowThreshold,
            gradientHighThreshold:
                options.gradientHighThreshold ??
                DEFAULT_ADAPTIVE_OPTIONS.gradientHighThreshold,
        };

        this.minObservedRttMs = options.baselineMinRttMs ?? null;
        this.peakConcurrency = this.options.initialConcurrency;
    }

    getInitialConcurrency(): number {
        return this.options.initialConcurrency;
    }

    recordSample(sample: ConcurrencySample): void {
        this.windowTotalSamples++;

        if (sample.isCongestionError) {
            this.windowErrorCount++;
            return;
        }

        this.windowSuccessCount++;
        this.windowSuccessRttSum += sample.durationMs;
        if (sample.durationMs < this.windowMinSuccessRtt) {
            this.windowMinSuccessRtt = sample.durationMs;
        }
    }

    evaluate(currentConcurrency: number): number {
        const allFailed =
            this.windowTotalSamples >= 2 &&
            this.windowErrorCount === this.windowTotalSamples;

        if (
            this.windowTotalSamples < this.options.minSamplesPerWindow &&
            !allFailed
        ) {
            return currentConcurrency;
        }

        const errorRate = this.windowErrorCount / this.windowTotalSamples;
        const avgSuccessRtt =
            this.windowSuccessCount > 0
                ? this.windowSuccessRttSum / this.windowSuccessCount
                : null;
        const minInWindow =
            this.windowSuccessCount > 0 ? this.windowMinSuccessRtt : null;

        this.resetWindow();

        if (errorRate > this.options.errorRateThreshold) {
            const next = Math.max(
                this.options.minConcurrency,
                Math.floor(currentConcurrency * 0.7)
            );
            this.peakConcurrency = Math.max(this.peakConcurrency, next);
            return next;
        }

        if (avgSuccessRtt === null || minInWindow === null) {
            return currentConcurrency;
        }

        this.minObservedRttMs =
            this.minObservedRttMs === null
                ? minInWindow
                : Math.min(this.minObservedRttMs, minInWindow);

        const safeBaseline = Math.max(1, this.minObservedRttMs);
        const safeCurrent = Math.max(1, avgSuccessRtt);
        const gradient = Math.min(1, safeBaseline / safeCurrent);

        let next = currentConcurrency;

        if (gradient >= this.options.gradientHighThreshold) {
            const step = Math.max(1, Math.ceil(currentConcurrency * 0.25));
            next = Math.min(
                this.options.maxConcurrency,
                currentConcurrency + step
            );
        } else if (gradient < this.options.gradientLowThreshold) {
            next = Math.max(
                this.options.minConcurrency,
                Math.floor(currentConcurrency * 0.85)
            );
        }

        this.peakConcurrency = Math.max(this.peakConcurrency, next);
        return next;
    }

    getSummary(finalConcurrency: number): ConcurrencySummary {
        return {
            mode: "auto",
            initialConcurrency: this.options.initialConcurrency,
            peakConcurrency: this.peakConcurrency,
            finalConcurrency,
            minObservedRttMs: this.minObservedRttMs,
        };
    }

    private resetWindow(): void {
        this.windowTotalSamples = 0;
        this.windowErrorCount = 0;
        this.windowSuccessRttSum = 0;
        this.windowSuccessCount = 0;
        this.windowMinSuccessRtt = Infinity;
    }
}

export class ConcurrencyControllerFactory
    implements IConcurrencyControllerFactory
{
    createFixed(concurrency: number): IConcurrencyController {
        return new FixedConcurrencyController(concurrency);
    }

    createAdaptive(baselineMinRttMs: number | null): IConcurrencyController {
        return new AdaptiveConcurrencyController({ baselineMinRttMs });
    }
}
