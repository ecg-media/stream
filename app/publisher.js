var translation = {
  deviceSelect: document.getElementById('device_select_translate'),
  stream: undefined,
  btn: document.getElementById('btn_stream_translate'),
  btn_reload: document.getElementById('btn_reload_translate'),
  clientCount: document.getElementById('connected_clients_translate'),
  player: document.getElementById('player_translate'),
  animation: document.getElementById('anim_canvas_translate'),
  producer: null,
  transport: null,
  clientId: null,
}
let device = null;

// inits the publisher and loads the audio input devices.
function init() {
  // load all input audio devices and add them to select list.
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(function () {
      return navigator.mediaDevices.enumerateDevices();
    })
    .then(function (deviceInfos) {
      deviceInfos.forEach(function (dev, i) {
        if (dev.kind === 'audioinput') {
          var option = document.createElement("option");
          option.value = dev.deviceId;
          option.text = dev.label || ('Audio ' + (i++));
          translation.deviceSelect.appendChild(option);
        }
      });
    });

  console.log('publisher loaded');
}

// Starts or stops streaming when clicked on button.
// Streaming source could be the translation stream or the normal stream.
function handleStream(streamingSrc) {
  // start streaming
  if (!streamingSrc.stream) {
    captureStream(streamingSrc);
    return;
  }

  // stop streaming
  stopCaptureStream(streamingSrc);
  unpublishStream(streamingSrc);
}

// Creates media stream for streamingSrc.
function captureStream(streamingSrc) {
  if (streamingSrc.stream) {
    console.warn('WARN: local media ALREADY started');
    return;
  }

  const constraint = {
    audio: streamingSrc.deviceSelect.value ? { deviceId: streamingSrc.deviceSelect.value } : true
  };
  navigator.mediaDevices.getUserMedia(constraint)
    .then((stream) => {
      streamingSrc.stream = stream;
      play(streamingSrc, streamingSrc.player, streamingSrc.stream);
      streamingSrc.btn.classList.remove('start');
      streamingSrc.btn.classList.add('stop');
      streamingSrc.deviceSelect.disabled = true;
      streamingSrc.btn_reload.disabled = false;
      publishStream(streamingSrc);
    })
    .catch(err => {
      console.error('media ERROR:', err);
    });
}

// Stops media stream for streamingSrc.
function stopCaptureStream(streamingSrc) {
  if (streamingSrc.stream) {
    pause(streamingSrc.player);
    stopStream(streamingSrc.stream);
    streamingSrc.stream = null;
  }
  streamingSrc.btn.classList.remove('stop');
  streamingSrc.btn.classList.add('start');
  streamingSrc.btn_reload.disabled = true;
  streamingSrc.deviceSelect.disabled = false;
}

// Publishes stream to consumers.
async function publishStream(streamingSrc) {
  if (!streamingSrc.stream) {
    console.warn('WARN: local media NOT READY');
    return;
  }

  // --- connect socket.io ---
  if (!socket) {
    await connectSocket(streamingSrc).catch(err => {
      console.error(err);
      return;
    });

    // --- get capabilities --
    const data = await sendRequest('getRouterRtpCapabilities', {});
    console.log('getRouterRtpCapabilities:', data);
    await loadDevice(data);
  }

  // --- get transport info ---
  console.log('--- createProducerTransport --');
  const params = await sendRequest('createProducerTransport', {});
  console.log('transport params:', params);
  streamingSrc.transport = device.createSendTransport(params);

  // --- join & start publish --
  streamingSrc.transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
    console.log('--transport connect');
    sendRequest('connectProducerTransport', { dtlsParameters: dtlsParameters })
      .then(callback)
      .catch(errback);
  });

  streamingSrc.transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
    console.log('--transport produce');
    try {
      const { id } = await sendRequest('produce', {
        transportId: streamingSrc.transport.id,
        kind,
        rtpParameters,
      });
      callback({ id });
    } catch (err) {
      errback(err);
    }
  });

  streamingSrc.transport.on('connectionstatechange', (state) => {
    switch (state) {
      case 'connecting':
        console.log('publishing...');
        break;

      case 'connected':
        console.log('published');
        break;

      case 'failed':
        console.log('failed');
        streamingSrc.transport.close();
        break;

      default:
        break;
    }
  });

  const audioTrack = streamingSrc.stream.getAudioTracks()[0];
  if (audioTrack) {
    const trackParams = { track: audioTrack };
    streamingSrc.producer = await streamingSrc.transport.produce(trackParams);
  }
}

// Stops publishing stream to consumers.
function unpublishStream(streamingSrc) {
  if (streamingSrc.stream) {
    pause(streamingSrc.player);
    stopStream(streamingSrc.stream);
    streamingSrc.stream = null;
  }
  if (streamingSrc.producer) {
    streamingSrc.producer.close(); // stream will stop
    streamingSrc.producer = null;
  }
  if (streamingSrc.transport) {
    streamingSrc.transport.close(); // stream will stop
    streamingSrc.transport = null;
  }
  disconnectSocket(streamingSrc);
}

function play(streamingSrc, element, stream) {
  if (element.srcObject) {
    console.warn('element ALREADY playing, so ignore');
    return;
  }
  element.srcObject = stream;
  element.volume = 0;
  visualizeStream(element, streamingSrc.animation, element.srcObject);
  return element.play();
}

function pause(element) {
  element.pause();
  element.srcObject = null;
}

function stopStream(stream) {
  let tracks = stream.getTracks();
  if (!tracks) {
    console.warn('NO tracks');
    return;
  }
  tracks.forEach(track => track.stop());
}

// update connected clients count on ui
function updateClientsCount(elem, count) {
  elem.innerHTML = count;
}

// ######### Socket functions ###########
let socket = null;
function connectSocket(src) {
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
    socket.on('message', function (message) {
      console.log('socket.io message:', message);
      if (message.type === 'welcome') {
        if (socket.id !== message.id) {
          console.warn('WARN: something wrong with clientID', socket.io, message.id);
        }

        src.clientId = message.id;
        console.log('connected to server. clientId=' + src.clientId);
        resolve();
      }
      else {
        console.error('UNKNOWN message from server:', message);
      }
    });
    socket.on('newProducer', async function (message) {
      console.warn('IGNORE socket.io newProducer:', message);
    });
    socket.on('consumersUpdated', function (message) {
      src.clientCount.innerHTML = message.count;
    });
  });
}

function disconnectSocket(src) {
  if (socket) {
    socket.emit('producerclose');
    socket.close();
    socket = null;
    src.clientId = null;
    src.clientCount.innerHTML = 0;
    console.log('socket.io closed.');
  }
}

function sendRequest(type, data) {
  return new Promise((resolve, reject) => {
    socket.emit(type, data, (err, response) => {
      if (!err) {
        // Success response, so pass the mediasoup response to the local Room.
        resolve(response);
      } else {
        reject(err);
      }
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

function reload() {
  if (socket) {
    socket.emit('reload');
  }
}