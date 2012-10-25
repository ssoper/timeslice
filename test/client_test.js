var assert = require('assert'),
    fakeredis = require('fakeredis')
    ts = require('../index')

describe('api', function() {

  describe('client', function() {
    it('fails with no redis', function(done) {
      ts.start('key', true);
      assert.ok(!ts.client.connected);
      done();
    });
  });

  describe('core', function() {
    before(function() {
      ts.start('tests' + Math.ceil(Math.random() *10000));
    });

    after(function() {
      ts.stop();
    });

    it('push', function(done) {
      ts.setup({ push: ['response'] }, function(err) {
        var times = [];
        for (var i=0; i < 5; i++) {
          times.push(Math.random()*100);
          ts.push('response', times[i]);
        }

        ts.fields('push', 0, function(err, results) {
          assert.deepEqual(results['response'], times)
          done();
        });
      });
    });

    it('incr', function(done) {
      ts.setup({ incr: ['users'] }, function(err) {
        var largeNum = Math.ceil(Math.random()*10000);
        for (var i=0; i < largeNum; i++) {
          ts.incr('users');
        }

        ts.fields('incr', 0, function(err, results) {
          assert.equal(results['users'], largeNum);
          done();
        })
      })
    });
  });
});
