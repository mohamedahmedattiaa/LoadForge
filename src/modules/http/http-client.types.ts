import type { HttpRequest } from "./http-request.js";
import type { HttpResponse } from "./http-response.js";


export interface ITransportClient {
    send(request: HttpRequest): Promise<HttpResponse>;
}
