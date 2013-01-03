var redis = require('redis'),
    uuid = require('node-uuid'),
    util = require("util"),
    EventEmitter = require('events').EventEmitter;

/**
 * Redis messaging bus client.
 * @param {Object} opts Options for message bus.
 * @param {String} [opts.host=127.0.0.1] Host of the redis server.
 * @param {Integer} [opts.port=6379] Port that redis is running under on host.
 * @param {Integer} [opts.db=0] Database number to run redis clients on.
 * @param {String} [opts.password=''] Auth password for redis instance, if included Redis connections will be authenticated. Defaults to no password and therefor no authentication.
 * @param {String} opts.namespace Namespace for messages. For two-way communication both clients must have same namespace set.
 * @param {String} opts.clientId Identifier of this client, should be unique when compared to all other clients.
 * @param {Number} [opts.messageTimeout=30000] The timeout length a message will wait for a response.
 * @param {Boolean} [opts.supressRedisError=true] Whether the client should automatically reconnect to the redis server and ignore redis errors. Defaults to true.
 * @class Remus
 * @constructor
 */
var Remus = function(opts) {
  opts = opts || {};

  var self = this;

  this._host = opts.host || '127.0.0.1';
  this._port = opts.port || 6379;
  this._password = opts.password || '';
  this._db = opts.db || 0;

  /**
   * Redis client for incoming messages.
   * @property incomingClient
   * @type {Object}
   */
  this.incomingClient = redis.createClient(this._port, this._host);
  if(this._password && this._password !== '') {
    this.incomingClient.auth(this._password);
  }

  // Select database on redis client
  this.incomingClient.select(this._db);

  /**
   * Redis client for outgoing messages.
   * @property outgoingClient
   * @type {Object}
   */
  this.outgoingClient = redis.createClient(this._port, this._host);
  if(this._password && this._password !== '') {
    this.outgoingClient.auth(this._password);
  }

  this.outgoingClient.select(this._db);

  var supressRedisError = opts.suppressRedisError || true;
  if(supressRedisError) {
    this.incomingClient.on("error", function(err) {
      console.log("Error connecting to redis", err);
    });
    this.outgoingClient.on("error", function(err) {
      console.log("Error connecting to redis", err);
    });
  }

  // Namespace is required for two-way communication.
  if(!opts.namespace) {
    throw new Error('namespace must be supplied as property on options');
  }

  /**
   * The message namespace to pass messages through. Changing namespace after
   * client is created is not supported.
   * @property namespace
   * @type {String}
   */
  this.namespace = opts.namespace;
  this._namespace = this.namespace.replace(':', '-');

  /**
   * Unique client identifier, must be unique compared to all other clients.
   * @property clientId
   * @type {String}
   */
  this.clientId = opts.clientId || uuid.v4();
  this._clientId = this.clientId.replace(':', '-');

  // Only subscribe to messages that are sent to this client
  this._messagePattern = this._namespace + ':' + this._clientId + ':*';

  // Subcribe to broadcast pattern
  this._broadcastPattern = this._namespace + '::*';

  // Add event listener for pubsub messages.
  this.incomingClient.on('pmessage', function(pattern, channel, msg) {
    self.handlePMessage(pattern, channel, msg);
  });

  // Subscribe to message pattern
  this.incomingClient.psubscribe(this._messagePattern);

  // Subscribe to broadcast message pattern
  this.incomingClient.psubscribe(this._broadcastPattern);

  // Messages waiting for response
  this._messagesWaiting = {};
  this._messageId = 0;

  /**
   * The amount of time that a message sent will wait for response. Value in
   * milliseconds.
   * @property messageTimeout
   * @type {Number}
   * @default 30000
   */
  this.messageTimeout = opts.messageTimeout || 30000;
};

/**
 * Inherit from EventEmitter to be able to emit events.
 */
util.inherits(Remus, EventEmitter);

Remus.prototype.broadcastMessage = function(type, msg) {
  type = type.replace('::', '??DC??');
  var channel = this._namespace + "::" + type + "::" + this._clientId;

  return this.outgoingClient.publish(channel, msg);
};

/**
 * Sends a message to another client connected to Remus.
 * @method sendMessage
 * @param {String} recepientId Client Id of the recepient.
 * @param {String} msg The message to send to the other client.
 * @param {Function} [callback] Callback function to call upon a response to
 * message.
 */
Remus.prototype.sendMessage = function(recepientId, msg, callback) {
  var msgId = ++this._messageId;
  var channel = this._namespace + ":" + recepientId + ":" +
                this._clientId + ":" + msgId;

  // If a callback is supplied setup waiting for response
  if(callback || typeof callback === Function) {
    // add timeout for maximum length for response
    var msgTimeout = setTimeout(function() {
      delete this._messagesWaiting[msgId];
      return callback(new Error('Message response timed out. Message Id : ' + msgId), null);
    }, this.messageTimeout);

    this._messagesWaiting[msgId] = {
      callback : callback,
      timeout : msgTimeout
    };
  }

  // Publish the message
  return this.outgoingClient.publish(channel, msg);
};

