import { z } from "zod";
import {
    createAutoOrPositiveIntSchema,
    httpMethodSchema,
    httpUrlSchema,
} from "../../load-test/application/load-test-validation.js";
import type { CapacityDiscoveryConfig } from "../domain/capacity-types.js";

export const capacityDiscoveryConfigSchema = z
    .object({
        url: httpUrlSchema,
        method: httpMethodSchema,
        mode: z.enum(["sustained", "burst"]),
        stepDurationSeconds: z
            .number()
            .positive("Step duration must be a positive number"),
        initialConcurrency: z
            .number()
            .int("Initial concurrency must be a positive integer")
            .min(1, "Initial concurrency must be a positive integer"),
        maxConcurrency: z
            .number()
            .int("Max concurrency must be a positive integer")
            .min(1, "Max concurrency must be a positive integer"),
        stepMultiplier: z
            .number()
            .gt(1, "Step multiplier must be greater than 1"),
        stopPolicy: z.enum(["slo", "rejection"]),
        maxErrorRate: z
            .number()
            .min(0, "Max error rate must be between 0 and 1")
            .max(1, "Max error rate must be between 0 and 1"),
        maxP95LatencyMs: z
            .number()
            .positive("Max p95 latency must be a positive number")
            .optional(),
        maxLatencyMultiplier: z
            .number()
            .gt(1, "Max latency multiplier must be greater than 1"),
        stopOnRateLimit: z.boolean(),
        timeout: createAutoOrPositiveIntSchema("Timeout"),
        queueCapacity: z
            .number()
            .int("Queue capacity must be a positive integer")
            .min(1, "Queue capacity must be a positive integer"),
    })
    .superRefine((config, ctx) => {
        if (config.maxConcurrency < config.initialConcurrency) {
            ctx.addIssue({
                code: "custom",
                path: ["maxConcurrency"],
                message:
                    "Max concurrency must be greater than or equal to initial concurrency",
            });
        }
    });

export function validateCapacityDiscoveryConfig(
    config: unknown
): CapacityDiscoveryConfig {
    return capacityDiscoveryConfigSchema.parse(config);
}
