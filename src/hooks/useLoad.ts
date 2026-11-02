import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'

/** Minimal async loader: re-runs when deps change, exposes reload + local setter. */
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  const reload = useCallback(async () => {
    const n = ++seq.current
    setError(null)
    try {
      const v = await run()
      if (n === seq.current) setData(v)
    } catch (e) {
      if (n === seq.current) setError((e as Error).message)
    } finally {
      if (n === seq.current) setLoading(false)
    }
  }, [run])

  useEffect(() => {
    setLoading(true)
    reload()
  }, [reload])

  return { data, setData, loading, error, reload }
}

/** Ticks every `ms` while `on` — drives live timers. */
export function useTick(on: boolean, ms = 1000) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => set((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [on, ms])
}

export function useMedia(query: string) {
  const get = () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false)
  const [m, setM] = useState(get)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return m
}
