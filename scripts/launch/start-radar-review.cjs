// Next's compiler workers reload next.config.js; a custom `conf` alone is
// insufficient to keep them away from the production output directory.
process.env.ESIM_ISOLATED_REVIEW = '1'
const next = require('next')
const http = require('node:http')
const path = require('node:path')
const app = next({ dev: true, hostname: 'localhost', port: 3371, dir: path.resolve(__dirname, '../..') })
app.prepare().then(() => {
    http.createServer(app.getRequestHandler()).listen(3371, 'localhost', () => {
        console.log('Isolated radar review: http://localhost:3371/dev/physical-replay')
    })
}).catch(error => { console.error(error); process.exitCode = 1 })
