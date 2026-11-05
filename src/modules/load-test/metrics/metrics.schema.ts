
import { z } from "zod";

const durationSchema = z
    .number()
    .finite()
    .nonnegative();

const statusCodeSchema = z
    .number()
    .int()
    .min(100)
    .max(599);

const httpMetricSchema = z.object({
    kind: z.literal("http"),
    durationMs: durationSchema,
    statusCode: statusCodeSchema,
});

const networkErrorMetricSchema = z.object({
    kind: z.literal("network_error"),
    durationMs: durationSchema,
});

const timeoutMetricSchema = z.object({
    kind: z.literal("timeout"),
    durationMs: durationSchema,
});

export const requestMetricSchema = z.discriminatedUnion(
    "kind",
    [
        httpMetricSchema,
        networkErrorMetricSchema,
        timeoutMetricSchema,
    ]
);
