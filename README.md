# Remus

A Redis messaging bus. This module facilitates a real-time messaging using Redis the backend. This allows for interprocess communication using redis as the mediator.

## Installation

The module can be installed using [npm][http://npmjs.org].

    npm install remus

## Features

* Send message to client
* Clients broken down by namespace
* Ability to respond to messages
* Configurable redis connection

## Basic Usage

Remus is easy to use, all you need to do is create a client and send a message. On the other end another client can respond to a message easily using the response function passed into the 'message' event.

    var Remus = require('remus');
    var sender = new Remus({
      namespace : 'your-space',
      clientId : 'client-1'
    });
    var receiver = new Remus({
      namespace : 'your-space',
      clientId : 'client-2'
    });
    receiver.on('message', function(sender, msg, res) {
      // event for when message comes in
      console.log(sender, msg);
      // the res function must be called when done with message either with
      // a response or not
      res('reply to message');
    });
    sender.sendMessage('client-2', 'a message', function(err, sender, msg) {
      // handler for response from 'client-2'
      console.log(sender, msg);
    });

## Documentation


### Possible Additions

* Broadcast messages (send message to all clients in namespace)

