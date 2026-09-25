const ts = require('typescript');

// Remove comments only in the audit's in-memory representation. Parse failures
// retain raw text, so malformed source cannot hide a finding. Never rewrite files.
function executableSourceText(file, text) {
    if (!/\.tsx?$/.test(file)) return text;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    if (source.parseDiagnostics.length) return text;
    return ts.createPrinter({ removeComments: true }).printFile(source);
}

function sourceTextWithoutUrls(file, text) {
    if (!/\.tsx?$/.test(file)) return text;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    if (source.parseDiagnostics.length) return text;
    const ranges = [];
    function visit(node) {
        if (ts.isStringLiteralLike(node) && /^https?:\/\/\S+$/.test(node.text)) {
            ranges.push([node.getStart(source), node.end]);
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    let result = text;
    for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) {
        result = result.slice(0, start) + '""' + result.slice(end);
    }
    return result;
}

module.exports = { executableSourceText, sourceTextWithoutUrls };
