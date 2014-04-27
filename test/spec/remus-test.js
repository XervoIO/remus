var vows = require('vows'),
    assert = require('assert'),
    Remus = require('../../lib/remus');

var receiver = new Remus({
  namespace : 'remus-test',
  clientId : 'test-one'
});

vows.describe('Remus - Redis Messaging Bus').addBatch({
  'when creating new remus client with required parameters' : {
    topic : function() {
      return new Remus({
        namespace : 'remus-test',
        clientId : 'one'
      });
    },
    'we should get a client with correct properties' : function(remus) {
      assert.isObject(remus);
      assert.isObject(remus.incomingClient);
      assert.isObject(remus.outgoingClient);
      assert.equal(remus.namespace, 'remus-test');
      assert.equal(remus.clientId, 'one');
      assert.equal(remus.messageTimeout, 30000);
    }
  }
}).addBatch({
  'when sending a message without a callback' : {
    topic : function() {
      var remus = new Remus({
        namespace : 'remus-test',
        clientId : 'two'
      });

      return remus.sendMessage('test-zero', 'this is a message');
    },
    'should get nothing returns' : function(smsg) {
      assert.isFalse(smsg);
    }
  },
  'when sending a message with a listener' : {
    topic : function() {
      var sender = new Remus({
        namespace : 'remus-test',
        clientId : 'three'
      });
      sender.sendMessage('test-one', 'this is a message');
      var self = this;
      receiver.on('message', function(sender, msg, res) {
        receiver.removeAllListeners('message');
        self.callback(sender, msg);
        res();
      });
    },
    'receiver should get message from sender' : function(sender, msg) {
      assert.equal(sender, 'three');
      assert.equal(msg, 'this is a message');
    }
  }
}).addBatch({
  'when sending a message with response' : {
    topic : function() {
      var sender = new Remus({
        namespace : 'remus-test',
        clientId : 'four'
      });
      var self = this;
      sender.sendMessage('test-one', 'this is a message', function(err, sender, msg) {
        self.callback(sender, msg);
      });

      receiver.on('message', function(sender, msg, res) {
        receiver.removeAllListeners('message');
        res('this is a response');
      });
    },
    'should get a response from receiver' : function(sender, msg) {
      assert.equal(sender, 'test-one');
      assert.equal(msg, 'this is a response');
    }
  }
}).export(module);