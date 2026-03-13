/**
 * server/rates.ts — COMPATIBILITY SHIM
 *
 * All business logic has moved to server/lib/.
 * This file re-exports from lib/super.ts so existing imports continue to work
 * without touching every file that does `import { getSuperRate } from "./rates"`.
 *
 * Phase 5 migration status: COMPLETE
 * Next step (Phase 6): update all direct imports to use "./lib/index" and delete this file.
 */

export {
  getSuperRate,
  getSuperRateForFY,
  getAustralianFY,
  calculatePayRate,
  calculateChargeOutFromPayRate,
  calculateSuperAmount,
} from "./lib/super";
