import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  Menu,
  IconFolderClose16,
  IconFolderOpen16,
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconCloseOutline16,
  IconRefreshOutline16,
  IconCopyOutline16,
  IconProjectAddOutline16,
  IconNewChatOutline16,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { detectLang, tr } from './i18n'
import { panelStore } from './store'

interface DirEntry {
  name: string
  path: string
  hidden: boolean
}

interface Level {
  entries?: DirEntry[]
  error?: string
}

interface MenuPos {
  path: string
  x: number
  y: number
}

function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const at = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return at === -1 ? trimmed : trimmed.slice(at + 1)
}

function normPath(path: string): string {
  let value = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const win = typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent)
  if (win) value = value.toLowerCase()
  return value
}

export function SetWorkspacePanel({ workspaces, sessions }: { workspaces: any; sessions: any }) {
  const lang = detectLang()
  const t = tr(lang)

  const open = useSyncExternalStore(panelStore.subscribe, panelStore.getSnapshot).open

  const wsSnap = useSyncExternalStore(
    (cb: () => void) => workspaces.list.subscribe(cb),
    () => workspaces.list.getSnapshot(),
  )
  const sessSnap = useSyncExternalStore(
    (cb: () => void) => sessions.list.subscribe(cb),
    () => sessions.list.getSnapshot(),
  )

  const [root, setRoot] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [data, setData] = useState<Record<string, Level>>({})
  const [menu, setMenu] = useState<MenuPos | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const dataRef = useRef<Record<string, Level>>({})
  const seqRef = useRef(0)
  const toastTimer = useRef<number | null>(null)

  const workspacePaths = useMemo(() => {
    const set = new Set<string>()
    for (const w of (wsSnap as any).items ?? []) set.add(normPath(w.path))
    return set
  }, [wsSnap])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2400)
  }, [])

  const load = useCallback(
    (dir: string) => {
      if (dataRef.current[dir] !== undefined) return
      dataRef.current = { ...dataRef.current, [dir]: {} }
      setData(dataRef.current)
      const seq = ++seqRef.current
      workspaces
        .listDirectory(dir, undefined)
        .then((listing: any) => {
          if (seq !== seqRef.current) return
          dataRef.current = { ...dataRef.current, [dir]: { entries: listing.entries ?? [] } }
          setData(dataRef.current)
        })
        .catch((error: any) => {
          if (seq !== seqRef.current) return
          dataRef.current = {
            ...dataRef.current,
            [dir]: { error: error?.message ?? String(error) },
          }
          setData(dataRef.current)
        })
    },
    [workspaces],
  )

  // Resolve the tree root: current session cwd -> recent workspace -> home.
  useEffect(() => {
    const s = sessSnap as any
    const current = s.current
    const cwd = current != null ? s.byId?.[current]?.cwd : undefined
    if (cwd) {
      setRoot(cwd)
      return
    }
    const w = wsSnap as any
    const recent = (w.items ?? []).find((x: any) => x.workspaceId === w.recentWorkspaceId)
    if (recent) {
      setRoot(recent.path)
      return
    }
    if (root === null) {
      workspaces
        .listDirectory(undefined, undefined)
        .then((listing: any) => setRoot(listing.path))
        .catch(() => {})
    }
  }, [sessSnap, wsSnap, workspaces, root])

  // Reset the tree whenever the root changes.
  useEffect(() => {
    if (root === null) return
    seqRef.current += 1
    dataRef.current = {}
    setData({})
    setExpanded(new Set([root]))
    load(root)
  }, [root, load])

  const toggleDir = useCallback(
    (dir: string) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(dir)) {
          next.delete(dir)
          return next
        }
        next.add(dir)
        load(dir)
        return next
      })
    },
    [load],
  )

  const refresh = useCallback(() => {
    if (root === null) return
    seqRef.current += 1
    dataRef.current = {}
    setData({})
    load(root)
  }, [root, load])

  const openMenu = useCallback((event: ReactMouseEvent, path: string) => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ path, x: event.clientX, y: event.clientY })
  }, [])

  const onMenuSelect = useCallback(
    (id: string) => {
      const target = menu
      if (!target) return
      setMenu(null)
      if (id === 'copy') {
        void writeClipboard(target.path)
        showToast(t('copied'))
        return
      }
      if (id === 'set' || id === 'open') {
        workspaces
          .create({ path: target.path })
          .then((w: any) => {
            if (id === 'open') workspaces.startSession(w.workspaceId)
            else showToast(`${t('setWorkspaceDone')}: ${w.title}`)
          })
          .catch((error: any) => showToast(error?.message ?? String(error)))
      }
    },
    [menu, workspaces, showToast, t],
  )

  const renderRow = (entry: DirEntry, depth: number) => {
    const isOpen = expanded.has(entry.path)
    const isWorkspace = workspacePaths.has(normPath(entry.path))
    return (
      <div key={entry.path}>
        <div
          className="dsw-row"
          style={{ paddingLeft: depth * 16 + 8 }}
          role="button"
          tabIndex={0}
          title={entry.path}
          onClick={() => toggleDir(entry.path)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggleDir(entry.path)
            }
          }}
          onContextMenu={(event) => openMenu(event, entry.path)}
        >
          <span className="dsw-chevron">
            {isOpen ? <IconChevronDownOutline14 size={12} /> : <IconChevronRightOutline14 size={12} />}
          </span>
          {isOpen ? <IconFolderOpen16 size={14} /> : <IconFolderClose16 size={14} />}
          <span className="dsw-name">{entry.name}</span>
          {isWorkspace && (
            <span className="dsw-badge" title={t('alreadyWorkspace')}>
              WS
            </span>
          )}
        </div>
        {isOpen && renderLevel(entry.path, depth + 1)}
      </div>
    )
  }

  const renderLevel = (dir: string, depth: number) => {
    const level = data[dir]
    if (level === undefined) {
      return (
        <div className="dsw-row dsw-muted" style={{ paddingLeft: depth * 16 + 8 }}>
          {t('loading')}
        </div>
      )
    }
    if (level.error !== undefined) {
      return (
        <div className="dsw-row dsw-error" style={{ paddingLeft: depth * 16 + 8 }}>
          {t('error')}: {level.error}
        </div>
      )
    }
    const entries = [...(level.entries ?? [])].sort((a, b) => a.name.localeCompare(b.name))
    if (entries.length === 0) {
      return (
        <div className="dsw-row dsw-muted" style={{ paddingLeft: depth * 16 + 8 }}>
          {t('empty')}
        </div>
      )
    }
    return <>{entries.map((entry) => renderRow(entry, depth))}</>
  }

  if (!open) return null

  return (
    <>
      <div className="dsw-panel" role="dialog" aria-label={t('title')}>
        <div className="dsw-header">
          <span className="dsw-title">{t('title')}</span>
          <button type="button" className="dsw-iconbtn" title={t('refresh')} onClick={refresh}>
            <IconRefreshOutline16 size={14} />
          </button>
          <button
            type="button"
            className="dsw-iconbtn"
            title={t('close')}
            onClick={() => panelStore.close()}
          >
            <IconCloseOutline16 size={14} />
          </button>
        </div>
        <div className="dsw-body">
          {root === null ? (
            <div className="dsw-row dsw-muted">{t('loading')}</div>
          ) : (
            <>
              <div
                className="dsw-row dsw-root"
                role="button"
                tabIndex={0}
                title={root}
                onClick={() => toggleDir(root)}
                onContextMenu={(event) => openMenu(event, root)}
              >
                <span className="dsw-chevron">
                  {expanded.has(root) ? (
                    <IconChevronDownOutline14 size={12} />
                  ) : (
                    <IconChevronRightOutline14 size={12} />
                  )}
                </span>
                <IconFolderOpen16 size={14} />
                <span className="dsw-name">{basename(root)}</span>
                <span className="dsw-rootlabel">{t('root')}</span>
              </div>
              {expanded.has(root) && renderLevel(root, 1)}
            </>
          )}
        </div>
        {toast !== null && (
          <div className="dsw-toast" role="status">
            {toast}
          </div>
        )}
      </div>
      <Menu
        open={menu !== null}
        onClose={() => setMenu(null)}
        items={[
          { id: 'set', label: t('setWorkspace'), icon: <IconProjectAddOutline16 size={14} /> },
          { id: 'open', label: t('openSession'), icon: <IconNewChatOutline16 size={14} /> },
          { id: 'copy', label: t('copyPath'), icon: <IconCopyOutline16 size={14} /> },
        ]}
        onSelect={onMenuSelect}
        portal
        align="start"
        getAnchorRect={() => (menu === null ? null : new DOMRect(menu.x, menu.y, 0, 0))}
        anchor={<span />}
      />
    </>
  )
}
