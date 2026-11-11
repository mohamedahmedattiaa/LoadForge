import type { HttpMethod } from "../../http/domain/http-types.js";
import type {
    CapacityDiscoveryMode,
    CapacityStopPolicy,
} from "../domain/capacity-types.js";

export const CAPACITY_DEFAULTS: {
    method: HttpMethod;
    mode: CapacityDiscoveryMode;
    stepDurationSeconds: number;
    initialConcurrency: number;
    maxConcurrency: number;
    stepMultiplier: number;
    stopPolicy: CapacityStopPolicy;
    maxErrorRate: number;
    maxLatencyMultiplier: number;
    stopOnRateLimit: boolean;
    timeout: "auto";
    queueCapacity: number;
} = {
    method: "GET",
    mode: "sustained",
    stepDurationSeconds: 2,
    initialConcurrency: 5,
    maxConcurrency: 500,
    stepMultiplier: 2,
    stopPolicy: "slo",
    maxErrorRate: 0.02,
    maxLatencyMultiplier: 4,
    stopOnRateLimit: true,
    timeout: "auto",
    queueCapacity: 10000,
};

export const REJECTION_MODE_DEFAULT_MAX_CONCURRENCY = 2000;
