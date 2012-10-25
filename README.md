[![Build Status](https://secure.travis-ci.org/ssoper/timeslice.png)](http://travis-ci.org/ssoper/timeslice)

### Description

Used for collecting data into discrete 60 second time slices. So say you're at 23:45:12 and you want to collect data for the previous slice of 60 seconds. That is, you want to get data starting from 23:44:00 and going to 23:44:59, not from 23:44:12. This can be used for supplying data to 3rd party libraries such as Graphite.

Currently there is support for `push` and `incr`

#### Push

The 'push' key is for values such as response times where you want to collect a lot of them and then find the min, max, avg, etc.

#### Incr

The 'incr' key is a single incremented value and is used for collecting data such as total number of users.

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

#### License

MIT License
