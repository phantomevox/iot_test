'use strict';
const underscore = require('underscore');
const request = require('request');
const autobahn = require('autobahn');
const uuidv4 = require('uuid/v4');
const gpio = require("gpio");
const gpio4 = gpio.export(4, {
  direction: gpio.DIRECTION.OUT,
  interval: 200,
  ready: function () {
    gpio4.reset();
    console.log("GPIO Instantiated")
  }
});

// Generate UUID
const device_uuid = process.env.BALENA_DEVICE_UUID || uuidv4();
console.log('Device UUID is: ' + device_uuid);

// WebSocket connection constants
const ws_host = process.env.WS_HOST || '043f38db.ngrok.io';
const ws_realm = process.env.WS_REALM || 'com.lucasantarella.iot';
const ws_port = process.env.WS_PORT || '80';
const ws_wss = process.env.WS_WSS || 'ws';

// API connection constants
const api_host = process.env.API_HOST || '043f38db.ngrok.io';
const api_port = process.env.API_PORT || '80';
const api_https = process.env.API_HTTPS || 'https';

const api_uri = api_https + '://' + api_host + ':' + api_port;

let connection = new autobahn.Connection({
  url: ws_wss + '://' + ws_host + ':' + ws_port,
  realm: ws_realm,
  tlsConfiguration: {}
});

function registerWithApi() {
  request.post(api_uri + '/devices', {
    json: {
      "id": device_uuid,
      "type": "action.devices.types.LIGHT",
      "traits": [
        "action.devices.traits.OnOff",
      ],
      "name": {
        "defaultNames": ["LED Light"],
        "name": "ledlight",
        "nicknames": ["reading lamp"]
      },
      "willReportState": false,
      "attributes": {},
      "deviceInfo": {
        "manufacturer": "SANTARELLA",
        "model": "LED-100",
        "hwVersion": "1.0.0",
        "swVersion": "1.0.0"
      },
      "customData": {}
    }
  }, (error, res, body) => {
    if (error) {
      console.error(error);
      return
    }
    console.log(body);
  })
}

connection.onopen = (session) => {
  registerWithApi();

  session.subscribe('com.lucasantarella.iot.devices.' + device_uuid, (args) => {
    console.log("Event:", args[0]);
    gpio4.set(!(gpio4.value), function () {
      console.log("GPIO Set to " + gpio4.value)
    });
  });

  session.register('com.lucasantarella.iot.devices.' + device_uuid + '.status', () => {
    return {
      online: true,
      on: gpio4.value === 1
    };
  });

  session.register('com.lucasantarella.iot.devices.' + device_uuid + '.execute', (commands) => {
    let promises = [];
    _.each(commands, (command, index) => {
      promises.push(new Promise((fulfilledHandler, error) => {
        switch (command.command) {
          case 'action.devices.commands.OnOff':
            // Handle on/off switch
            gpio4.set(command.params.on);
            fulfilledHandler(true);
            break;

          default:
            error('could not process command');
        }
      }))
    });

    return Promise.all(promises).then(values => {
      return {
        online: true,
        on: gpio4.value === 1
      };
    })
  });
};

connection.open();