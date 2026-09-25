const { verify, releaseInventory, verifyPackaged } = require('../scripts/launch/content-provenance.cjs')
describe('Content release gate', () => {
    it('binds informed owner release decisions to exact files without inventing a license', () => {
        const file = { path: 'data/map-studio-library.json', sha256: 'reviewed-bytes' }
        const record = { ...file, releaseDisposition: 'include', license: 'UNVERIFIED', permission: null }
        const decision = { ...file, authorization: 'Ship everything', decision: 'ship-with-unverified-source-permission', evidence: 'owner-decision.json' }
        expect(verify([file], [record])).toHaveLength(1)
        expect(verify([file], [record], [decision])).toEqual([])
        expect(verify([{ ...file, sha256: 'changed' }], [record], [decision])).toHaveLength(1)
        expect(verify([file], [record], [{ ...decision, path: 'another-file' }])).toHaveLength(1)
        expect(record.license).toBe('UNVERIFIED')
        expect(record.permission).toBeNull()
    })
    it('uses packaging exclusions without dropping embedded datasets and fonts', () => {
        const paths = ['public/assets/teams/test/players/original.png', 'public/branding/portraits/new.png', 'data/map-layouts/mirage.json', 'app/fonts/archivo.woff2', 'components/example.tsx']
        const selected = releaseInventory(paths.map(path => ({ path })), ['public/**/*', '!public/assets/teams/*/players/**/*'])
        expect(selected.map((row: { path: string }) => row.path)).toEqual(paths.slice(1, 4))
        expect(verify(selected, [])).toHaveLength(3)
    })
    const file = { path: 'public/map.mesh', sha256: 'original' }
    const reviewed = { ...file, releaseDisposition: 'include', permission: 'signed permission receipt', license: 'custom' }
    it('checks actual packaged bytes and resolves renamed fonts by reviewed hash', () => {
        const font = { ...reviewed, path: 'app/fonts/display.woff2' }
        const bundled = { ...file, path: '.next/static/media/hashed.woff2' }
        expect(verifyPackaged([bundled], [font])).toEqual([])
        expect(verifyPackaged([{ ...bundled, sha256: 'stale' }], [font])).toHaveLength(1)
        expect(verifyPackaged([{ ...file, path: 'public/unexpected.png' }], [reviewed])).toHaveLength(1)
        expect(verifyPackaged([bundled], [{ ...font, permission: null }])).toHaveLength(1)
    })
    it('rejects unreviewed, changed and merely relabeled exclusions', () => {
        expect(verify([file], [])).toHaveLength(1)
        expect(verify([{ ...file, sha256: 'changed' }], [reviewed])).toHaveLength(1)
        expect(verify([file], [{ ...reviewed, releaseDisposition: 'excluded' }])).toHaveLength(1)
        expect(verify([file], [{ ...reviewed, permission: null }])).toHaveLength(1)
        expect(verify([file], [reviewed])).toEqual([])
    })
})
