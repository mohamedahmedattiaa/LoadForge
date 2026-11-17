export type GeneratorHealthState = "HEALTHY" | "DEGRADED" | "SATURATED";

export interface GeneratorHealthSnapshot {
    readonly eventLoopP50Ms: number;
    readonly eventLoopP90Ms: number;
    readonly eventLoopP95Ms: number;
    readonly eventLoopP99Ms: number;
    readonly eventLoopMaxMs: number;

    readonly cpuPercent: number;
    readonly heapUsedMb: number;
    readonly rssMb: number;

    readonly healthState: GeneratorHealthState;
    readonly warningMessage?: string;
}

export interface IGeneratorHealthMonitor {
    start(): void;
    stop(): void;
    reset(): void;
    getSnapshot(): GeneratorHealthSnapshot;
}
