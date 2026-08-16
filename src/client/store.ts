/**
 * A tiny module-level store shared by the sidebar footer toggle button and the
 * floating panel. Both are separate React roots, so the panel visibility state
 * lives here and is read through `useSyncExternalStore`.
 */

export interface PanelState {
  open: boolean
}

let state: PanelState = { open: false }
const listeners = new Set<() => void>()

export const panelStore = {
  getSnapshot: (): PanelState => state,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  toggle: (): void => {
    state = { open: !state.open }
    for (const listener of listeners) listener()
  },
  close: (): void => {
    if (!state.open) return
    state = { open: false }
    for (const listener of listeners) listener()
  },
}
