export interface ConcurrencySample {
    durationMs: number;
    isCongestionError: boolean;
}

export interface ConcurrencySummary {
    mode: "fixed" | "auto";
    initialConcurrency: number;
    peakConcurrency: number;
    finalConcurrency: number;
    minObservedRttMs: number | null;
}

export interface IConcurrencyController {
    getInitialConcurrency(): number;
    recordSample(sample: ConcurrencySample): void;
    evaluate(currentConcurrency: number): number;
    getSummary(finalConcurrency: number): ConcurrencySummary;
}

export interface IConcurrencyControllerFactory {
    createFixed(concurrency: number): IConcurrencyController;
    createAdaptive(baselineMinRttMs: number | null): IConcurrencyController;
}
