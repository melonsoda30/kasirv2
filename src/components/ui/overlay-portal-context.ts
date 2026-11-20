import { createContext, useCallback, useState } from 'react'
import type { Ref } from 'react'

/** Keep portalled controls inside the nearest modal's focus and pointer boundary. */
export const OverlayPortalContext = createContext<HTMLElement | null>(null)

export function useOverlayPortalContainer<T extends HTMLElement>(forwardedRef?: Ref<T>) {
  const [container, setContainer] = useState<T | null>(null)
  const ref = useCallback((node: T | null) => {
    setContainer(node)
    if (typeof forwardedRef === 'function') {
      const cleanup = forwardedRef(node)
      if (typeof cleanup === 'function') return () => { setContainer(null); cleanup() }
    } else if (forwardedRef) {
      forwardedRef.current = node
    }
  }, [forwardedRef])
  return { container, ref }
}
