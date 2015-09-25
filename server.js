import express from 'express'
import http from 'http'
import https from 'https'
import path from 'path'
import fs from 'fs'
import socketIo from 'socket.io'
import browserify from 'browserify-middleware'
import serveStatic from 'serve-static'
import serveCss from './lib/serve-css'
import canonicalHost from 'canonical-host'
import userCounter from './lib/user-counter'
import createFfmpegRunner from './lib/ffmpeg-runner'
import chatSockets from './lib/chat-sockets'
import meatspaceProxy from './lib/meatspace-proxy'
import config from './conf.json'

const userIdKey = config.idKey
if (!userIdKey) {
  throw new Error('idKey must be specified in conf.json!')
}

const app = express()
app
  .set('x-powered-by', false)
  .set('view engine', 'jade')

let httpServer
let listenPort

if (config.sslCert) {
  if (!config.sslKey || !config.sslCaBundle || !config.canonicalHost || !config.sslPort) {
    throw new Error('sslCert, sslKey, sslCaBundle, sslPort, and canonicalHost must all be ' +
        'configured for SSL support.')
  }

  const caList = []
  const curCert = []
  const caFile = fs.readFileSync(path.join(__dirname, config.sslCaBundle), 'utf8')
  for (const line of caFile.split('\n')) {
    if (!line.length) continue

    curCert.push(line)
    if (line.match(/-END CERTIFICATE-/)) {
      caList.push(curCert.join('\n'))
      curCert.length = 0
    }
  }
  curCert.length = 0

  const sslCert = fs.readFileSync(path.join(__dirname, config.sslCert), 'utf8')
  const sslKey = fs.readFileSync(path.join(__dirname, config.sslKey), 'utf8')

  httpServer = https.createServer({
    ca: caList,
    cert: sslCert,
    key: sslKey
  }, app)
  listenPort = config.sslPort

  const canon = canonicalHost(config.canonicalHost, 301)
  http.createServer(function(req, res) {
    if (canon(req, res)) return
    res.statusCode = 400
    res.end('Bad request\n')
  }).listen(config.port)
} else {
  httpServer = http.Server(app)
  listenPort = config.port
}

const io = socketIo(httpServer)

app.use(require('cookie-parser')())

app
  .get('/', (req, res) => res.render('index', { theme: req.cookies.theme }))
  .get('/client.js', browserify('./client/index.js'))
  .get('/styles.css', serveCss('./css/styles.css'))

app.use(serveStatic('public'))

userCounter(io)
createFfmpegRunner((err, runner) => {
  if (err) {
    throw err
  }

  chatSockets(
      io,
      userIdKey,
      meatspaceProxy(config.meatspaceServer, runner),
      runner,
      15, /* server backscroll limit */
      10 * 60 * 1000 /* expiry time */)

  httpServer.listen(listenPort, function() {
    const host = httpServer.address().address
    const port = httpServer.address().port
    console.log('Listening at http%s://%s:%s', config.sslCert ? 's' : '', host, port)
  })
})
