var assert = require('assert'),
    ts = require('../index')

describe('api', function() {
  before(function(done) {
    helper.servers.api.start();
    helper.servers.backplane.start();
    helper.servers.identity.start();
    helper.servers.login.start();
    helper.servers.echo.start();
    helper.load(function() {
      done();
    })
  });

  after(function() {
    helper.servers.api.stop();
    helper.servers.backplane.stop();
    helper.servers.identity.stop();
    helper.servers.login.stop();
    helper.servers.echo.stop();
  });

  describe('clients', function() {
    it('is unauthorized', function(done) {
      var story = helper.data.stories['story1'];
      var storyId = new Buffer(story.url).toString('base64');
      var dest = url.parse(helper.servers.api.host + '/api/stories/' + storyId);
      request.get({ url: dest, jar: false }, function(error, response, body) {
        assert.equal(response.statusCode, 401);
        done();
      });
    });

    it('is authorized', function(done) {
      var jar = request.jar();
      var dest = url.parse(helper.servers.api.host + '/api/clients');

      request.post({ url: dest, form: helper.validClient, jar: jar }, function(error, response, body) {
        assert.equal(response.statusCode, 200);
        var result = JSON.parse(body);
        assert.ok(result.clientValid);
        assert.equal(jar.cookies[0].value, helper.validClient.clientId);
        done();
      });
    });
  });

  describe('requires client', function() {
    var jar = request.jar();

    beforeEach(function(done) {
      var postClient = helper.servers.api.host + '/api/clients';

      request.post({ url: postClient, form: helper.validClient, jar: jar }, function(error, response, body) {
        assert.equal(response.statusCode, 200);
        done();
      });
    });

    describe('comments', function() {
      Object.keys(helper.data.stories).forEach(function(key) {
        var story = helper.data.stories[key];
        var storyId = new Buffer(story.url).toString('base64')

        it('returns comments for ' + story.title, function(done) {
          var dest = url.parse(helper.servers.api.host + '/api/stories/' + storyId);
          request.get({ url: dest, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 200)
            var result = JSON.parse(body);
            assert.ok(Array.isArray(result));
            assert.ifError(result[0].content.match(/<[a-zA-Z\/][^>]*>/))
            done();
          });
        });

        it('returns comments with HTML for ' + story.title, function(done) {
          var dest = url.parse(helper.servers.api.host + '/api/stories/' + storyId + '?includeHtml=true');
          request.get({ url: dest, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 200)
            var result = JSON.parse(body);
            assert.ok(Array.isArray(result));
            assert.ok(result[0].content.match(/<[a-zA-Z\/][^>]*>/))
            done();
          });
        });

        it('returns count for ' + story.title, function(done) {
          var dest = url.parse(helper.servers.api.host + '/api/stories/' + storyId + '/count');
          var expected = lodash.filter(helper.data.comments, function(comment) { return comment.story.toString() == story._id.toString() });
          request.get({ url: dest, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 200);
            var result = JSON.parse(body);
            assert.equal(result.comments, expected.length)
            done();
          });
        });
      }); // Object.keys
    }); // comments

    describe('authors', function() {
      Object.keys(helper.data.authors).forEach(function(key) {
        var author = helper.data.authors[key];
        it('returns data for ' + author.name, function(done) {
          var dest = url.parse(helper.servers.api.host + '/api/authors/' + author._id);
          request.get({ url: dest, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 200)
            var result = JSON.parse(body);
            assert.ifError(result.email); // Shouldn't be returning an author's email
            assert.equal(result.avatar_url, author.avatar_url);
            done();
          });
        });
      }); // Object.keys
    }); // authors

    describe('sessions', function() {
      Object.keys(helper.data.users).forEach(function(key) {
        describe('user ' + key, function() {
          var user = helper.data.users[key];
          var sessionId;

          before(function(done) {
            var dest = url.parse(helper.servers.api.host + '/api/sessions');
            var form = {
              email: user.email,
              password: 'asdfasdf'
            };

            request.post({ url: dest, form: form, jar: jar }, function(error, response, body) {
              assert.equal(response.statusCode, 200);
              var result = JSON.parse(body);
              assert.ok(result.sessionId);
              sessionId = result.sessionId;
              done();
            });
          });

          after(function(done) {
            var dest = url.parse(helper.servers.api.host + '/api/sessions');
            request({ method: 'delete', url: dest, jar: jar }, function(error, response, body) {
              assert.equal(response.statusCode, 200);
              var result = JSON.parse(body);
              assert.ok(result.logged_out);
              done();
            });
          });

          it('validates session for ' + user.name, function(done) {
            assert.ok(sessionId);
            done();
          });

          it('gets info about the user ' + user.name, function(done) {
            var dest = url.parse(helper.servers.api.host + '/api/sessions');
            request.get({ url: dest, jar: jar }, function(error, response, body) {
              assert.equal(response.statusCode, 200);
              var result = JSON.parse(body);
              assert.equal(result._id, sessionId)
              done();
            });
          });

          it('returns an error if not logged in for ' + user.name, function(done) {
            var dest = url.parse(helper.servers.api.host + '/api/sessions');
            var clientIdCookie = lodash.find(jar.cookies, function(cookie) { return cookie.str.match(/clientId/) });
            var noSessionJar = request.jar();
            noSessionJar.add(clientIdCookie)

            request.get({ url: dest, jar: noSessionJar }, function(error, response, body) {
              assert.equal(response.statusCode, 404);
              done();
            });
          });

          it('posts a parent comment', function(done) {
            var story = helper.data.stories.story1;
            var storyId = new Buffer(story.url).toString('base64')
            var dest = url.parse(helper.servers.api.host + '/api/stories/' + storyId);
            var form = {
              content: 'This is a new comment'
            };

            request.post({ url: dest, form: form, jar: jar }, function(error, response, body) {
              assert.equal(response.statusCode, 200);
              done();
            });
          });

          it('posts a reply to a comment', function(done) {
            var comment = helper.data.comments.comment1;
            var dest = url.parse(helper.servers.api.host + '/api/comments/' + comment._id);
            var form = {
              content: 'This is a new reply to a comment'
            };

            request.post({ url: dest, form: form, jar: jar }, function(error, response, body) {
              assert.equal(response.statusCode, 200);
              done();
            });
          });

          ['flag', 'unflag', 'like', 'unlike'].forEach(function(action) {
            it(action + 's a comment', function(done) {
              var comment = helper.data.comments.comment1;
              var dest = url.parse(helper.servers.api.host + '/api/comments/' + comment._id + '/' + action);
              request.post({ url: dest, jar: jar }, function(error, response, body) {
                assert.equal(response.statusCode, 200);
                done();
              });
            });
          });
        }); // user
      }); // Object.keys
    }); // sessions

    describe('users', function() {
      it('creates a user', function(done) {
        var dest = url.parse(helper.servers.api.host + '/api/users/');
        var form = {
          email: 'new.user@test.com',
          password: 'asdfasdf',
          displayName: 'New User'
        };

        request.post({ url: dest, form: form, jar: jar }, function(error, response, body) {
          assert.equal(response.statusCode, 200);
          done();
        });
      });

      describe('update', function() {
        var sessionId,
            userEmail = 'new.user@test.com';

        before(function(done) {
          var dest = url.parse(helper.servers.api.host + '/api/sessions');
          var form = {
            email: userEmail,
            password: 'asdfasdf'
          };

          request.post({ url: dest, form: form, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 200);
            var result = JSON.parse(body);
            assert.ok(result.sessionId);
            sessionId = result.sessionId;
            done();
          });
        });

        it('validates session for new user', function(done) {
          assert.ok(sessionId);
          done();
        });

        it('add issues for a user', function(done) {
          var dest = url.parse(helper.servers.api.host + '/api/users');
          var issues = [
            { name: 'Jelly Beans',
              importance: 50,
              spectrum: 20,
              opinion: 'The greatest candy ever' },
            { name: 'M&Ms',
              importance: 70,
              spectrum: 80,
              opinion: 'The second greatest candy ever' },
            { name: 'Almond Joy',
              importance: 12,
              spectrum: 89,
              opinion: 'Who doesn\'t like coconut?' },
          ];

          var form = {
            issues: encodeURIComponent(JSON.stringify(issues)),
            zipcode: 12345,
            party: 'democrat'
          };

          request.put({ url: dest, form: form, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 200);
            var result = JSON.parse(body);
            assert.ok(result.saved);
            helper.colls.User.findOne({ email: userEmail }, function(err, result) {
              assert.equal(result.issues.length, 3)
              done();
            });
          });
        });

        it('deletes an issue for a user', function(done) {
          var dest = url.parse(helper.servers.api.host + '/api/users/issues/m%26ms');
          request({ method: 'delete', url: dest, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 200);
            var result = JSON.parse(body);
            assert.ok(result.saved);
            helper.colls.User.findOne({ email: userEmail }, function(err, result) {
              assert.ifError(lodash.find(result.issues, function(issue) { return issue.name.match(/m&ms/i) }));
              done();
            });
          });
        });

        it('returns an error if the issue is not found', function(done) {
          var dest = url.parse(helper.servers.api.host + '/api/users/issues/doesntexist');
          request({ method: 'delete', url: dest, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 404);
            done();
          });
        });

        it('updates a name for a user', function(done) {
          var dest = url.parse(helper.servers.api.host + '/api/users');
          var newName = 'Kurt Vonnegut';
          var form = {
            name: newName
          };

          request.put({ url: dest, form: form, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 200);
            var result = JSON.parse(body);
            assert.ok(result.saved);
            helper.colls.User.findOne({ name: newName }, function(err, result) {
              assert.ok(result);
              done();
            });
          });
        });

        it('updates an email for a user', function(done) {
          var dest = url.parse(helper.servers.api.host + '/api/users');
          var newEmail = 'totallydiffemail@test.com';
          var form = {
            email: newEmail
          };

          request.put({ url: dest, form: form, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 200);
            var result = JSON.parse(body);
            assert.ok(result.saved);
            helper.colls.User.findOne({ email: newEmail }, function(err, result) {
              assert.ok(result);
              done();
            });
          });
        });

        it('updates a country for a user', function(done) {
          var dest = url.parse(helper.servers.api.host + '/api/users');
          var country = '4c0a505a-8ea3-11df-b342-462b038dbb02';
          var form = {
            country: country
          };

          request.put({ url: dest, form: form, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 200);
            var result = JSON.parse(body);
            assert.ok(result.saved);
            helper.colls.User.findOne({ country: country }, function(err, result) {
              assert.ok(result);
              done();
            });
          });
        });

        it('returns an error updating with a bad country for a user', function(done) {
          var dest = url.parse(helper.servers.api.host + '/api/users');
          var country = 'NOT VALID';
          var form = {
            country: country
          };

          request.put({ url: dest, form: form, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 400);
            done();
          });
        });

        it('returns an error if sending incomplete params for change password', function(done) {
          var dest = url.parse(helper.servers.api.host + '/api/users/password');

          request.put({ url: dest, form: { password: 'incomplete' }, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 400);
            done();
          });
        });

        it('returns an error if sending bad password for forgot password', function(done) {
          var dest = url.parse(helper.servers.api.host + '/api/users/forgot_password');

          request.post({ url: dest, form: { email: 'invaliduser' }, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 400);
            done();
          });
        });

        it('gets basic info about another user', function(done) {
          var user = helper.data.users.user1;
          var dest = url.parse(helper.servers.api.host + '/api/users/' + user._id);

          request.get({ url: dest, jar: jar }, function(error, response, body) {
            assert.equal(response.statusCode, 200);
            var result = JSON.parse(body);
            assert.equal(user._id, result._id);
            assert.ifError(result.email) // Basic info should not include an email address
            done();
          });
        });

        describe('avatar', function() {
          var jpeg = __dirname + '/images/angrybird.jpg';
          var png = __dirname + '/images/green-pig-king.png';
          var gif = __dirname + '/images/green-pig.gif';
          var dest = url.parse(helper.servers.api.host + '/api/users/avatar');
          var headers = { 'content-type' : 'multipart/form-data' };

          it('uploads a png', function(done) {
            request.post({ url: dest, jar: jar, headers: headers, multipart: [{
              'Content-Disposition' : 'form-data; name="avatar"; filename="' + path.basename(png) + '"',
              'Content-Type' : mime.lookup(png),
              body : fs.readFileSync(png)
            }]}, function(error, resp, body) {
              assert.equal(resp.statusCode, 200);
              var result = JSON.parse(body)
              assert.ok(result.saved);
              done();
            });
          });

          it('uploads a jpeg', function(done) {
            request.post({ url: dest, jar: jar, headers: headers, multipart: [{
              'Content-Disposition' : 'form-data; name="avatar"; filename="' + path.basename(jpeg) + '"',
              'Content-Type' : mime.lookup(jpeg),
              body : fs.readFileSync(jpeg)
            }]}, function(error, resp, body) {
              assert.equal(resp.statusCode, 200);
              var result = JSON.parse(body)
              assert.ok(result.saved);
              done();
            });
          });

          it('fails to upload a gif', function(done) {
            request.post({ url: dest, jar: jar, headers: headers, multipart: [{
              'Content-Disposition' : 'form-data; name="avatar"; filename="' + path.basename(gif) + '"',
              'Content-Type' : mime.lookup(jpeg),
              body : fs.readFileSync(gif)
            }]}, function(error, resp, body) {
              assert.equal(resp.statusCode, 400);
              done();
            });
          });
        }); // avatar
      }); // update
    }); // users
  }); // requires client
}); // api
