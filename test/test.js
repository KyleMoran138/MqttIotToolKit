var request = require('supertest');
var app = require('../index.js');

describe('GET /', function() {
  it('Root loads', function(done) {
    request(app)
      .get('/')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);
        done();
      });
  });
});