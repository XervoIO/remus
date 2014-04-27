var Remus = require('../lib/remus');

var receiver = new Remus({
  namespace : 'remus-test',
  clientId : 'test-one'
});

receiver.on('message', function(sender, msg, done) {
  console.log('message : ' + sender + ' ' + msg);
  done();
});