/**
 * Sends a message to a specific room. This is a broadcast message that has to
 * be listened to specifically.
 * @param  {String} room The room to send the message to.
 * @param  {String} msg The message to send to the room.
 */
Remus.prototype.sendRoomMessage = function(room, msg) {
  var msgId = ++this._messageId;
  room = room.replace(':', '??SC??');
  var channel = this._namespace + ":room:" + room + ":" +
                this._clientId + ":" + msgId;

  return this.outgoingClient.publish(channel, msg);
};

/**
 * Listens to messages published to specific room. When message is published
 * the passed in callback will be executed.
 * @param  {String} room The room to listen to.
 * @param  {Function} callback The function to call once a message has been
 * received. Callback should take two parameters, sender and message.
 */
Remus.prototype.listenToRoom = function(room, callback) {
  var roomc = room.replace(':', '??SC??');
  var roomChannel = this._namespace + ":room:" + roomc + ":*";

  this.incomingClient.psubscribe(roomChannel);

  return this.on('room:' + room, callback);
};

/**
 * Removes all listeners from room unless callback is passed in. If callback is
 * passed in then that function is removed as a listener.
 * @param  {String} room The room to stop listening to.
 * @param  {Function} [callback] The to remove as a listener.
 */
Remus.prototype.ignoreRoom = function(room, callback) {
  if(typeof callback === 'Function') {
    return this.removeListener(room, callback);
  }
  return this.removeAllListeners(room);

};

/**
 * Event handler for a message being received from redis. If it's a broadcast
 * message then "broadcast" event is emitted. If it's a normal message then the
 * "message" event is emitted.
 * @method handlePMessage
 * @param {String} pattern The pattern that the client was connected to.
 * @param {String} channel Message channel that message was published to.
 * @param {String} msg Message that was sent.
 */
Remus.prototype.handlePMessage = function(pattern, channel, msg) {

  // Handle broadcast messages
  if(pattern === this._broadcastPattern) {
    if(this.listeners('broadcast').length === 0) {
      return;
    }

    // Parse channels and sender
    var bcparts = channel.split('::');

    if(bcparts.length < 3) {
      return;
    }

    // Doublecheck namespace
    if(bcparts[0] !== this._namespace) {
      return;
    }

    var btype = bcparts[1].replace('??DC??', '::');
    var bsender = bcparts[2];

    // If broadcast message emit event with message data
    return this.emit('broadcast', btype, sender, msg);
  }

  // Handle room messages
  var roomMessagePrefix = this._namespace + ":room:";
  if(pattern.startsWith(roomMessagePrefix)) {
    var rparts = channel.split(':');

    var room = rparts[2].replace('??SC??', ':');
    var rsender = rparts[3];

    return this.emit('room:' + room, rsender, msg);
  }

  // Only handle messages for this client's pattern
  if(pattern !== this._messagePattern) {
    return;
  }

  // No reason to even look at the message if no one is listening
  if(this.listeners('message').length === 0) {
    return;
  }

  // Parse channel to determine if message if for this client
  var cparts = channel.split(':');

  // Check length of parts to make sure all information is included
  if(cparts.length < 4) {
    return;
  }

  // Doublecheck namespace
  if(cparts[0] !== this._namespace) {
    return;
  }

  var recepient = cparts[1];
  var sender = cparts[2];
  var msgId = cparts[3];
  var msgType = (cparts.length > 4) ? cparts[4] : 'm';

  // Ignore messages that aren't for this client
  if(recepient !== this._clientId) {
    return;
  }

  // If response call message callback and clear timeout
  if(msgType === 'r') {
    clearTimeout(this._messagesWaiting[msgId].timeout);
    var callback = this._messagesWaiting[msgId].callback;
    delete this._messagesWaiting[msgId];
    return callback(null, sender, msg);
  }

  var self = this;

  // If normal message emit event with message data
  this.emit('message', sender, msg, function(response) {
    if(!response || response === '') {
      return;
    }
    self.sendResponse(sender, msgId, response);
  });
};

/**
 * Sends a response for a incoming message.
 * @method sendResponse
 * @param {String} recepientId Client identifier to respond to.
 * @param {String} msgId Message identifier that is being responded to.
 * @param {String} msg Response message to be sent.
 */
Remus.prototype.sendResponse = function(recepientId, msgId, msg) {
  var channel = this._namespace + ":" + recepientId + ":" +
                this._clientId + ":" + msgId + ':r';
  this.outgoingClient.publish(channel, msg);
};

/**
 * Closes client connections and clears any messages waiting.
 * @method close
 */
Remus.prototype.close = function() {
   // On an unsubscribe to pattern channels close the connections.
  this.incomingClient.on('punsubscribe', function() {
    self.incomingClient.quit();
  });
  this.incomingClient.punsubscribe(this._messagePattern);
  this.outgoingClient.quit();
  for(var msgId in this._messagesWaiting) {
    clearTimeout(this._messagesWaiting[msgId].timeout);
    var callback = this._messagesWaiting[msgId].callback;
    delete this._messagesWaiting[msgId];
    callback(new Error('Client closed before message response received.'), null);
  }
};

/* Export Module */
module.exports = Remus;