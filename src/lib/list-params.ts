/**
 * Query-string helpers for the dashboard lists.
 *
 * Deliberately not in the `"use client"` components that use them: server
 * components read these params while rendering, and a function exported from a
 * client module cannot be called on the server.
 */

export const PAGE_SIZES = [10, 25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25

export type ViewMode = "cards" | "table"

export function readPageSize(value: unknown) {
  const parsed = Number(typeof value === "string" ? value : "")
  return (PAGE_SIZES as readonly number[]).includes(parsed) ? parsed : DEFAULT_PAGE_SIZE
}

export function readView(value: unknown, fallback: ViewMode = "cards"): ViewMode {
  return value === "table" || value === "cards" ? value : fallback
}

export function readPage(value: unknown) {
  const parsed = Number(typeof value === "string" ? value : "")
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1
}
