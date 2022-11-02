const player = document.getElementById('player');
const btn = document.getElementById('btn_stream');
const animation = document.getElementById('anim_canvas');
const error_info = document.getElementById('no_publisher');
let stream = null;
let clientId = null;
let device = null;
let transport = null;
let consumer = null;
let socket = null;

// inits the consumer.
function init() {
   updateButtons();
   console.log('Consumer loaded');
}

function handleStream() {
   if (!isSocketConnected()) {
      subscribe();
      return;
   }

   unsubscribe();
}

async function subscribe() {
   if (!isSocketConnected()) {
      await connectSocket().catch(err => {
         console.error(err);
         return;
      });

      // --- get capabilities --
      const data = await sendRequest('getRouterRtpCapabilities', {});
      console.log('getRouterRtpCapabilities:', data);
      await loadDevice(data);
   }

   updateButtons();

   // --- prepare transport ---
   console.log('--- createConsumerTransport --');
   const params = await sendRequest('createConsumerTransport', {});
   console.log('transport params:', params);
   transport = device.createRecvTransport(params);
   console.log('createConsumerTransport:', transport);

   // --- join & start --
   transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      console.log('--consumer transport connect');
      sendRequest('connectConsumerTransport', { dtlsParameters: dtlsParameters })
         .then(callback)
         .catch(errback);
   });

   transport.on('connectionstatechange', (state) => {
      switch (state) {
         case 'connecting':
            console.log('subscribing...');
            break;

         case 'connected':
            console.log('subscribed');
            break;

         case 'failed':
            console.log('failed');
            transport.close();
            break;

         default:
            break;
      }
   });

   consumer = await consumeAndResume();

   updateButtons();
}

function connectSocket() {
   if (socket) {
      socket.close();
      socket = null;
      clientId = null;
   }

   return new Promise((resolve, reject) => {
      socket = io.connect('/');

      socket.on('connect', function (evt) {
         console.log('socket.io connected()');
      });
      socket.on('error', function (err) {
         console.error('socket.io ERROR:', err);
         reject(err);
      });
      socket.on('disconnect', function (evt) {
         console.log('socket.io disconnect:', evt);
      });
      socket.on('reloadPage', function (evt) {
         console.log("Reload called");
         location.reload(true);
      });
      socket.on('message', function (message) {
         console.log('socket.io message:', message);
         if (message.type === 'welcome') {
            if (socket.id !== message.id) {
               console.warn('WARN: something wrong with clientID', socket.io, message.id);
            }

            clientId = message.id;
            console.log('connected to server. clientId=' + clientId);
            resolve();
         }
         else {
            console.error('UNKNOWN message from server:', message);
         }
      });
      socket.on('newProducer', async function (message) {
         console.log('socket.io newProducer:', message);
         if (transport) {
            // start consume
            if (message.kind === 'audio') {
               consumer = await consumeAndResume();
            }
         }
      });

      socket.on('producerClosed', function (message) {
         console.log('socket.io producerClosed:', message);
         const localId = message.localId;
         const remoteId = message.remoteId;
         const kind = message.kind;
         error_info.classList.remove('hide');
         console.log('--try removeConsumer remoteId=' + remoteId + ', localId=' + localId + ', kind=' + kind);
         if (kind === 'audio') {
            if (consumer) {
               consumer.close();
               consumer = null;
            }
         }

         unsubscribe();
      });
   });
}

async function loadDevice(routerRtpCapabilities) {
   try {
      device = new MediasoupClient.Device();
   } catch (error) {
      if (error.name === 'UnsupportedError') {
         console.error('browser not supported');
      }
   }
   await device.load({ routerRtpCapabilities });
}

async function consumeAndResume() {
   error_info.classList.add('hide');
   const consumer = await consume();
   if (consumer) {
      console.log('-- track exist, consumer ready. ---');
      visualizeStream(player, animation, player.srcObject);
      updateButtons();
   }
   else {
      console.log('-- no consumer yet. ---');
      return null;
   }
}

async function consume() {
   console.log('--start of consume --');
   const { rtpCapabilities } = device;
   const data = await sendRequest('consume', { rtpCapabilities: rtpCapabilities, kind: 'audio' })
      .catch(err => {
         console.error('consume ERROR:', err);
      });
   const {
      producerId,
      id,
      kind,
      rtpParameters,
   } = data;

   if (producerId) {
      let codecOptions = {};
      const consumer = await transport.consume({
         id,
         producerId,
         kind,
         rtpParameters,
         codecOptions,
      });
      addRemoteTrack(consumer.track);
      console.log('--end of consume');
      return consumer;
   }

   error_info.classList.remove('hide');
   console.warn('--- remote producer NOT READY');
   return null;
}

function addRemoteTrack(track) {
   if (player.srcObject) {
      player.srcObject.addTrack(track);
      return;
   }

   const newStream = new MediaStream();
   newStream.addTrack(track);
   play(newStream)
      .then(() => { player.volume = 1.0 })
      .catch(err => { console.error('media ERROR:', err) });
}

function play(stream) {
   if (player.srcObject) {
      console.warn('player ALREADY playing, so ignore');
      return;
   }
   player.srcObject = stream;
   player.volume = 0;
   visualizeStream(player, animation, player.srcObject);
   return player.play();
}

function unsubscribe() {
   if (consumer) {
      consumer.close();
      consumer = null;
   }
   if (transport) {
      transport.close();
      transport = null;
   }

   player.srcObject = null;
   disconnectSocket();
   updateButtons();
}

function disconnectSocket() {
   if (isSocketConnected()) {
      socket.close();
      socket = null;
      clientId = null;
      console.log('socket.io closed..');
   }
}

function isSocketConnected() {
   return socket != null;
}

function sendRequest(type, data) {
   return new Promise((resolve, reject) => {
      socket.emit(type, data, (err, response) => {
         if (!err) {
            resolve(response);
         } else {
            reject(err);
         }
      });
   });
}

function updateButtons() {
   if (isSocketConnected()) {
      btn.classList.remove('start');
      btn.classList.add('stop');
      return;
   }
   btn.classList.remove('stop');
   btn.classList.add('start');
}



