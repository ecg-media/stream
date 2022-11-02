'use strict';

// node js server.
let server;

// Create nodejs http server with PORT and HOST.
// Default listening on port 80 and host 0.0.0.0
const express = require('express');
const app = express();
const PORT = Number(process.env.PORT) || 80;
server = require('http').createServer(app);
console.log(`Listening for HTTP on ${process.env.HOST || '0.0.0.0'}:${PORT}`);
server.listen(PORT, process.env.HOST);

// load files from app folder.
const exst = express.static(`${__dirname}/../app`);
app.use('/', exst);
app.use('/scripts', express.static(__dirname + '/../node_modules/'));

// ####### Configure socket.io server ########
const socketio = require('socket.io')(server);
console.log('socket.io server start. port=' + server.address().port);

let router = null;
let producerTransport = null;
let audioProducer = null;
let producerSocketId = null;

socketio.on('connection', function (socket) {
    console.log('client connected. socket id=' + getId(socket) + '  , total clients=' + getClientCount());
  
    socket.on('disconnect', function () {
      // close user connection
      console.log('client disconnected. socket id=' + getId(socket) + '  , total clients=' + getClientCount());
      cleanUpPeer(socket);
    });
    socket.on('error', function (err) {
      console.error('socket ERROR:', err);
    });
    socket.on('connect_error', (err) => {
      console.error('client connection error', err);
    });
  
    socket.on('getRouterRtpCapabilities', (data, callback) => {
      if (router) {
        console.log('getRouterRtpCapabilities: ', router.rtpCapabilities);
        sendResponse(router.rtpCapabilities, callback);
      }
      else {
        sendReject({ text: 'ERROR- router NOT READY' }, callback);
      }
    });
  
    // --- producer ---
    socket.on('createProducerTransport', async (data, callback) => {
      producerSocketId = getId(socket);
      const { transport, params } = await createTransport();
      producerTransport = transport;
      console.log('Producer created with id ' + producerSocketId);
      updateClientsCount();
      producerTransport.observer.on('close', () => {
        if (audioProducer) {
          audioProducer.close();
          audioProducer = null;
        }
        producerTransport = null;
      });
      sendResponse(params, callback);
    });
  
    socket.on('connectProducerTransport', async (data, callback) => {
      await producerTransport.connect({ dtlsParameters: data.dtlsParameters });
      sendResponse({}, callback);
    });
  
    socket.on('produce', async (data, callback) => {
      const { kind, rtpParameters } = data;
      if (kind !== 'audio') {
        console.error('produce ERROR. BAD kind:', kind);
        return;
      }
  
      audioProducer = await producerTransport.produce({ kind, rtpParameters });
      audioProducer.observer.on('close', () => {
        console.log('audioProducer closed.');
      })
      sendResponse({ id: audioProducer.id }, callback);

      // inform clients about new producer
      socket.broadcast.emit('newProducer', { kind: kind });
    });
  
    // --- consumer ----
    socket.on('createConsumerTransport', async (data, callback) => {
      const { transport, params } = await createTransport();
      addConsumerTransport(getId(socket), transport);
      console.log('New consumer created.');
      transport.observer.on('close', () => {
        const id = getId(socket);
        consumer = getAudioConsumer(id);
        if (consumer) {
          consumer.close();
          removeAudioConsumer(socket, id);
        }
        removeConsumerTransport(id);
      });
      sendResponse(params, callback);
    });
  
    socket.on('connectConsumerTransport', async (data, callback) => {
      let transport = getConsumerTransport(getId(socket));
      if (!transport) {
        console.error('transport NOT EXIST for id=' + getId(socket));
        sendResponse({}, callback);
        return;
      }
      await transport.connect({ dtlsParameters: data.dtlsParameters });
      sendResponse({}, callback);
    });

    socket.on('producerclose', () => {
      if (audioProducer) {
        const id = getId(socket);
        console.log("here i am");
        socket.broadcast.emit('producerClosed', { localId: id, remoteId: producerSocketId, kind: 'audio' });
      }
    });
  
    socket.on('consume', async (data, callback) => {
      const kind = data.kind;
      console.log('-- consume --kind=' + kind);
  
      if (kind !== 'audio') {
        console.error('ERROR: UNKNOWN kind=' + kind);
        return;
      }
      if (audioProducer) {
        let transport = getConsumerTransport(getId(socket));
        if (!transport) {
          console.error('transport NOT EXIST for id=' + getId(socket));
          return;
        }
        const { consumer, params } = await createConsumer(transport, audioProducer, data.rtpCapabilities); // producer must exist before consume
        const id = getId(socket);
        addAudioConsumer(id, consumer);
        consumer.observer.on('close', () => {
          consumer.close();
          removeAudioConsumer(socket, id);
          console.log('consumer closed ---');
        })
        consumer.on('producerclose', () => {
          console.log('consumer -- on.producerclose');
          socket.broadcast.emit('producerClosed', { localId: id, remoteId: producerSocketId, kind: 'audio' });
          consumer.close();
          removeAudioConsumer(socket, id);
        });
      
        console.log('-- consumer ready ---');
        sendResponse(params, callback);
      }
      else {
        console.log('-- consume, but audio producer NOT READY');
        const params = { producerId: null, id: null, kind: 'audio', rtpParameters: {} };
        sendResponse(params, callback);
      }
    });
  
    socket.on('resume', async (data, callback) => {
      const kind = data.kind;
      console.log('-- resume -- kind=' + kind);
      console.warn('NO resume for audio');
    });

    socket.on('reload', async (data, callback) => {
      socket.broadcast.emit('reloadPage', { });
      console.log('Reload clients called');
    });

    // ---- stats clients -------
    socket.on('statsConnected', async (data, callback) => {
      console.log("--- New stats client connected ---");
      socket.emit('statsUpdate', {
        translationClientCount: Object.keys(audioConsumers).length,
        translationPubActive: producerSocketId != null
      });
    });

    // ---- sendback welcome message with on connected ---
    const newId = getId(socket);
    sendback(socket, { type: 'welcome', id: newId });
  
    // --- send response to client ---
    function sendResponse(response, callback) {
      callback(null, response);
    }
  
    // --- send error to client ---
    function sendReject(error, callback) {
      callback(error.toString(), null);
    }
  
    function sendback(socket, message) {
      socket.emit('message', message);
    }
  });
  
  function getId(socket) {
    return socket.id;
  }
  
  function getClientCount() {
    return socketio.eio.clientsCount;
  }
  
  function cleanUpPeer(socket) {
    const id = getId(socket);
    const transport = getConsumerTransport(id);
    if (transport) {
      transport.close();
      removeConsumerTransport(id);
    }
  
    if (producerSocketId === id) {
      console.log('---- cleanup producer ---');
      if (audioProducer) {
        audioProducer.close();
        audioProducer = null;
      }
  
      if (producerTransport) {
        producerTransport.close();
        producerTransport = null;
      }

      producerSocketId = null;
    }
  }

