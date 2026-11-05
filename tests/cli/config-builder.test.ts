
import { describe, it, expect } from "vitest";

import {
    buildLoadTestConfig,
    type RunCommandOptions,
} from "../../src/cli/config/config-builder.js";

import { LOAD_TEST_DEFAULTS } from "../../src/modules/load-test/load-test-defaults.js";

describe("buildLoadTestConfig", () => {
    it("should apply default values when optional options are omitted", () => {
        const options: RunCommandOptions = {
            url: "https://example.com",
            requests: "100",
        };

        const config = buildLoadTestConfig(options);

        expect(config).toEqual({
            url: "https://example.com",
            method: LOAD_TEST_DEFAULTS.method,
            concurrency: LOAD_TEST_DEFAULTS.concurrency,
            timeout: LOAD_TEST_DEFAULTS.timeout,
            queueCapacity: LOAD_TEST_DEFAULTS.queueCapacity,
            requests: 100,
            duration: undefined,
        });
    });

    it("should convert numeric strings into numbers", () => {
        const options: RunCommandOptions = {
            url: "https://example.com",
            concurrency: "20",
            timeout: "3000",
            queueCapacity: "200",
            requests: "1000",
        };

        const config = buildLoadTestConfig(options);

        expect(config.concurrency).toBe(20);
        expect(config.timeout).toBe(3000);
        expect(config.queueCapacity).toBe(200);
        expect(config.requests).toBe(1000);

        expect(typeof config.concurrency).toBe("number");
        expect(typeof config.timeout).toBe("number");
        expect(typeof config.queueCapacity).toBe("number");
        expect(typeof config.requests).toBe("number");
    });

    it("should support custom HTTP methods", () => {
        const options: RunCommandOptions = {
            url: "https://example.com",
            method: "post",
            requests: "100",
        };

        const config = buildLoadTestConfig(options);

        expect(config.method).toBe("POST");
    });

    it("should support duration-based configuration", () => {
        const options: RunCommandOptions = {
            url: "https://example.com",
            duration: "30",
        };

        const config = buildLoadTestConfig(options);

        expect(config.duration).toBe(30);
        expect(config.requests).toBeUndefined();
    });

    it("should support both requests and duration", () => {
        const options: RunCommandOptions = {
            url: "https://example.com",
            requests: "1000",
            duration: "60",
        };

        const config = buildLoadTestConfig(options);

        expect(config.requests).toBe(1000);
        expect(config.duration).toBe(60);
    });

    it("should reject invalid concurrency", () => {
        const options: RunCommandOptions = {
            url: "https://example.com",
            requests: "100",
            concurrency: "abc",
        };

        expect(() => buildLoadTestConfig(options)).toThrow();
    });

    it("should reject zero concurrency", () => {
        const options: RunCommandOptions = {
            url: "https://example.com",
            requests: "100",
            concurrency: "0",
        };

        expect(() => buildLoadTestConfig(options)).toThrow();
    });

    it("should reject negative concurrency", () => {
        const options: RunCommandOptions = {
            url: "https://example.com",
            requests: "100",
            concurrency: "-5",
        };

        expect(() => buildLoadTestConfig(options)).toThrow();
    });

    it("should reject invalid URLs", () => {
        const options: RunCommandOptions = {
            url: "not-a-valid-url",
            requests: "100",
        };

        expect(() => buildLoadTestConfig(options)).toThrow();
    });

    it("should reject unsupported HTTP methods", () => {
        const options: RunCommandOptions = {
            url: "https://example.com",
            method: "INVALID",
            requests: "100",
        };

        expect(() => buildLoadTestConfig(options)).toThrow();
    });

    it("should reject configuration without requests or duration", () => {
        const options: RunCommandOptions = {
            url: "https://example.com",
        };

        expect(() => buildLoadTestConfig(options)).toThrow(
            "Provide at least requests or duration"
        );
    });

    it("should reject negative requests", () => {
        const options: RunCommandOptions = {
            url: "https://example.com",
            requests: "-10",
        };

        expect(() => buildLoadTestConfig(options)).toThrow();
    });

    it("should reject non-numeric requests", () => {
        const options: RunCommandOptions = {
            url: "https://example.com",
            requests: "abc",
        };

        expect(() => buildLoadTestConfig(options)).toThrow();
    });
});
