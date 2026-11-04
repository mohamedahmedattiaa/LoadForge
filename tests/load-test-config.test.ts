import { describe, it, expect } from "vitest";
import {
    validateLoadTestConfig,
    type LoadTestConfigInput,
} from "../src/modules/load-test/load-test-config.js";

// Reusable test configuration factory.
// Uses the INPUT type because tests pass raw values
// (lowercase methods, invalid methods) that are only
// narrowed after validation.
function createValidConfig(
    overrides: Partial<LoadTestConfigInput> = {}
): LoadTestConfigInput {
    return {
        url: "http://example.com",
        method: "GET",
        requests: 10,
        concurrency: 2,
        timeout: 1000,
        queueCapacity: 5,
        ...overrides,
    };
}

describe("validateLoadTestConfig", () => {
    describe("URL validation", () => {
        it("should accept a valid HTTP URL", () => {
            const config = createValidConfig();

            expect(() => validateLoadTestConfig(config)).not.toThrow();
        });

        it("should accept a valid HTTPS URL", () => {
            const config = createValidConfig({
                url: "https://example.com",
            });

            expect(() => validateLoadTestConfig(config)).not.toThrow();
        });

        it("should reject an invalid URL", () => {
            const config = createValidConfig({
                url: "invalid-url",
            });

            expect(() => validateLoadTestConfig(config))
                .toThrow("Invalid URL provided");
        });

        it("should reject unsupported URL protocols", () => {
            const config = createValidConfig({
                url: "ftp://example.com",
            });

            expect(() => validateLoadTestConfig(config))
                .toThrow("Only HTTP and HTTPS URLs are supported");
        });
    });

    describe("HTTP method validation", () => {
        it("should accept supported HTTP methods", () => {
            const methods = [
                "GET",
                "POST",
                "PUT",
                "PATCH",
                "DELETE",
                "HEAD",
                "OPTIONS",
            ];

            for (const method of methods) {
                const config = createValidConfig({ method });

                expect(() => validateLoadTestConfig(config)).not.toThrow();
            }
        });

        it("should accept lowercase HTTP methods", () => {
            const config = createValidConfig({
                method: "get",
            });

            expect(() => validateLoadTestConfig(config)).not.toThrow();
        });

        it("should reject unsupported HTTP methods", () => {
            const config = createValidConfig({
                method: "INVALID",
            });

            expect(() => validateLoadTestConfig(config))
                .toThrow("Unsupported HTTP method: INVALID");
        });
    });

    describe("Request count validation", () => {
        it("should accept zero requests", () => {
            const config = createValidConfig({
                requests: 0,
            });

            expect(() => validateLoadTestConfig(config)).not.toThrow();
        });

        it("should reject negative requests", () => {
            const config = createValidConfig({
                requests: -1,
            });

            expect(() => validateLoadTestConfig(config))
                .toThrow("Requests must be a non-negative integer");
        });

        it("should reject decimal request counts", () => {
            const config = createValidConfig({
                requests: 2.5,
            });

            expect(() => validateLoadTestConfig(config))
                .toThrow("Requests must be a non-negative integer");
        });
    });

    describe("Concurrency validation", () => {
        it("should accept positive integer concurrency", () => {
            const config = createValidConfig({
                concurrency: 10,
            });

            expect(() => validateLoadTestConfig(config)).not.toThrow();
        });

        it("should reject zero concurrency", () => {
            const config = createValidConfig({
                concurrency: 0,
            });

            expect(() => validateLoadTestConfig(config))
                .toThrow("Concurrency must be a positive integer");
        });

        it("should reject negative concurrency", () => {
            const config = createValidConfig({
                concurrency: -1,
            });

            expect(() => validateLoadTestConfig(config))
                .toThrow("Concurrency must be a positive integer");
        });

        it("should reject decimal concurrency", () => {
            const config = createValidConfig({
                concurrency: 2.5,
            });

            expect(() => validateLoadTestConfig(config))
                .toThrow("Concurrency must be a positive integer");
        });
    });

    describe("Timeout validation", () => {
        it("should accept positive integer timeout", () => {
            const config = createValidConfig({
                timeout: 5000,
            });

            expect(() => validateLoadTestConfig(config)).not.toThrow();
        });

        it("should reject zero timeout", () => {
            const config = createValidConfig({
                timeout: 0,
            });

            expect(() => validateLoadTestConfig(config))
                .toThrow("Timeout must be a positive integer");
        });

        it("should reject negative timeout", () => {
            const config = createValidConfig({
                timeout: -100,
            });

            expect(() => validateLoadTestConfig(config))
                .toThrow("Timeout must be a positive integer");
        });

        it("should reject decimal timeout", () => {
            const config = createValidConfig({
                timeout: 1000.5,
            });

            expect(() => validateLoadTestConfig(config))
                .toThrow("Timeout must be a positive integer");
        });
    });

    describe("Queue capacity validation", () => {
        it("should accept positive integer queue capacity", () => {
            const config = createValidConfig({
                queueCapacity: 100,
            });

            expect(() => validateLoadTestConfig(config)).not.toThrow();
        });

        it("should reject zero queue capacity", () => {
            const config = createValidConfig({
                queueCapacity: 0,
            });

            expect(() => validateLoadTestConfig(config))
                .toThrow("Queue capacity must be a positive integer");
        });

        it("should reject negative queue capacity", () => {
            const config = createValidConfig({
                queueCapacity: -1,
            });

            expect(() => validateLoadTestConfig(config))
                .toThrow("Queue capacity must be a positive integer");
        });

        it("should reject decimal queue capacity", () => {
            const config = createValidConfig({
                queueCapacity: 2.5,
            });

            expect(() => validateLoadTestConfig(config))
                .toThrow("Queue capacity must be a positive integer");
        });
    });

    it("should normalize HTTP methods to uppercase", () => {
        const config = createValidConfig({ method: "get" });

        const result = validateLoadTestConfig(config);

        expect(result.method).toBe("GET");
        expect(config.method).toBe("get");
    });
});