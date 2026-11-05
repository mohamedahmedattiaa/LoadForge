import {
    LOAD_TEST_DEFAULTS,
} from "../../modules/load-test/load-test-defaults.js";

import {
    validateLoadTestConfig,
    type LoadTestConfig,
} from "../../modules/load-test/load-test-config.js";

export interface RunCommandOptions {
    url: string;
    method?: string;
    requests?: string;
    duration?: string;
    concurrency?: string;
    timeout?: string;
    queueCapacity?: string;
}

export function buildLoadTestConfig(
    options: RunCommandOptions
): LoadTestConfig {
    const config = {
        url: options.url,
        method: options.method ?? LOAD_TEST_DEFAULTS.method,
        concurrency: Number(
            options.concurrency ?? LOAD_TEST_DEFAULTS.concurrency
        ),
        timeout: Number(
            options.timeout ?? LOAD_TEST_DEFAULTS.timeout
        ),
        queueCapacity: Number(
            options.queueCapacity ?? LOAD_TEST_DEFAULTS.queueCapacity
        ),
        requests: options.requests === undefined
            ? undefined
            : Number(options.requests),
        duration: options.duration === undefined
            ? undefined
            : Number(options.duration),
    };

    return validateLoadTestConfig(config);
}