"use client"

import { useEffect } from "react"

/**
 * Runs the scroll-in animations a page builder section can ask for.
 *
 * The CSS hides an animated element only under `[data-appear-ready]`, and this
 * is what adds that attribute — so if the script never runs, nothing is ever
 * hidden and the page reads exactly as it would without animation.
 *
 * Elements are found by their `data-appear` marker rather than a ref, because
 * the renderer emits plain HTML and the two do not otherwise know about each
 * other.
 */
export function AppearWatcher({ scopeId }: { scopeId: string }) {
  useEffect(() => {
    const root = document.getElementById(scopeId)
    if (!root) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-appear]"))

    if (reduced || targets.length === 0) return

    root.setAttribute("data-appear-ready", "")

    if (typeof IntersectionObserver === "undefined") {
      // No observer: reveal everything rather than leave the page blank.
      for (const element of targets) element.dataset.appear = "in"
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          ;(entry.target as HTMLElement).dataset.appear = "in"
          // Appear once, not on every pass — re-animating on scroll back up
          // reads as a glitch rather than an effect.
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
    )

    for (const element of targets) observer.observe(element)

    return () => observer.disconnect()
  }, [scopeId])

  return null
}
