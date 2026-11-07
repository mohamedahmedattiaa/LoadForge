#!/usr/bin/env node
import { bootstrap } from "./bootstrap.js";

void bootstrap().catch((error: unknown) => {
  console.error("LoadForge failed to start:", error);
  process.exitCode = 1;
});

