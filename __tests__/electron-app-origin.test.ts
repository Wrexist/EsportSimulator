const { isAllowedAppNavigation } = require("../electron/app-origin") as {
  isAllowedAppNavigation: (url: string, port: string, packaged: boolean) => boolean
}

describe("Electron app navigation origins", () => {
  test.each(["http://localhost:3004/main-menu", "http://localhost:3004/match/test/live?x=1#round"])("allows the selected app listener: %s", url => {
    expect(isAllowedAppNavigation(url, "3004", true)).toBe(true)
  })
  test.each(["http://localhost:3005/", "http://127.0.0.1:80/", "http://localhost.evil.test:3004/", "https://localhost:3004/", "file:///test", "data:text/html,test", "http://user:pass@localhost:3004/", "invalid"])("rejects unrelated or disguised origins: %s", url => {
    expect(isAllowedAppNavigation(url, "3004", true)).toBe(false)
  })
  test("development also trusts exactly the selected origin", () => {
    expect(isAllowedAppNavigation("http://localhost:3001/", "3004", false)).toBe(false)
    expect(isAllowedAppNavigation("http://localhost:3001/", "3004", true)).toBe(false)
    expect(isAllowedAppNavigation("http://127.0.0.1:3004/", "3004", false)).toBe(false)
    expect(isAllowedAppNavigation("http://localhost:3004/mod-assets/evil.svg", "3004", true)).toBe(false)
    expect(isAllowedAppNavigation("http://localhost:3004/mod-assets%2fevil.svg", "3004", true)).toBe(false)
  })
})
