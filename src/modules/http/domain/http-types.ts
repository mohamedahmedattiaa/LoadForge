export type HttpMethod =
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "HEAD"
    | "OPTIONS";

export interface HttpRequest {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    timeout: number;
}

export interface HttpResponse {
    statusCode: number;
    headers: Headers;
    duration: number;
}

export class HttpTimeoutError extends Error {
    constructor(options?: ErrorOptions) {
        super("HTTP request timed out", options);
        this.name = "HttpTimeoutError";
    }
}

export class HttpNetworkError extends Error {
    constructor(options?: ErrorOptions) {
        super("HTTP network request failed", options);
        this.name = "HttpNetworkError";
    }
}

export function isTimeoutError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    if (
        error.name === "TimeoutError" ||
        error.name === "AbortError" ||
        error.name === "HttpTimeoutError"
    ) {
        return true;
    }

    const message = error.message.toLowerCase();
    if (
        message.includes("timeout") ||
        message.includes("timed out") ||
        message.includes("aborted")
    ) {
        return true;
    }

    if ("cause" in error && error.cause instanceof Error) {
        return isTimeoutError(error.cause);
    }

    return false;
}
