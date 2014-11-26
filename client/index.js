require('traceur/bin/traceur-runtime.js')

var $ = require('jquery')
  , io = require('socket.io-client')()
  , initWebrtc = require('./init-webrtc')
  , captureFrames = require('./capture-frames')
  , cuid = require('cuid')
  , Fingerprint = require('fingerprintjs')
  , NotificationCounter = require('./notification-counter')
  , StoredSet = require('./stored-set')
  , createCharCounter = require('./char-counter')
  , createDropdown = require('./dropdown')
  , progressSpinner = require('./progress')($('.progress'))
  , muteSet = new StoredSet('mutes')
  , messageList = require('./message')($('#message-list'), muteSet)
  , detectVideoSupport = require('./detect-video-support')

var supportedVideoTypes = detectVideoSupport()

var active = 0
  , meatspaceActive = 0
io.on('connect', function() {
  io.emit('fingerprint', new Fingerprint({ canvas: true }).get())
  // TODO(tec27): detect cases where video isn't supported at all
  io.emit('join', supportedVideoTypes.webm ? 'webm' : 'x264')
}).on('disconnect', function() {
  active = 0
  meatspaceActive = 0
  updateActiveUsers()
})

var unreadMessages = 0
io.on('chat', function(chat) {
  var autoScroll = $(window).scrollTop() + $(window).height() + 32 > $(document).height()
  var message = messageList.addMessage(chat, autoScroll)
  if (message && autoScroll) {
    message.elem[0].scrollIntoView()
  }

  if (message && document.hidden) {
    unreadMessages++
    updateNotificationCount()
  }
}).on('active', function(numActive) {
  active = numActive
  updateActiveUsers()
}).on('meatspaceActive', function(numActive) {
  meatspaceActive = numActive
  updateActiveUsers()
}).on('meatspace', function(status) {
  if (status != 'connected') {
    meatspaceActive = 0
    updateActiveUsers()
  }
})

function updateActiveUsers() {
  $('#active-users')
    .text(active + meatspaceActive)
    .attr('title', `${active} active seat.camp users, ${meatspaceActive} meatspace`)
}

createDropdown($('header .dropdown'), {
  unmute: () => muteSet.clear()
})

var messageInput = $('#message')
  , awaitingAck = null

createCharCounter(messageInput, $('#char-counter'), 250)

$('form').on('submit', function(event) {
  event.preventDefault()

  progressSpinner.setValue(0).show()
  captureFrames($('#preview')[0], {
    format: 'image/jpeg',
    width: 200,
    height: 150
  }, function(err, frames) {
    setTimeout(() => {
      progressSpinner.hide()
      setTimeout(() => progressSpinner.setValue(0), 400)
    }, 400)
    if (err) {
      return console.error(err)
    }

    awaitingAck = cuid()
    var message = {
      text: messageInput.val(),
      format: 'image/jpeg',
      ack: awaitingAck
    }
    io.emit('chat', message, frames)
    messageInput.val('').change()
  }).on('progress', percentDone => progressSpinner.setValue(percentDone))
})

io.on('ack', function(ack) {
  if (awaitingAck && awaitingAck == ack.key) {
    awaitingAck = null
    if (ack.err) {
      // TODO(tec27): display to user
      console.log('Error: ' + ack.err)
    }
  }
})

initWebrtc($('#preview')[0], 200, 150, function(err, stream) {
  if (err) {
    // TODO(tec27): display something to user depending on error type
    console.dir(err)
    return
  }

  // TODO(tec27): save stream so it can be stopped later to allow for camera switches
})

$(document).on('visibilitychange', () => {
  if (!document.hidden) {
    unreadMessages = 0
    updateNotificationCount()
  }
})

var notificationCounter = new NotificationCounter()
function updateNotificationCount() {
  if (!unreadMessages) {
    notificationCounter.clear()
  } else {
    notificationCounter.setCount(unreadMessages)
  }
}
