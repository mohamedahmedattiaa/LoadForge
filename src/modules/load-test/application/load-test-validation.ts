import { z } from "zod";
import type { LoadTestConfig } from "../domain/load-test-types.js";

const SUPPORTED_METHODS = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
] as const;

export const httpMethodSchema = z
    .string()
    .transform((method) => method.toUpperCase())
    .pipe(
        z.string().superRefine((method, ctx) => {
            if (
                !SUPPORTED_METHODS.includes(
                    method as (typeof SUPPORTED_METHODS)[number]
                )
            ) {
                ctx.addIssue({
                    code: "custom",
                    message: `Unsupported HTTP method: ${method}`,
                });
            }
        })
    )
    .pipe(z.enum(SUPPORTED_METHODS));

export const httpUrlSchema = z.string().superRefine((value, ctx) => {
    if (!URL.canParse(value)) {
        ctx.addIssue({
            code: "custom",
            message: "Invalid URL provided",
        });
        return;
    }

    const protocol = new URL(value).protocol;

    if (protocol !== "http:" && protocol !== "https:") {
        ctx.addIssue({
            code: "custom",
            message: "Only HTTP and HTTPS URLs are supported",
        });
    }
});

export function createAutoOrPositiveIntSchema(fieldLabel: string) {
    return z
        .custom<number | "auto">(
            (value) => value === "auto" || typeof value === "number",
            {
                message: `${fieldLabel} must be "auto" or a positive integer`,
            }
        )
        .superRefine((value, ctx) => {
            if (value === "auto") {
                return;
            }

            if (!Number.isInteger(value) || value < 1) {
                ctx.addIssue({
                    code: "custom",
                    message: `${fieldLabel} must be a positive integer`,
                });
            }
        });
}

export const loadTestConfigSchema = z
    .object({
        url: httpUrlSchema,

        method: httpMethodSchema,

        requests: z
            .number()
            .int("Requests must be a non-negative integer")
            .min(0, "Requests must be a non-negative integer")
            .optional(),

        duration: z
            .number()
            .positive("Duration must be a positive number")
            .optional(),

        concurrency: createAutoOrPositiveIntSchema("Concurrency"),

        timeout: createAutoOrPositiveIntSchema("Timeout"),

        queueCapacity: z
            .number()
            .int("Queue capacity must be a positive integer")
            .min(1, "Queue capacity must be a positive integer"),
    })
    .superRefine((config, ctx) => {
        if (
            config.requests === undefined &&
            config.duration === undefined
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["requests"],
                message: "Provide at least requests or duration",
            });
        }
    });

export type LoadTestConfigInput = z.input<typeof loadTestConfigSchema>;

export function validateLoadTestConfig(config: unknown): LoadTestConfig {
    return loadTestConfigSchema.parse(config);
}
