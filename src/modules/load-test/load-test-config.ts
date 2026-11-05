
import { z } from "zod";

const SUPPORTED_METHODS = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
] as const;

const httpMethodSchema = z
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

export const loadTestConfigSchema = z
    .object({
        url: z.string().superRefine((value, ctx) => {
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
        }),

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

        concurrency: z
            .number()
            .int("Concurrency must be a positive integer")
            .min(1, "Concurrency must be a positive integer"),

        timeout: z
            .number()
            .int("Timeout must be a positive integer")
            .min(1, "Timeout must be a positive integer"),

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

// Output type: validated configuration with an uppercase HTTP method.
export type LoadTestConfig = z.infer<typeof loadTestConfigSchema>;

// Input type: raw configuration before transformations.
export type LoadTestConfigInput = z.input<typeof loadTestConfigSchema>;

export function validateLoadTestConfig(
    config: unknown
): LoadTestConfig {
    return loadTestConfigSchema.parse(config);
}