function updateClientsCount() {
  if (producerSocketId) {
    socketio.sockets.sockets.get(producerSocketId).emit('consumersUpdated', {count: Object.keys(audioConsumers).length});
    socketio.sockets.sockets.get(producerSocketId).broadcast.emit('consumersUpdated', {count: Object.keys(audioConsumers).length});
  }
}

// ####### Configure mediasoup #######
const mediasoup = require("mediasoup");
let worker = null;
let stunServerIp = undefined;
try {
  stunServerIp = [].concat(...Object.values(require('os').networkInterfaces())).find(x => !x.internal && x.family === 'IPv4')?.address;
} catch(e) {
  console.error("Could not determine ip address automatically. Please set your ip address as environment variable and start e.g. with IP=0.0.0.0 node server/index.js")
}
 
const mediasoupOptions = {
  // Worker settings
  worker: {
    rtcMinPort: 10000,
    rtcMaxPort: 11000,
    logLevel: 'warn',
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
    ],
  },
  // Router settings
  router: {
    mediaCodecs:
      [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2
        },
      ]
  },
  // WebRtcTransport settings
  webRtcTransport: {
    listenIps: [
      { ip: '0.0.0.0', announcedIp: stunServerIp || process.env.IP},
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    maxIncomingBitrate: 1500000,
    initialAvailableOutgoingBitrate: 1000000,
  }
};

async function startWorker() {
  const mediaCodecs = mediasoupOptions.router.mediaCodecs;
  worker = await mediasoup.createWorker(mediasoupOptions.worker);
  router = await worker.createRouter({ mediaCodecs });
  console.log('-- mediasoup worker start. --')
}

startWorker();

// ####### Multiconsumers #######
let transports = {};
let audioConsumers = {};

function getConsumerTransport(id) {
  return transports[id];
}

function addConsumerTransport(id, transport) {
  transports[id] = transport;
  console.log('consumerTransports count=' + Object.keys(transports).length);
}

function removeConsumerTransport(id) {
  delete transports[id];
  console.log('consumerTransports count=' + Object.keys(transports).length);
}

function getAudioConsumer(id) {
  return audioConsumers[id];
}

function addAudioConsumer(id, consumer) {
  audioConsumers[id] = consumer;
  updateClientsCount();
  console.log('audioConsumers count=' + Object.keys(audioConsumers).length);
}

function removeAudioConsumer(socket, id) {
  delete audioConsumers[id];
  updateClientsCount();
  console.log('audioConsumers count=' + Object.keys(audioConsumers).length);
}

function removeAllConsumers() {
  for (const key in audioConsumers) {
    const consumer = audioConsumers[key];
    console.log('key=' + key + ',  consumer:', consumer);
    consumer.close();
    delete audioConsumers[key];
  }
}

async function createTransport() {
  const transport = await router.createWebRtcTransport(mediasoupOptions.webRtcTransport);
  console.log('-- create transport id=' + transport.id);

  return {
    transport: transport,
    params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    }
  };
}

async function createConsumer(transport, producer, rtpCapabilities) {
  let consumer = null;
  if (!router.canConsume(
    {
      producerId: producer.id,
      rtpCapabilities,
    })
  ) {
    console.error('can not consume');
    return;
  }

  consumer = await transport.consume({ // OK
    producerId: producer.id,
    rtpCapabilities,
    paused: producer.kind === 'video',
  }).catch(err => {
    console.error('consume failed', err);
    return;
  });

  return {
    consumer: consumer,
    params: {
      producerId: producer.id,
      id: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused
    }
  };
}
