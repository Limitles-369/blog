'use client'

import { useId, useRef, useState } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error'

interface Props {
  /** Submit target. Defaults to the built-in route backed by siteMetadata.newsletter.provider. */
  apiUrl?: string
  /** Visible label above the field. */
  label?: string
}

/**
 * Replaces pliny's NewsletterForm, which renders white text on primary-500
 * (2.4:1, fails AA) and announces nothing to screen readers on success or
 * failure. This version uses the accent tokens and an aria-live region.
 */
export default function NewsletterForm({
  apiUrl = '/api/newsletter',
  label = 'Email address',
}: Props) {
  const inputId = useId()
  const inputEl = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  const subscribe = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const email = inputEl.current?.value?.trim()
    if (!email) return

    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || data?.error) {
        setStatus('error')
        setMessage('That address looks invalid, or it is already subscribed.')
        return
      }

      if (inputEl.current) inputEl.current.value = ''
      setStatus('success')
      setMessage('You are subscribed. Thanks for reading.')
    } catch {
      setStatus('error')
      setMessage('Something went wrong. Please try again in a moment.')
    }
  }

  const isDone = status === 'success'

  return (
    <div className="mx-auto w-full max-w-md">
      <form onSubmit={subscribe} className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor={inputId} className="sr-only">
            {label}
          </label>
          <input
            ref={inputEl}
            id={inputId}
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={isDone || status === 'loading'}
            placeholder="you@example.com"
            aria-describedby={message ? `${inputId}-status` : undefined}
            aria-invalid={status === 'error' || undefined}
            className="border-edge focus:border-accent focus:ring-accent/30 dark:bg-page-dark dark:focus:border-accent min-h-11 w-full rounded-full border bg-white px-5 text-sm text-gray-900 placeholder-gray-500 transition-all focus:ring-2 focus:outline-none disabled:opacity-60 dark:border-white/10 dark:text-white dark:placeholder-gray-400"
          />
        </div>
        <button
          type="submit"
          disabled={isDone || status === 'loading'}
          className="btn-orange justify-center text-sm disabled:opacity-60"
        >
          {status === 'loading' ? 'Subscribing…' : isDone ? 'Subscribed' : 'Subscribe'}
        </button>
      </form>

      <p
        id={`${inputId}-status`}
        role="status"
        aria-live="polite"
        className={`mt-3 min-h-5 text-sm ${
          status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'
        }`}
      >
        {message}
      </p>
    </div>
  )
}
