import type { HttpRequest, HttpResponse } from "./http-types.js";

export interface ITransportClient {
    send(request: HttpRequest): Promise<HttpResponse>;
}
