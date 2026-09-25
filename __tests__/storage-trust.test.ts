import { LocalStorageAdapter, ElectronStorageAdapter, DebouncedStorage } from '@/engine/storage-adapter'

describe('durable storage acknowledgements', () => {
    const realWindow = (global as { window?: unknown }).window
    afterEach(() => { (global as { window?: unknown }).window = realWindow; jest.useRealTimers() })
    test('blocked browser storage throws instead of saving to volatile memory', async () => {
        ;(global as { window?: unknown }).window = { get localStorage() { throw new Error('SecurityError') } }
        await expect(new LocalStorageAdapter().setItem('career', 'bytes')).rejects.toThrow('SecurityError')
    })
    test('a rejected native write or delete never mutates another backend', async () => {
        const fallback = new LocalStorageAdapter()
        const write = jest.spyOn(fallback, 'setItem')
        const remove = jest.spyOn(fallback, 'removeItem')
        ;(global as { window?: unknown }).window = { electron: { storage: { setItem: async () => false, removeItem: async () => false } } }
        const adapter = new ElectronStorageAdapter(fallback)
        await expect(adapter.setItem('esports_save_qa', 'bytes')).rejects.toThrow('Disk save failed')
        await expect(adapter.removeItem('esports_save_qa')).rejects.toThrow('deletion failed')
        expect(write).not.toHaveBeenCalled()
        expect(remove).not.toHaveBeenCalled()
    })
    test('coalesced preferences wait for durability and all reject together; flush reports failure', async () => {
        jest.useFakeTimers()
        const inner = new LocalStorageAdapter()
        jest.spyOn(inner, 'setItem').mockRejectedValue(new Error('full'))
        const debounced = new DebouncedStorage(inner)
        const a = debounced.setItem('preferences', 'old')
        const b = debounced.setItem('preferences', 'new')
        const results = Promise.allSettled([a, b])
        await expect(debounced.flush()).rejects.toThrow('full')
        expect((await results).every(r => r.status === 'rejected')).toBe(true)
    })
})
