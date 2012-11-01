var os = require('os'),
    net = require('net'),
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

Timeslice.prototype.start = function(appKey, needRedis, cb) {
  if (!cb && typeof(needRedis) != 'boolean') {
    cb = needRedis;
    needRedis = false;
  }

  var self = this;
  this.baseKey = new RedisKey('stats:' + appKey);

  if (!needRedis) {
    this.client = fakeredis.createClient();
    if (cb)
      return cb(null, true);
  } else {
    this.client = redis.createClient();

    if (this.client) {
      if (cb) return cb(null, true);
      return;
    }

    net.createConnection(6379, 'localhost')
      .on('error', function(err) {
        if (err.code == 'ECONNREFUSED') {
          return cb(err, false);
        }
      })
      .on('connect', function() {
        this.end();
        self.client = redis.defaultClient();
        if (cb)
          return cb(null, true);
      });
  }
}

Timeslice.prototype.stop = function() {
  this.client.quit();
}

Timeslice.prototype.push = function(key, value) {
  var self = this;
  key = self.baseKey.add('push', key, moment().format('YYYYMMDDhhmm'));
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
    var parts = redisKey.split(":(?![^()]*+\\))") // Split on colons that are not in parentheses
    return parts[parts.length - 1];
  }

  if (type == 'push') {
    var configKey = self.baseKey.add('fields','push');

    self.client.lrange(configKey, 0, -1, function(err, keys) {
      async.forEachSeries(keys, function(key, async_cb) {
        var resultKey = parseKey(key);
        results[resultKey] = [];
        var timeKey = self.baseKey.add('push', key, minute);
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

    self.client.lrange(fieldsKey, 0, -1, function(err, fields) {
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
  if (!this.client) {
    if (cb) return cb('No redis client');
    throw 'No redis client'
  }

  var self = this;
  var masterCount = 0;

  var addField = function(list, key, cb) {
    var count = 0;
    if (!Array.isArray(list)) {
      list = [list];
    }

    async.forEachSeries(list, function(member, async_cb) {
      var addKey = self.baseKey.add('fields', key);
      self.client.lpush(addKey, member, function(err, result) {
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
    if (!cb)
      return;
    if (err)
      return cb(err);
    return cb(null, masterCount);
  });
}

Timeslice.prototype.formatRoute = function(routeStr) {
  var str = routeStr.substr(1, routeStr.length-2);
  var method = str.split('/')[0];
  var path = '/' + str.replace(/:/, '').split('/').slice(1).join('/');

  return method + ' ' + path;
}

Timeslice.prototype.normalizeRoute = function(route) {
  return '(' + route.method.toUpperCase() + route.path + ')';
}

Timeslice.prototype.parseRoutes = function(app) {
  var routes = [];
  var self = this;

  ['get', 'post', 'put', 'delete'].forEach(function(verb) {
    app.routes[verb] && app.routes[verb].forEach(function(route) {
      routes.push(self.normalizeRoute(route));
    });
  });

  return routes;
};

Timeslice.prototype.express = function() {
  var self = this;

  return function(req, res, next){
    var start = new Date;

    if (res._responseTimeslice) return next();
    res._responseTimeslice = true;

    res.on('header', function(header) {
      if (req.route) {
        var field = self.normalizeRoute(req.route);
        self.push(field, new Date - start);
      }
    });

    next();
  };
}

module.exports = new Timeslice();
module.exports.redis = redis;
