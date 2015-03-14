![seatcamp](https://github.com/tec27/seatcamp/blob/master/icon/seatcamp-256.png)
# seatcamp
A web-based ephemeral chat site that lets users send simple, short messages
along with a 2-second video of themselves.

The offical server can be found at [https://seat.camp](https://seat.camp)

## Table of contents
- [Features](#features)
- [Running a server](#running-a-server)
  - [Required software](#required-software)
  - [Configuring your server](#configuring-your-server)
  - [Normal options](#normal-options)
  - [HTTPS options](#https-options-all-must-be-specified-if-you-want-to-use-https)
- [Protocol](#protocol)
  - [Connecting](#connecting)
  - [Messages](#messages)
  - [Status updates](#status-updates)
- [Contributing](#contributing)
- [Special thanks to](#special-thanks-to)
- [License](#license)

## Features
- Send a message to anyone connected to the same seatcamp server
- Provides both webm and h264 videos alongside chats, allowing clients to
request whichever they wish to use (video transcoding is done using ffmpeg
or avconv, whichever is available)
- Proxies to a [meatspace](https://github.com/meatspaces/meatspace-chat-v2)
server, sending any seatcamp user's messages to that server as well as
displaying meatspace users' messages to seatcamp users
- No signup required, but users receive a unique ID based on browser
characteristics (displayed to users as an identicon alongside messages).
- Allows for muting users based on their ID, removing all their current
messages and blocking any future ones
- Performs extremely minimal DOM element creation and recycles message
elements, meaning the page loads quickly and is quite stable over long
periods of time.

## Running a server
### Required software
seatcamp requires [io.js](http://iojs.org) or [node](http://nodejs.org) (0.12.x+) and ffmpeg/libav
in order to work. io.js/Node can be downloaded from the official site. ffmpeg or libav can generally
be installed from your OS's package manager, or from source. Examples of installing it:

**OSX**
```bash
$ brew install ffmpeg --with-ffplay --with-freetype --with-frei0r --with-libass --with-libvorbis --with-libvpx --with-opencore-amr --with-openjpeg --with-opus --with-theora --with-tools
```

**Ubuntu/Debian**
```bash
$ sudo apt-get install libav-tools
```

### Configuring your server
Server configuration is handled through a JSON file: `conf.json`.

`conf.json-example` in the main directory will often provide all you need
for a development server, so for most developers, you can simply do:
```bash
$ cp conf.json-example conf.json
```

This will set you up with a server running on port `3456` over HTTP, and
connecting to a meatspace server at port `3000`.

The server can then be run with:
```bash
$ npm start
```

If you are running a production seatcamp server, or simply want to
customize your development environment, you can change a few options in
`conf.json`. The options are:
### Normal options
#### port
The port to run the HTTP server on for this instance.

**Ex:** `"port": 3000`

#### idKey
The key to use for hashing user ID's. This allows users to be given a
stable, unique ID per browser, but not expose their actual fingerprint
to other users on the server or be able to track users across seatcamp
instances. This value should be unique to the server you're running it
on and sufficiently long (10+ characters recommended).

**Ex:** `"idKey": "thisServerIsGreat123"`

#### meatspaceServer
The full URL for a meatspace server you want to proxy to/from. If you want
to turn proxying off for a particular server (useful in development
environments where you don't want to run 2 servers all the time), you may
specify this as `false`.

**Ex:** `"meatspaceServer": "http://localhost:3000"`

**Or:** `"meatspaceServer": false`

### HTTPS options (all must be specified if you want to use HTTPS)
#### sslCert
A relative filepath to an SSL certificate file to be used for setting up
HTTPS connections.

**Ex:** `"sslCert": "./certs/certificate.crt"`

#### sslKey
A relative filepath to the private key used for the SSL certificate file specified in `sslCert`.

**Ex:** `"sslKey": "./certs/private.key"`

#### sslCaBundle
A relative filepath to the bundle of CA certificates to be used with the SSL certificate specified
in `sslCert`. These should be provided by your certificate provider.

**Ex:** `"sslCaBundle": "./certs/seatcamp.ca-bundle"`

#### sslPort
The port HTTPS connections should be accepted on.

**Ex:** `"sslPort": 443`

#### canonicalHost
The host non-HTTPS connections should be redirected to (the host of your HTTPS site).

**Ex:** `"canonicalHost": "https://seat.camp"`

## Protocol
The protocol of seatcamp is built around socket.io, making use of binary frames where appropriate.

### Connecting
Upon connecting, clients must send a fingerprint to the server. This fingerprint should uniquely
identify a particular client, and be relatively stable. Examples of good choices for this would be
a hardware identifier (e.g. Android ID), or a fingerprint constructed from many data points that
don't change often (e.g. fingerprintjs). Bad choices are things like IP addresses, since these could
potentially change a lot, as well as collide for multiple users.

To send the fingerprint, clients simply emit a `fingerprint` message with the fingerprint data as
the body, i.e.
```javascript
io.emit('fingerprint', 'myCoolFingerprint')
```

The server will reply with a `userid` message containing the ID it has calculated for this client,
which should be saved so that a client can recognize which messages are its own. This ID will be
constant for the lifetime of the websocket connection. An example of handling the message would be:
```javascript
io.on('userid', function(userId) {
  myId = userId
})
```

Clients should then specify what type of video they would like to receive by joining a channel. They
may do this using the `join` message:

```javascript
io.emit('join', 'webm')
```

At present, the server supports two video types: `webm` or `x264`.

### Messages
Messages are transmitted to clients using the `chat` message. The format of the data passed in this
message is:
```javascript
{
  "video": ArrayBuffer(),
  "videoType": "webm",
  "videoMime": "video/webm",
  "key": "AUniqueIdForTheMessage",
  "text": "The text the user sent",
  "sent": 1421135370231,
  "userId": "TheUserIDOftheSender",
  "from": "seatcamp"
}
```

`videoType` and `videoMime` will change based on what video format you subscribed to. `sent` is a
unix timestamp corresponding to when the message was originally sent. `from` specifies what server
the message originated from (and can currently be either `seatcamp` or `meatspace`).

Clients can send messages by sending a `chat` message themselves, with the first parameter in the
following format:
```json
{
  "text": "The text the user wants to send",
  "format": "image/jpeg",
  "ack": "AUniqueIdTheServerShouldAckWith"
}
```
Clients should send an array of 10 frames (as binary) as the second parameter, e.g.
```javascript
io.emit('chat', message, frames)
```

`format` specifies what format these frames are in. At present, only `image/jpeg` is accepted. If
`ack` is specified, the server will send a response message containing the ID given, allowing
clients to find out if specific messages succeeded or failed. Acks are transmitted via an `ack`
message, formatted as:
```json
{
  "key": "AckIdThatWasSpecified",
  "err": "An error message (if applicable)"
}
```
If `err` is not set, the message sending succeeded.

### Status updates
The server will send clients a number of different status updates to allow things like user counts
to be known. These are all handled through seperate messages, which are:

#### active
Specifies how many seatcamp users are currently connected.
```javascript
io.on('active', function(numActive) {
  alert('There are ' + numActive + ' active seatcamp users!')
})
```

#### meatspaceActive
Specifies how many meatspace users are currently connected.
```javascript
io.on('meatspaceActive', function(numActive) {
  alert('There are ' + numActive + ' active meatspace users!')
})
```

#### meatspace
Specifies the status of the meatspace proxy connection.
```javascript
io.on('meatspace', function(status) {
  if (status == 'connected') {
    alert('meatspace proxy is working!')
  } else if (status == 'disconnected') {
    alert('meatspace proxy is offline :(')
  }
})
```

## Contributing
seatcamp is written using ES6-compliant JavaScript, compiled to ES5 using traceur. Client-side code
is similarly written, but compiled with `browserify` and `es6ify`. Contributions should attempt to
make use of ES6 features where they make sense. Pull requests are accepted and will be looked at in
a timely manner. If you are contributing a new feature (rather than a bug fix), its a good idea to
open a PR early to discuss the viability of that feature in the larger ecosystem before you attempt
to write code for it.

New features will be accepted if they fortify/enhance behavior that developed from the community
(e.g. hashtags on Twitter), but will likely be denied if they are something completely outside of
the way the community uses the site. Changes/additions that break meatspace users' experiences
(makes them feel left out if they don't use seatcamp, results in spammy messages appearing for them,
etc.) will not be accepted.

## Special thanks to
- [ednapiranha](https://github.com/ednapiranha) for creating meatspaces
- [thethp](https://github.com/thethp) for [whosthatmeat](https://github.com/thethp/whosthatmeat)
which inspired the identicons feature
- [llkats](https://github.com/llkats) for [meatdelay](https://github.com/llkats/meatdelay) which
inspired the built-in time delay feature

## License
MIT
