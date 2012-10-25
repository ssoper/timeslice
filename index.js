var net = require('net'),
    os = require('os')

module.exports = function(client, keyName) {

  var key = 'stats:' + keyName + ':';

  function Timeslice() {
    
  }

}


   //  events = require('events'),
   //  util = require('util'),
   //  moment = require('moment'),
   //  async = require('async'),
   //  config = require('./config'),
   //  env = require('./env'),
   // logger = require('./logger'),
   // redis = require('../node_modules/kue/node_modules/redis');


function Stats() {
  var client,
      masterKey,
      redisUnavailable = false;

  if (config.stats && config.stats.key) {
    masterKey = 'stats:' + config.stats.key + ':';
  }

  var connectToRedis = function() {
    client = redis.createClient(config.redis.port, config.redis.host)
  };

  var getHosts = function(topKey, cb) {
    if (env.production || env.staging) {
      var hostsKey = topKey + 'fields:hosts';
      client.zrange(hostsKey, 0, -1, function(err, hosts) {
        cb(hosts);
      });
    } else {
      cb(['localhost']);
    }
  }

  function Public() {
    events.EventEmitter.call(this);

    this.connect = function() {
      var self = this;
      net.createConnection(config.redis.port, config.redis.host).
        on('error', function(err) {
          if (err.code == 'ECONNREFUSED' && (env.production || env.staging))
            throw err
          redisUnavailable = true;
        }).
        on('connect', function() {
          this.end();
          connectToRedis();

          if (!config.stats)
            return;

          // Setup the fields in Redis
          async.series([
            function(series_cb) {
              var count = 0;
              async.forEachSeries(config.stats.push, function(member, async_cb) {
                var key = masterKey + 'fields:push';
                client.zadd(key, count, member, function(err, result) {
                  count++;
                  async_cb();
                });
              }, function(err) {
                series_cb();
              });
            },

            function(series_cb) {
              async.forEachSeries(config.stats.incr, function(obj, outer_cb) {
                var field = Object.keys(obj)[0]
                var key = masterKey + 'fields:incr:' + field;
                var events = obj[field];
                var count = 0;
                async.forEachSeries(events, function(member, inner_cb) {
                  client.zadd(key, count, member, function(err, result) {
                    count++;
                    inner_cb();
                  });
                }, function(err) {
                  outer_cb();
                });
              }, function(err) {
                series_cb();
              });
            },

            function(series_cb) {
              if (!config.stats.per_host) {
                series_cb();
                return;
              }
              async.series([
                function(inner_cb) {
                  var count = 0;
                  async.forEachSeries(config.stats.per_host.hosts, function(host, async_cb) {
                    var key = masterKey + 'fields:hosts';
                    client.zadd(key, count, host, function(err, result) {
                      count++;
                      async_cb();
                    });
                  }, function(err) {
                    inner_cb();
                  });
                },

                function(inner_cb) {
                  var count = 0;
                  async.forEachSeries(config.stats.per_host.fields, function(field, async_cb) {
                    var key = masterKey + 'fields:names';
                    client.zadd(key, count, field, function(err, result) {
                      count++;
                      async_cb();
                    });
                  }, function(err) {
                    inner_cb();
                  });
                },
              ], function(err) {
                series_cb();
              });
            }
          ], function(err) {
            logger.debug('Updated Redis config');
            self.emit('updated', null);
          });
        });
    };

    this.push = function(key, executionTime) {
      if (redisUnavailable)
        return false;

      key = masterKey + key + ':' + moment().format('YYYYMMDDhhmm');
      client.lpush(key, executionTime, function(err, result) {
        !err && client.expire(key, 86400);
      });
    };

    this.incr = function(key, field) {
      if (redisUnavailable)
        return false;

      key = masterKey + key + ':' + moment().format('YYYYMMDDhhmm');
      client.hincrby(key, field, 1, function(err, result) {
        !err && client.expire(key, 86400);
      });
    };

    this.set = function(key, value) {
      if (redisUnavailable)
        return false;

      var host = (env.production || env.staging) ? os.hostname() : 'localhost';
      key = masterKey + host + ':' + key + ':' + moment().format('YYYYMMDDhhmm');
      client.set(key, value, function(err, result) {
        !err && client.expire(key, 86400);
      });
    };

    this.render = function(appKey, push_cb, cb) {
      if (redisUnavailable) {
        cb([]);
        return;
      }

      var topKey = 'stats:' + appKey + ':';
      var minute = moment().subtract('minutes', 1).format('YYYYMMDDhhmm')
      var results = [];

      async.series([
        function(series_cb) {
          var configKey = topKey + 'fields:push';
          client.zrange(configKey, 0, -1, function(err, keys) {
            async.forEachSeries(keys, function(key, async_cb) {
              var key = topKey + key + ':' + minute;
              client.lrange(key, 0, -1, function(err, items) {
                push_cb(key, items, function(name, value) {
                  results.push({ name: name, value: value });
                  async_cb();
                });
              });
            }, function(err) {
              series_cb();
            });
          });
        },

        function(series_cb) {
          var configKey = topKey + 'fields:incr:*';
          client.keys(configKey, function(err, keys) {
            async.forEachSeries(keys, function(incrKey, each_series_cb) {
              client.zrange(incrKey, 0, -1, function(err, events) {
                var zKey = topKey + incrKey.split(':').pop() + ':' + minute;
                async.forEach(events, function(evt, async_cb) {
                  client.hget(zKey, evt, function(err, value) {
                    var name = evt.replace(/_/, ' ');
                    name = name.charAt(0).toUpperCase() + name.slice(1);
                    results.push({ name: name, value: (value || 0) });
                    async_cb();
                  });
                }, function(err) {
                  each_series_cb();
                });
              });
            }, function(err) {
              series_cb();
            });
          })
        },

        function(series_cb) {
          var fieldsKey = topKey + 'fields:names';
          client.zrange(fieldsKey, 0, -1, function(err, fields) {
            var hostsKey = topKey + 'fields:hosts';
            getHosts(topKey, function(hosts) {
              async.forEachSeries(hosts, function(host, host_cb) {
                async.forEachSeries(fields, function(field, field_cb) {
                  var key = topKey + host + ':' + field + ':' + minute;
                  client.get(key, function(err, value) {
                    var name = key.split(':').slice(2, -1).join(' ').replace(/_/g, ' ');
                    name = name.charAt(0).toUpperCase() + name.slice(1);
                    results.push({ name: name, value: (value || 0) });
                    field_cb();
                  });
                }, function(err) {
                  host_cb();
                })
              }, function(err) {
                series_cb();
              });
            });
          })
        }
      ], function(err) {
        cb && cb(results);
      })
    };
  };

  util.inherits(Public, events.EventEmitter);

  return new Public;
}

var stats = new Stats();
stats.connect();
module.exports = stats;
