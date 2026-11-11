import { LOAD_TEST_DEFAULTS } from "../../../application/load-test-defaults.js";
import { validateLoadTestConfig } from "../../../application/load-test-validation.js";
import type { LoadTestConfig } from "../../../domain/load-test-types.js";

export interface RunCommandOptions {
    url: string;
    method?: string;
    requests?: string;
    duration?: string;
    concurrency?: string;
    timeout?: string;
    queueCapacity?: string;
}

export function parseAutoOrNumber(
    value: string | undefined,
    fallback: number | "auto"
): number | "auto" {
    if (value === undefined) {
        return fallback;
    }

    if (value.trim().toLowerCase() === "auto") {
        return "auto";
    }

    return Number(value);
}

export function buildLoadTestConfig(
    options: RunCommandOptions
): LoadTestConfig {
    const config = {
        url: options.url,
        method: options.method ?? LOAD_TEST_DEFAULTS.method,
        concurrency: parseAutoOrNumber(
            options.concurrency,
            LOAD_TEST_DEFAULTS.concurrency
        ),
        timeout: parseAutoOrNumber(
            options.timeout,
            LOAD_TEST_DEFAULTS.timeout
        ),
        queueCapacity: Number(
            options.queueCapacity ?? LOAD_TEST_DEFAULTS.queueCapacity
        ),
        requests:
            options.requests === undefined
                ? undefined
                : Number(options.requests),
        duration:
            options.duration === undefined
                ? undefined
                : Number(options.duration),
    };

    return validateLoadTestConfig(config);
}
