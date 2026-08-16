/**
 * Inline styles injected once into `document.head`. Uses the DSH design-token
 * CSS variables (light/dark themed) with sensible fallbacks so the panel
 * matches the surrounding UI without any external stylesheet.
 */

const CSS = `
.dsw-panel{position:fixed;top:68px;right:16px;z-index:9990;width:320px;max-width:calc(100vw - 32px);max-height:calc(100vh - 96px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-module-platform,#ffffff);color:var(--dsw-alias-label-primary,#1f2328);border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.18);overflow:hidden;font-size:13px;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2,rgba(0,0,0,.12))}
.dsw-header{display:flex;align-items:center;gap:2px;padding:10px 10px 8px 14px;border-bottom:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.08));flex:none}
.dsw-title{font-size:13px;font-weight:600;flex:1}
.dsw-iconbtn{cursor:pointer;width:26px;height:26px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#57606a);display:inline-flex;align-items:center;justify-content:center}
.dsw-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.dsw-body{overflow:auto;padding:4px 0;flex:1;min-height:0}
.dsw-row{display:flex;align-items:center;gap:5px;padding:3px 10px;line-height:20px;cursor:pointer;border-radius:6px;margin:1px 6px;white-space:nowrap;user-select:none}
.dsw-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.dsw-chevron{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary,#8b949e)}
.dsw-name{overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.dsw-badge{flex:none;font-size:10px;line-height:1;padding:2px 5px;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.08));color:var(--dsw-alias-label-secondary,#57606a);letter-spacing:.02em}
.dsw-root{font-weight:600}
.dsw-rootlabel{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#8b949e)}
.dsw-muted{color:var(--dsw-alias-label-tertiary,#8b949e);cursor:default}
.dsw-error{color:#e5484d;cursor:default}
.dsw-toast{position:absolute;left:12px;right:12px;bottom:12px;padding:8px 12px;border-radius:8px;background:var(--dsw-alias-label-primary,#1f2328);color:var(--dsw-alias-bg-module-platform,#fff);font-size:12px;box-shadow:0 6px 20px rgba(0,0,0,.2);pointer-events:none}
.dsw-toggle{cursor:pointer;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#57606a);display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;font-size:13px}
.dsw-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.dsw-toggle[aria-pressed="true"]{color:var(--dsw-alias-label-primary,#1f2328)}
.dsw-toggle-label{white-space:nowrap}
`

let installed = false

export function ensureStyles(): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-set-workspace'
  tag.textContent = CSS
  document.head.appendChild(tag)
}
