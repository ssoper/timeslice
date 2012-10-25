var os = require('os'),
    util = require('util'),
    async = require('async'),
    moment = require('moment'),
    fakeredis = require('fakeredis'),
    redis = require('./redis-client')

// Helper object to manage redis keys
var RedisKey = function(base) {
  this.key = base;
};

RedisKey.prototype.add = function() {
  var args = Array.prototype.slice.call(arguments);
  return this.key + ':' + args.join(':');
}

function Timeslice() {
  this.baseKey = false;
  this.client = false;
}

Timeslice.prototype.start = function(appKey, needRedis) {
  this.baseKey = new RedisKey('stats:' + appKey);
  if (!needRedis) {
    this.redis.createClient = function() {
      return fakeredis.createClient()
    }
  }

  this.client = redis.client();
}

Timeslice.prototype.stop = function() {
  this.client.quit();
}

Timeslice.prototype.push = function(key, value) {
  var self = this;
  key = self.baseKey.add(key, moment().format('YYYYMMDDhhmm'));
  self.client.lpush(key, value, function(err, result) {
    !err && self.client.expire(key, 86400);
  });
};

Timeslice.prototype.incr = function(field) {
  var self = this;
  var key = self.baseKey.add('incr', moment().format('YYYYMMDDhhmm'));
  self.client.hincrby(key, field, 1, function(err, result) {
    !err && self.client.expire(key, 86400);
  });
};

Timeslice.prototype.fields = function(type, offset, cb) {
  if (!cb) {
    cb = offset;
    offset = 1;
  }

  var self = this;
  var minute = moment().subtract('minutes', offset).format('YYYYMMDDhhmm');
  var results = {};

  var parseKey = function(redisKey) {
    var parts = redisKey.split(':');
    return parts[parts.length - 1];
  }

  if (type == 'push') {
    var configKey = self.baseKey.add('fields','push');

    self.client.zrange(configKey, 0, -1, function(err, keys) {
      async.forEachSeries(keys, function(key, async_cb) {
        var resultKey = parseKey(key);
        results[resultKey] = [];
        var timeKey = self.baseKey.add(key, minute);
        self.client.lrange(timeKey, 0, -1, function(err, items) {
          items.forEach(function(item) {
            results[resultKey].unshift(item);
          });

          async_cb();
        });
      }, function(err) {
        return cb(null, results);
      });
    });
  } else if (type == 'incr') {
    var fieldsKey = self.baseKey.add('fields','incr');
    var key = self.baseKey.add('incr', minute);

    self.client.zrange(fieldsKey, 0, -1, function(err, fields) {
      async.forEachSeries(fields, function(field, async_cb) {
        results[field] = 0;
        self.client.hget(key, field, function(err, value) {
          if (value)
            results[field] = value;
          async_cb();
        });
      }, function(err) {
        return cb(null, results);
      });
    });
  }
}

Timeslice.prototype.setup = function(opts, cb) {
  if (!this.client)
    return cb('No redis client');

  var self = this;
  var masterCount = 0;

  var addField = function(list, key, cb) {
    var count = 0;
    async.forEachSeries(list, function(member, async_cb) {
      var addKey = self.baseKey.add('fields', key);
      self.client.zadd(addKey, count, member, function(err, result) {
        count++;
        async_cb();
      });
    }, function(err) {
      cb(null, count);
    });
  }

  async.series([
    function(series_cb) {
      if (!opts.push)
        return series_cb();

      // The 'push' key for values such as response times where you want to collect and then find the min, max, avg, etc
      addField(opts.push, 'push', function(err, count) {
        masterCount += count;
        series_cb();
      });
    },

    function(series_cb) {
      if (!opts.incr)
        return series_cb();

     // The 'incr' key is used for values such as total number of users
     addField(opts.incr, 'incr', function(err, count) {
       masterCount += count;
       series_cb();
     });
    }
  ], function(err) {
    if (err)
      return cb(err);

    return cb(null, masterCount);
  });
}

module.exports = new Timeslice();
module.exports.redis = redis;