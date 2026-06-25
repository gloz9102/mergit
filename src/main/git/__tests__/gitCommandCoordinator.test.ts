import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitCommandCoordinator, GitCommandTimeoutError } from '../gitCommandCoordinator'

describe('GitCommandCoordinator', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('두 mutation을 동시에 요청해도 한 번에 하나씩 순서대로 실행한다', async () => {
    const coordinator = new GitCommandCoordinator('/repo')
    const firstGate = deferred<void>()
    const order: string[] = []

    const first = coordinator.mutation('first', async () => {
      order.push('first:start')
      await firstGate.promise
      order.push('first:end')
    })
    const second = coordinator.mutation('second', async () => {
      order.push('second:start')
    })

    await Promise.resolve()
    expect(order).toEqual(['first:start'])

    firstGate.resolve()
    await Promise.all([first, second])

    expect(order).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('mutation 실행 중 들어온 query는 mutation 완료 뒤에 실행한다', async () => {
    const coordinator = new GitCommandCoordinator('/repo')
    const mutationGate = deferred<void>()
    const order: string[] = []

    const mutation = coordinator.mutation('mutation', async () => {
      order.push('mutation:start')
      await mutationGate.promise
      order.push('mutation:end')
    })
    const query = coordinator.query('status', async () => {
      order.push('query:start')
      return 'status'
    })

    await Promise.resolve()
    expect(order).toEqual(['mutation:start'])

    mutationGate.resolve()
    await expect(query).resolves.toBe('status')
    await mutation

    expect(order).toEqual(['mutation:start', 'mutation:end', 'query:start'])
  })

  it('한 mutation이 실패해도 다음 작업을 계속 실행한다', async () => {
    const coordinator = new GitCommandCoordinator('/repo')
    const order: string[] = []

    const failed = coordinator.mutation('failed', async () => {
      order.push('failed')
      throw new Error('boom')
    })
    const next = coordinator.mutation('next', async () => {
      order.push('next')
    })

    await expect(failed).rejects.toThrow('boom')
    await next

    expect(order).toEqual(['failed', 'next'])
  })

  it('query는 설정한 개수까지만 동시에 실행한다', async () => {
    const coordinator = new GitCommandCoordinator('/repo', { queryConcurrency: 2 })
    const firstGate = deferred<void>()
    const secondGate = deferred<void>()
    const thirdGate = deferred<void>()
    const order: string[] = []

    const first = coordinator.query('first', async () => {
      order.push('first:start')
      await firstGate.promise
    })
    const second = coordinator.query('second', async () => {
      order.push('second:start')
      await secondGate.promise
    })
    const third = coordinator.query('third', async () => {
      order.push('third:start')
      await thirdGate.promise
    })

    await Promise.resolve()
    expect(order).toEqual(['first:start', 'second:start'])

    firstGate.resolve()
    await first
    await Promise.resolve()
    expect(order).toEqual(['first:start', 'second:start', 'third:start'])

    secondGate.resolve()
    thirdGate.resolve()
    await Promise.all([first, second, third])
  })

  it('query timeout을 구조화된 오류로 반환한다', async () => {
    vi.useFakeTimers()
    const coordinator = new GitCommandCoordinator('/repo', { queryTimeoutMs: 10 })
    const gate = deferred<void>()

    const query = coordinator.query('slow-query', () => gate.promise)
    const assertion = expect(query).rejects.toMatchObject({
      kind: 'query',
      label: 'slow-query',
      timeoutMs: 10
    } satisfies Partial<GitCommandTimeoutError>)

    await vi.advanceTimersByTimeAsync(10)
    await assertion

    gate.resolve()
    await vi.runAllTimersAsync()
  })

  it('network timeout을 구조화된 오류로 반환한다', async () => {
    vi.useFakeTimers()
    const coordinator = new GitCommandCoordinator('/repo', { networkTimeoutMs: 10 })
    const gate = deferred<void>()

    const network = coordinator.network('fetch', () => gate.promise)
    const assertion = expect(network).rejects.toMatchObject({
      kind: 'network',
      label: 'fetch',
      timeoutMs: 10
    } satisfies Partial<GitCommandTimeoutError>)

    await vi.advanceTimersByTimeAsync(10)
    await assertion

    gate.resolve()
    await vi.runAllTimersAsync()
  })
})

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}
