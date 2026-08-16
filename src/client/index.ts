/**
 * dsh-set-workspace — client half.
 *
 * When the shell bridge registers a workspace and starts a session in it, the
 * session id carries a `dsw-open-` prefix. This client plugin watches the
 * session list for such a session and opens it, so the DSH page switches to
 * the freshly opened workspace without any page reload.
 * @module dsh-set-workspace/client
 */
export const inject = ['sessions']

const PREFIX = 'dsw-open-'

export function apply(ctx: any): void {
  if (typeof window === 'undefined') return

  const seen = new Set<string>()

  const check = (): void => {
    const snapshot = ctx.sessions.list.getSnapshot()
    for (const id of snapshot.ids ?? []) {
      if (typeof id === 'string' && id.startsWith(PREFIX) && !seen.has(id)) {
        seen.add(id)
        ctx.sessions.open(id)
      }
    }
  }

  ctx.effect(() => ctx.sessions.list.subscribe(check), 'dsh-set-workspace: auto-open session')
  check()
}
