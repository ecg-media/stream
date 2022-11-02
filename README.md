# Audio Stream

Sends audio from publisher server to multiple consumers over WebRTC.

This streaming service will only create one http server. It is not considered to be used in public production environment. If you want to use it in a production or secure environment, please put this server behind a reverse proxy. It's not part of this project.

## Requirements

This project use [mediasoup](https://mediasoup.org/documentation/v3/mediasoup/installation/). Please refer to the documentation for for information to setup mediasoup.
- **python 3.6** or higher shhould be installed on the system.
- **node v12** or higher
- **GNU make**
- **npm**

This project was tested on ubuntu, macOS, fedora. On debian the run fails.

## Setup

Just clone this repository and run `npm i` in the root folder. It will install all npm dependencies.


To start the server run from root folder `node server/index.js`. The server will run on your internal ip and port 80. To use another port run e.g. `PORT=3000 node server/index.js`.
Your ip address will be determined automatically. IIf this does not work start with manual set ip e.g `IP=0.0.0.0 node server/index.js`.

## Broadcast

To broadcast audio visit `http://localhost:<port>/publish.html` select your sound input device and press the publish button to start streaming.
This project uses the WebApi for broadcasting. You can only broadcast from localhost with http. If you want use it with another ip address or domain you have to use https. This is not part of this project.

## Listen

To listen to one stream just vist `http://<ip>:<port>` of your streaming server and press the play button.

## Stats

You can see statistic of connected clients with the `/stats.html` route: `http://<ip>:<port>/stats.html`

## Credits

This project is based on the broadcast example from https://github.com/mganeko/mediasoup_v3_example/
