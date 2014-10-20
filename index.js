var express = require('express')
  , http = require('http')
  , socketIo = require('socket.io')
  , browserify = require('browserify-middleware')

var app = express()
app.set('x-powered-by', false)
  .set('view engine', 'jade')

var httpServer = http.Server(app)
  , io = socketIo(httpServer)

app.get('/', function(req, res) {
  res.render('index')
}).get('/styles.css', function(req, res) {
  res.sendFile('./styles.css', { root: __dirname })
}).get('/client.js', browserify('./client/index.js'))

io.on('connection', function(socket) {
  console.log('socket connection!')
  socket.on('chat', function(chat) {
    io.emit('chat', { text: chat.text })
  })
})

httpServer.listen(process.env.PORT || 3456, function() {
  var host = httpServer.address().address
    , port = httpServer.address().port
  console.log('Listening at http://%s:%s', host, port)
})
