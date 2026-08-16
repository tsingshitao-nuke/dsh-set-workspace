import React, { useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import { SetWorkspacePanel } from './panel'
import { panelStore } from './store'
import { detectLang, tr } from './i18n'
import { ensureStyles } from './styles'

export const inject = ['workspaces', 'sessions', 'slots']

const MOUNT_ID = 'dsh-set-workspace-root'

/** Sidebar footer toggle button (native `sidebar.footer.action` list slot). */
function FooterToggleButton({ wide }: { wide?: boolean }) {
  const lang = detectLang()
  const t = tr(lang)
  const open = useSyncExternalStore(panelStore.subscribe, panelStore.getSnapshot).open
  return (
    <button
      type="button"
      className="dsw-toggle"
      aria-pressed={open}
      title={t('toggle')}
      onClick={() => panelStore.toggle()}
    >
      <FishLogo size={14} />
      {wide ? <span className="dsw-toggle-label">{t('toggle')}</span> : null}
    </button>
  )
}

export function apply(ctx: any): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  ensureStyles()

  // Register the toggle into the sidebar footer so the panel is discoverable.
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      { name: 'sidebar.footer.action', id: 'dsh-set-workspace', order: 50 },
      FooterToggleButton,
    ),
  )

  // Mount the floating file-tree panel into its own React root.
  ctx.effect(() => {
    if (document.getElementById(MOUNT_ID)) return
    const host = document.createElement('div')
    host.id = MOUNT_ID
    document.body.appendChild(host)
    const root = createRoot(host)
    root.render(<SetWorkspacePanel workspaces={ctx.workspaces} sessions={ctx.sessions} />)
    return () => {
      root.unmount()
      host.remove()
    }
  }, 'dsh-set-workspace: panel')
}
