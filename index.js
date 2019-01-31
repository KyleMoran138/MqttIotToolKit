const bodyParser = require('body-parser')
const Store = require('data-store')
const bonjour = require('nbonjour').create(
  {
    multicast: true,
    port: 1883, // set the udp port
    ttl: 255, // set the multicast ttl
  }
);
const express = require('express')
const mqtt = require('mqtt')
const mosca = require('mosca')

// Init variables
const deviceConfigs = new Store({path: "devices.json"})
const mqttServer = new mosca.Server({port: 1883})
const mqttClient = mqtt.connect('mqtt://127.0.0.1')
const app = express()
const devices = {}
let server = 0

// Setup express app
app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(bodyParser.urlencoded({extended: true}))


// Set event listeners
mqttServer.on('ready', function(){
  console.log("The mqtt server is ready!")
  loadDataFromSave()
})

mqttClient.on('connect', function () {
  console.log('The mqtt client is connected!')
  mqttClient.subscribe('allEsp')
})

mqttClient.on('message', function(topic, message){
  message = message.toString()
  handelMqttMessage(topic, message)
})

process.on('SIGTERM', () => {
  shutdownServer()
});

process.on('SIGINT', () => {
  shutdownServer()
});

// Set up api endpoints
app.get('/', function(req, res){
  res.render('index', {devices: devices})
})

app.get('/device/:id', function(req, res){
  res.render('device/details', {device: devices[req.params.id]})
})

app.post('/action/create/:deviceId/', function(req, res){
  addDeviceAction(req.params.deviceId, req.body.name, req.body.action)
  res.sendStatus(200)
})

app.post('/action/remove/:deviceId/', function(req, res){
  removeDeviceAction(req.params.deviceId, req.body.name)
  res.sendStatus(200)
})

// Start express server
server = app.listen(3000, function(req, res){
  console.log('The mqtt toolset is ready at port 3000!')
})

// This pulls the information from devices.json
function loadDataFromSave(){
  for(deviceName in deviceConfigs.data){
    let device = deviceConfigs.data[deviceName]
    newDevice(device.id, true, device.actions)
  }
}

// This is where all mqtt things go
function handelMqttMessage(originalTopic, message){
  let deviceId = originalTopic.split(':',2)[0]
  let topic = originalTopic.split(':',2)[1]
  if(deviceId == "allEsp" && !devices[message]){
    newDevice(message)
  }else if(deviceId && topic && message){
    runAction(deviceId, topic)
  }
}

// Add a new device to the savefile and array
function newDevice(deviceId, loadedFromSave = false, loadedActions={}){
  let deviceObject = {
    id: deviceId,
    actions: loadedActions,
  }
  devices[deviceId] = deviceObject
  if(!loadedFromSave){
    deviceConfigs.data = devices
    console.log('found ', deviceId, ' ! ')
  }else{
    for(actionName in loadedActions){
      mqttClient.subscribe(deviceId+':'+actionName)
    }
  }
}

// Attempt to execute command from device
function runAction(deviceId, actionName){
  if(devices[deviceId]){
    let device = devices[deviceId];
    for(realActionName in device.actions){
      let actionMethod = device.actions[realActionName]
      if(realActionName == actionName){
        eval('[' + actionMethod + ']')[0]()
        deviceConfigs.data = devices
      }
    }
  }
}

// Add method to device action
function addDeviceAction(deviceId, actionName, func){
  if(devices[deviceId]){
    let device = devices[deviceId]
    if(!device.actions){
      device.actions = []
    }
    if(!device.actions[actionName]){
      mqttClient.subscribe(deviceId + ':' + actionName)
    }
    device.actions[actionName] = func.toString()
    deviceConfigs.data = devices
  }
}

// remove method to device action
function removeDeviceAction(deviceId, actionName){
  if(devices[deviceId]){
    let device = devices[deviceId]
    if(!device.actions){
      return
    }
    if(device.actions[actionName]){
      mqttClient.unsubscribe(deviceId + ':' + actionName)
    }
    device.actions[actionName] = undefined
    deviceConfigs.del(deviceId+'.actions.'+actionName)
  }
}

function shutdownServer(){
  console.log('Shutting down server')
  bonjour.unpublishAll()
  server.close()
  mqttClient.end()
  mqttServer.close()
  process.exit()
}

module.exports = app