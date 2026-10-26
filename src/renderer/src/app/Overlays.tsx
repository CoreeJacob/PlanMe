import { useEffect, useRef, useState } from 'react'
import { useApp } from './store'

export function PromptDialog() {
  const prompt = useApp((s) => s.prompt)
  const closePrompt = useApp((s) => s.closePrompt)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!prompt) return
    setValue(prompt.value)
    requestAnimationFrame(() => inputRef.current?.select())
  }, [prompt])

  if (!prompt) return null

  return (
    <div className="modal-backdrop" onMouseDown={() => closePrompt(null)}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) closePrompt(value.trim())
        }}
        onKeyDown={(e) => e.key === 'Escape' && closePrompt(null)}
      >
        <h2>{prompt.title}</h2>
        {prompt.label && <p className="muted">{prompt.label}</p>}
        <input ref={inputRef} className="input" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => closePrompt(null)}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!value.trim()}>
            {prompt.confirmLabel ?? 'OK'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="toast-message">{t.message}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                dismiss(t.id)
                t.action!.run()
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
