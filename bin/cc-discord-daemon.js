#!/usr/bin/env node
import { runLoop } from "../src/daemon/service.js";

try {
  await runLoop();
} catch (err) {
  console.error(`cc-discord daemon failed: ${err.message}`);
  process.exit(1);
}
