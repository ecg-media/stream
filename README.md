# Audio Stream

Sends audio from publisher server to multiple consumers over WebRTC.

This streaming service will only create one http server. It is not considered to be used in public production environment. If you want to use it in a production or secure environment, please put this server behind a reverse proxy. It's not part of this project.

## Requirements

This project use [mediasoup](https://mediasoup.org/documentation/v3/mediasoup/installation/). Please refer to the documentation for information to setup mediasoup.
- **python 3.6** or higher shhould be installed on the system.
- **node v12** or higher
- **GNU make**
- **npm**

This project was tested on ubuntu, macOS, fedora. On debian the run fails.

## Setup

Just clone this repository and run `npm i` in the root folder. It will install all npm dependencies.

````
sudo apt install npm python3-pip
npm i
````

To start the server run from root folder `node server/index.js`. The server will run on your internal ip and port 80. To use another port run e.g. `PORT=3000 node server/index.js`.
Your ip address will be determined automatically. If this does not work start with manual set ip e.g `IP=0.0.0.0 node server/index.js`.

### Auto start in linux
On a linux system you can create a systemd service to autostart the service when you restart your machine.

`cat /etc/system.d/system/stream.service`

```
[Unit]
Description=Service listen on the soundcard line in and streaming it so clients can listen to it on the network via browser at http://<ip>

[Service]
Type=simple
ExecStart=node /path/to/server/index.js

[Install]
WantedBy=multi-user.target
```

Than run following commands to enable and start the servcie.

- `sudo systemctl daemon-reload`
- `sudo systemctl start stream`
- `sudo systemctl enable stream`

### Multi instances
You can run multi instances on one server by defining a different port for one instance. For example you want to use 2 different streams in your environment. Than you can run the first one for example on port 80 and the second one on port 8080. Consider that you need two sound input devices from where you can stream.

Run first one with: `IP=x.y.z.a node server/index.js`

Run second one with: `PORT=8080 IP=x.y.z.a node server/index.js`

## Broadcast

To broadcast audio visit `http://localhost:<port>/publish.html` select your sound input device and press the publish button to start streaming.
This project uses the WebApi for broadcasting. You can only broadcast from localhost with http. If you want to use it with another ip address or domain you have to use https. This is not part of this project.

## Listen

To listen to one stream just vist `http://<ip>:<port>` of your streaming server and press the play button.

## Stats

You can see statistic of connected clients with the `/stats.html` route: `http://<ip>:<port>/stats.html`

## Credits

This project is based on the broadcast example from https://github.com/mganeko/mediasoup_v3_example/
