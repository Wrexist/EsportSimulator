const { executableSourceText, sourceTextWithoutUrls } = require('../scripts/launch/audit-source-text.cjs')

test('source audit separates comments while retaining UI strings, URLs and JSX text', () => {
    const source = '/* cs2 tuning disclaimer */\nconst url = "https://example.com/cs2"; // comment-only-token\nconst ui = <div>CS2 reference</div>'
    const scanned = executableSourceText('example.tsx', source)
    expect(scanned).not.toContain('tuning disclaimer')
    expect(scanned).not.toContain('comment-only-token')
    expect(scanned).toContain('https://example.com/cs2')
    expect(scanned).toContain('CS2 reference')
    expect(source).toContain('comment-only-token')
})

test('source audit fails closed on invalid syntax and leaves JSON data unchanged', () => {
    const invalid = '/* review token */ const x = '
    expect(executableSourceText('broken.ts', invalid)).toBe(invalid)
    const json = '{"description":"cs2"}'
    expect(executableSourceText('data.json', json)).toBe(json)
})

test('URL classification never hides the same token in visible text or a template expression', () => {
    const source = 'const url = "https://example.com/cs2"; const label = "cs2"; const ui = <a href="https://example.com/cs2">cs2</a>; const dynamic = `https://example.com/${cs2}`;'
    const result = sourceTextWithoutUrls('example.tsx', source)
    expect(result).not.toContain('https://example.com/cs2')
    expect(result).toContain('"cs2"')
    expect(result).toContain('>cs2</a>')
    expect(result).toContain('${cs2}')
    const invalid = 'const url = "https://example.com/cs2"; const x = '
    expect(sourceTextWithoutUrls('broken.ts', invalid)).toBe(invalid)
    expect(sourceTextWithoutUrls('data.json', '{"url":"https://example.com/cs2"}')).toContain('cs2')
})
