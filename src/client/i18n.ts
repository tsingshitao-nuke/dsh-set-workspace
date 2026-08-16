/** Locale detection and dictionaries for the panel copy. */

export type Lang = 'zh' | 'en'

const zh = {
  title: '文件树',
  toggle: '文件树',
  root: '工作区根目录',
  setWorkspace: '设为工作区',
  openSession: '在新会话中打开',
  copyPath: '复制路径',
  refresh: '刷新',
  close: '关闭',
  loading: '加载中…',
  empty: '（空目录）',
  error: '加载失败',
  alreadyWorkspace: '已是工作区',
  setWorkspaceDone: '已设为工作区',
  copied: '已复制',
} as const

const en: Record<keyof typeof zh, string> = {
  title: 'File Tree',
  toggle: 'File Tree',
  root: 'Workspace root',
  setWorkspace: 'Set as workspace',
  openSession: 'Open in new session',
  copyPath: 'Copy path',
  refresh: 'Refresh',
  close: 'Close',
  loading: 'Loading…',
  empty: '(empty directory)',
  error: 'Load failed',
  alreadyWorkspace: 'Workspace',
  setWorkspaceDone: 'Set as workspace',
  copied: 'Copied',
}

export function detectLang(): Lang {
  if (typeof document !== 'undefined') {
    const lang = (document.documentElement.getAttribute('lang') || '').toLowerCase()
    if (lang.startsWith('zh')) return 'zh'
  }
  if (typeof navigator !== 'undefined' && (navigator.language || '').toLowerCase().startsWith('zh')) return 'zh'
  return 'en'
}

export function tr(lang: Lang): (key: keyof typeof zh) => string {
  return (key) => (lang === 'zh' ? zh[key] : en[key])
}
