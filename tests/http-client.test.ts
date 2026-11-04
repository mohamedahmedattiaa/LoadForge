import { describe, it, expect, vi, afterEach } from "vitest";
import { HttpClient } from "../src/modules/http/http-client.js";

describe("HttpClient", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("should send a GET request and receive a response", async () => {
        // Arrange
        const mockResponse = new Response(null, { status: 200 });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(mockResponse)
        );

        const client = new HttpClient();

        // Act
        const result = await client.send({
            url: "https://example.com",
            method: "GET",
            timeout: 5000,
        });

        // Assert
        expect(result.statusCode).toBe(200);
        expect(result.duration).toBeGreaterThanOrEqual(0);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("should handle HTTP 500 without throwing", async () => {
        // Arrange
        const mockResponse = new Response(null, { status: 500 });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(mockResponse)
        );

        const client = new HttpClient();

        // Act
        const result = await client.send({
            url: "https://example.com",
            method: "GET",
            timeout: 5000,
        });

        // Assert
        expect(result.statusCode).toBe(500);
        expect(result.duration).toBeGreaterThanOrEqual(0);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("should handle HTTP 404 without throwing", async () => {
        // Arrange
        const mockResponse = new Response(null, { status: 404 });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(mockResponse)
        );

        const client = new HttpClient();

        // Act
        const result = await client.send({
            url: "https://example.com",
            method: "GET",
            timeout: 5000,
        });

        // Assert
        expect(result.statusCode).toBe(404);
        expect(result.duration).toBeGreaterThanOrEqual(0);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("should propagate network errors", async () => {
        // Arrange
        vi.stubGlobal(
            "fetch",
            vi.fn().mockRejectedValue(new Error("Network error"))
        );

        const client = new HttpClient();

        // Act & Assert
        await expect(
            client.send({
                url: "https://example.com",
                method: "GET",
                timeout: 5000,
            })
        ).rejects.toThrow("Network error");
    });

    it("should handle request timeouts", async () => {
        // Arrange
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(
                (_url: string, options: RequestInit) => {
                    return new Promise<Response>((_, reject) => {
                        options.signal?.addEventListener("abort", () => {
                            reject(
                                new DOMException(
                                    "The operation was aborted",
                                    "AbortError"
                                )
                            );
                        }, { once: true });
                    });
                }
            )
        );

        const client = new HttpClient();

        // Act & Assert
        await expect(
            client.send({
                url: "https://example.com",
                method: "GET",
                timeout: 100,
            })
        ).rejects.toThrow(
            expect.objectContaining({
                name: "AbortError",
            })
        );
    });

    it("should consume the response body",async () => {
        // Arrange
        const mockResponse = new Response("Hello, from server!", { status: 200 });
        

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(mockResponse)
        );

        const client = new HttpClient();

        // Act
        await client.send({
            url: "https://example.com",
            method: "GET",
             timeout: 5000,
        });

        // Assert
         expect(mockResponse.bodyUsed).toBe(true);
    });
  });
