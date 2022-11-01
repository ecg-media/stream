translation = {
    clientCount: document.getElementById('clients_translate'),
    pub: document.getElementById('pub_translate'),
    clientId: null,
    transport: null,
};

let socket = null;

function init() {
    connectSocket();
    console.log('Stats loaded...');
}

function connectSocket() {
    if (socket) {
       socket.close();
       socket = null;
       clientId = null;
    }
 
    return new Promise((resolve, reject) => {
       socket = io.connect('/');
 
       socket.on('connect',  async function (evt) {
          socket.emit('statsConnected');
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
 
             clientId = message.id;
             console.log('connected to server. clientId=' + clientId);
             resolve();
          }
          else {
             console.error('UNKNOWN message from server:', message);
          }
       });
       socket.on('newProducer', async function (message) {
          translation.pub.innerHTML = "Ja";
       });
       socket.on('producerClosed', function (message) {
          translation.pub.innerHTML = "Nein";
       });
       socket.on('consumersUpdated', function (message) {
          translation.clientCount.innerHTML = message.count;
       });
       socket.on('statsUpdate', function (message) {
        console.log("stats Updated")
        translation.clientCount.innerHTML = message.translationClientCount;
        translation.pub.innerHTML = message.translationPubActive ? "Ja" : "Nein";
       });
    });
 }

window.onunload = window.onbeforeunload = function () {
    disconnectSocket();
};

function isSocketConnected() {
    return socket != null;
}

function disconnectSocket() {
    if (isSocketConnected()) {
        socket.close();
        socket = null;
        translation.clientId = null;
        console.log('socket.io closed..');
    }
}