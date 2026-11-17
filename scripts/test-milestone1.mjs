import http from "node:http";
import { exec } from "node:child_process";

// 1. Start a local mock server
const server = http.createServer((req, res) => {
    // Artificial 5ms response time
    setTimeout(() => {
        const body = JSON.stringify({ status: "ok" });
        res.writeHead(200, {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
        });
        res.end(body);
    }, 5);
});

server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const url = `http://127.0.0.1:${port}/test`;

    console.log(`[TEST] Mock HTTP server listening on ${url}`);
    console.log(`[TEST] Running LoadForge against mock server for 3 seconds (20 concurrency)...`);

    // Use asynchronous exec so the mock server event loop can process requests!
    exec(
        `node dist/index.js run -u ${url} -c 20 -d 3 --timeout 1000`,
        (err, stdout, stderr) => {
            console.log("\n--- LOADFORGE OUTPUT ---");
            console.log(stdout || stderr);
            console.log("--- END OUTPUT ---");

            server.close(() => {
                console.log("[TEST] Mock server closed.");
                process.exit(0);
            });
        }
    );
});
