import { describe, expect, it } from "vitest";
import { NodeGeneratorHealthMonitor } from "../../src/modules/metrics/infrastructure/node-generator-health-monitor.js";

describe("NodeGeneratorHealthMonitor", () => {
    it("reports HEALTHY under normal asynchronous execution", async () => {
        const monitor = new NodeGeneratorHealthMonitor();
        monitor.start();

        // Normal async sleep allows the event loop to spin freely
        await new Promise((resolve) => setTimeout(resolve, 40));

        const snapshot = monitor.getSnapshot();

        expect(snapshot.healthState).toBe("HEALTHY");
        expect(snapshot.eventLoopP50Ms).toBeLessThan(20);
        expect(snapshot.heapUsedMb).toBeGreaterThan(0);
        expect(snapshot.rssMb).toBeGreaterThan(0);
        expect(snapshot.warningMessage).toBeUndefined();

        monitor.stop();
    });

    it("detects a synchronous event-loop stall and triggers SATURATED status", async () => {
        const monitor = new NodeGeneratorHealthMonitor();
        monitor.start();

        // Give monitor a clean initial tick
        await new Promise((resolve) => setTimeout(resolve, 20));

        // Intentionally freeze the single-threaded Node.js event loop synchronously for 70ms
        const stallTarget = performance.now() + 70;
        while (performance.now() < stallTarget) {
            // Synchronous busy loop blocking the event loop
        }

        // Allow libuv to sample the delayed timer
        await new Promise((resolve) => setTimeout(resolve, 30));

        const snapshot = monitor.getSnapshot();

        // The monitor must have caught the 70ms stall
        expect(snapshot.eventLoopMaxMs).toBeGreaterThanOrEqual(50);
        expect(["SATURATED", "DEGRADED"]).toContain(snapshot.healthState);
        expect(snapshot.warningMessage).toBeDefined();
        expect(snapshot.warningMessage).toContain("Load generator");

        monitor.stop();
    });

    it("resets statistics cleanly", async () => {
        const monitor = new NodeGeneratorHealthMonitor();
        monitor.start();

        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(monitor.getSnapshot().heapUsedMb).toBeGreaterThan(0);

        monitor.reset();
        // After reset, stopped state
        expect(monitor.getSnapshot().healthState).toBe("HEALTHY");
    });
});
