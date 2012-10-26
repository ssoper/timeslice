var assert = require('assert'),
    express = require('express'),
    http = require('http'),
    async = require('async'),
    ts = require('../index')

describe('api', function() {

  describe('client', function() {
    it('fails with no redis', function(done) {
      ts.start('key', true, function(err, connected) {
        assert.ok(err);
        assert.ifError(connected);
        done();
      });
    });
  });

  describe('core', function() {
    before(function(done) {
      ts.start('tests' + Math.ceil(Math.random() *10000), function(err) {
        done();
      });
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

    describe('express', function() {
      var app = express(),
          port = 9001,
          minResponse = 90,
          maxResponse = 110;

      before(function(done) {
        var respond = function(req, res) {
          var delay = Math.floor(Math.random() * (maxResponse - minResponse + 1)) + minResponse;
          setTimeout(function() {
            res.send('hello world');
          }, delay);
        };

        app.use(ts.express());

        app.get('/', respond);
        app.get('/objects', respond);
        app.get('/objects/:id', respond);
        app.get('/objects/:id/count', respond);
        app.post('/object', respond);

        app.listen(port);
        ts.start('tests' + Math.ceil(Math.random() *10000), function(err) {
          done();
        });
      });

      it('setup routes', function(done) {
        var routes = ts.parseRoutes(app)
        ts.setup({ push: routes }, function(err, count) {
          assert.equal(routes.length, count);
          done();
        });
      });

      it('records response times', function(done) {
        count = 0;
        async.whilst(
          function () { return count < 5; },
          function (cb) {
            count++;
            var id = Math.ceil(Math.random() * 1000);
            var opts = { port: port, path: '/objects/' + id };

            http.request(opts, function(res) {
              cb();
            }).end();
          },
          function (err) {
            ts.fields('push', 0, function(err, results) {
              assert.equal(results['(GET/objects/:id)'].length, 5);
              results['(GET/objects/:id)'].forEach(function(responseTime) {
                assert.ok(parseInt(responseTime) > minResponse - 5);
                assert.ok(parseInt(responseTime) < maxResponse + 5);
              });
              done();
            });
          }
        );
      });
    });
  });

});
