import { parseAutoOrNumber } from "../../../load-test/presentation/cli/config/cli-config-mapper.js";
import {
    CAPACITY_DEFAULTS,
    REJECTION_MODE_DEFAULT_MAX_CONCURRENCY,
} from "../../application/capacity-defaults.js";
import { validateCapacityDiscoveryConfig } from "../../application/capacity-validation.js";
import type { CapacityDiscoveryConfig } from "../../domain/capacity-types.js";

export interface DiscoverCommandOptions {
    url: string;
    method?: string;
    mode?: string;
    window?: string;
    startConcurrency?: string;
    maxConcurrency?: string;
    stepMultiplier?: string;
    untilLimit?: boolean;
    maxErrorRate?: string;
    maxP95?: string;
    stopOnRateLimit?: boolean;
    timeout?: string;
    queueCapacity?: string;
}

export function buildCapacityDiscoveryConfig(
    options: DiscoverCommandOptions
): CapacityDiscoveryConfig {
    const mode =
        options.mode?.trim().toLowerCase() ?? CAPACITY_DEFAULTS.mode;
    const stopPolicy = options.untilLimit ? "rejection" : "slo";
    const defaultMaxConcurrency =
        stopPolicy === "rejection"
            ? REJECTION_MODE_DEFAULT_MAX_CONCURRENCY
            : CAPACITY_DEFAULTS.maxConcurrency;

    const config = {
        url: options.url,
        method: options.method ?? CAPACITY_DEFAULTS.method,
        mode,
        stepDurationSeconds:
            options.window === undefined
                ? CAPACITY_DEFAULTS.stepDurationSeconds
                : Number(options.window),
        initialConcurrency:
            options.startConcurrency === undefined
                ? CAPACITY_DEFAULTS.initialConcurrency
                : Number(options.startConcurrency),
        maxConcurrency:
            options.maxConcurrency === undefined
                ? defaultMaxConcurrency
                : Number(options.maxConcurrency),
        stepMultiplier:
            options.stepMultiplier === undefined
                ? CAPACITY_DEFAULTS.stepMultiplier
                : Number(options.stepMultiplier),
        stopPolicy,
        maxErrorRate:
            options.maxErrorRate === undefined
                ? CAPACITY_DEFAULTS.maxErrorRate
                : Number(options.maxErrorRate),
        maxP95LatencyMs:
            options.maxP95 === undefined ? undefined : Number(options.maxP95),
        maxLatencyMultiplier: CAPACITY_DEFAULTS.maxLatencyMultiplier,
        stopOnRateLimit:
            options.stopOnRateLimit ?? CAPACITY_DEFAULTS.stopOnRateLimit,
        timeout: parseAutoOrNumber(options.timeout, CAPACITY_DEFAULTS.timeout),
        queueCapacity:
            options.queueCapacity === undefined
                ? CAPACITY_DEFAULTS.queueCapacity
                : Number(options.queueCapacity),
    };

    return validateCapacityDiscoveryConfig(config);
}
