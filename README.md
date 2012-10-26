[![Build Status](https://secure.travis-ci.org/ssoper/timeslice.png)](http://travis-ci.org/ssoper/timeslice)

### Description

Used for collecting data into discrete 60 second time slices. So say you're at 23:45:12 and you want to collect data for the previous slice of 60 seconds. That is, you want to get data starting from 23:44:00 and going to 23:44:59, not from 23:44:12. This can be used for supplying data to 3rd party libraries such as Graphite.

Currently there is support for `push` and `incr`

#### Push

Used for values such as response times where you want to collect a lot of them and then find the min, max, avg, etc.

#### Incr

Used for incremental values such as total number of users.

#### Usage

Install

    npm install

Use

    var ts = require('ts');

    ts.start('myAppKey');
    ts.setup({ push: ['response'] }, function(err) {
      ts.push('response', 56);
      ts.push('response', 129);
      ts.push('response', 23);

      // After a minute
      ts.fields('push', function(err, results) {
        console.log(results); // { response: [56, 129, 23] }
      });
    });

#### Express

Included is [express.js](http://expressjs.com/) middleware which can be used to record response times.

    app.use(ts.express());
    
    // Declare routes…
    
    ts.setup({ push: ts.parseRoutes(app) });
    
The name for a particular route is in the form of `(METHOD/path/:id)`. So response times for `app.post('/books')` would be listed under `(POST/books)` while response times for `app.get('/books/:id')` would be under `(GET/books/:id)`.

#### Redis

By default the Redis client is mocked out. You can either pass `true` or `ts.start` to force a connection to Redis.

    ts.start('myAppKey', true, function(err, connected) {
      // Connected using the default localhost:6379
    });

You can also specify the connection yourself.

    var redis = require('redis');
    ts.redis.createClient = function() {
      return redis.createClient();
    }

#### License

MIT License
