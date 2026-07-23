/* Single source of truth lives in src/domain/signalEngine.ts (runtime-neutral).
 * This module re-exports it so existing `@/lib/signalEngine` importers keep
 * working without a second implementation. */
export * from '@/domain/signalEngine';
