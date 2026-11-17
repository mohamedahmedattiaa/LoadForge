import type { CapacityReport } from "../../capacity/domain/capacity-types.js";
import type { HttpMethod } from "../../http/domain/http-types.js";
import type { LoadTestReport } from "./metrics-types.js";

export type SavedReportRecord =
    | {
          id: string;
          kind: "load-test";
          createdAt: string;
          targetUrl: string;
          method: HttpMethod;
          report: LoadTestReport;
      }
    | {
          id: string;
          kind: "capacity";
          createdAt: string;
          targetUrl: string;
          method: HttpMethod;
          report: CapacityReport;
      };

export type NewSavedReportInput =
    | {
          kind: "load-test";
          targetUrl: string;
          method: HttpMethod;
          report: LoadTestReport;
      }
    | {
          kind: "capacity";
          targetUrl: string;
          method: HttpMethod;
          report: CapacityReport;
      };

export interface StoredReportEntry {
    filePath: string;
    record: SavedReportRecord;
}

export interface IReportRepository {
    getReportsDirectory(): string;
    save(input: NewSavedReportInput): Promise<StoredReportEntry>;
    list(): Promise<StoredReportEntry[]>;
}
