import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LoadTestReport } from "../../src/modules/metrics/domain/metrics-types.js";
import { FileReportRepository } from "../../src/modules/metrics/infrastructure/file-report-repository.js";

function sampleLoadTestReport(): LoadTestReport {
    return {
        totalRequests: 100,
        successfulRequests: 98,
        failedRequests: 2,
        httpErrors: 2,
        networkErrors: 0,
        timeouts: 0,
        durationMs: 1200,
        requestsPerSecond: 83.33,
        statusCodes: { "200": 98, "500": 2 },
        latency: {
            min: 12,
            max: 140,
            average: 42.5,
            p50: 38,
            p90: 90,
            p95: 112,
            p99: 135,
        },
    };
}

describe("FileReportRepository", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), "loadforge-reports-test-"));
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    it("saves JSON report and returns it via list() in newest-first order", async () => {
        const repo = new FileReportRepository(tempDir);
        expect(repo.getReportsDirectory()).toBe(tempDir);

        const first = await repo.save({
            kind: "load-test",
            targetUrl: "https://api.example.com/first",
            method: "GET",
            report: sampleLoadTestReport(),
        });

        await new Promise((resolve) => setTimeout(resolve, 15));

        const second = await repo.save({
            kind: "load-test",
            targetUrl: "https://api.example.com/second",
            method: "POST",
            report: sampleLoadTestReport(),
        });

        const entries = await repo.list();
        expect(entries).toHaveLength(2);
        expect(entries[0].record.id).toBe(second.record.id);
        expect(entries[0].record.targetUrl).toBe(
            "https://api.example.com/second"
        );
        expect(entries[1].record.id).toBe(first.record.id);
    });

    it("ignores corrupt or non-report JSON files when listing", async () => {
        const repo = new FileReportRepository(tempDir);

        await writeFile(join(tempDir, "broken.json"), "{ invalid json", "utf8");
        await writeFile(
            join(tempDir, "other.json"),
            JSON.stringify({ hello: "world" }),
            "utf8"
        );
        await writeFile(join(tempDir, "notes.txt"), "ignore me", "utf8");

        await repo.save({
            kind: "load-test",
            targetUrl: "https://api.example.com/valid",
            method: "GET",
            report: sampleLoadTestReport(),
        });

        const entries = await repo.list();
        expect(entries).toHaveLength(1);
        expect(entries[0].record.targetUrl).toBe(
            "https://api.example.com/valid"
        );
    });
});
