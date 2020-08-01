var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
const MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var Agenda = require('agenda');
var dotenv = require('dotenv');
var path = require('path');
const result = dotenv.config();
//Secret keys make sure not to publsih
var client_id = process.env.REACT_APP_CLIENT_KEY; // Your client id
var client_secret = process.env.REACT_APP_API_KEY; // Your secret
var redirect_uri = 'https://spotifytrackr.herokuapp.com/callback'; // Your redirect uri
var uri =  process.env.REACT_APP_DB_KEY;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
var userAccess ='';
var userRefresh = '';
var userName = '';
const dbName  = "trackr";
var songName = '';





function getCurrentTrack(){
  var jsonData;
  var options2 = {
    url: 'https://api.spotify.com/v1/me/player/currently-playing',
    headers: { 'Authorization': 'Bearer ' + userAccess },
    json:true
  };
   request.get(options2, function(error, response, body) {
    try{
      var newSongName = body.item.name;
      songName = newSongName;
    }
    catch(err){
      console.log('No song is found to be playing');
    }
  });

}

var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();



//Still really confused about this line 
//app.use(express.static)
app.use(cors()).use(cookieParser());

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  //Creates a cookie, a key:value pair
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-playback-state user-read-currently-playing';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
  console.log('in login');
});
//Handle GET Requests at http://localhost:8888/callback?code=NApCCg..Dl4JF&state=
//If user accetps authorization



//Side Note:
//app.get listens get requests
//requests.get sends get requests

app.get('/history', function(req,res){
  client.connect(err=> {
  const db = client.db('trackr');
  db.collection(userName).find({}, {"songName" : 1, "_id" : 0}).toArray(function (err, docs) {
        client.close();
        if (err) {
            console.log('Error');
            console.log(err);
            res.end();
        }
        else {
            console.log('Success');
            console.log(docs);
            res.json(docs);
        }
    });

  });
});
app.get('/callback', function(req, res) { 

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        userRefresh= body.refresh_token;
        userAccess = body.access_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          userName = body.id;
        });

        // we can also pass the token to the browser to make requests from there
        //There is no need to pass the token
        //Set cookie to indicate user has logged in successfully.
        res.cookie('loggedIn', 'true');

        res.redirect('http://spotifytrackr.s3-website-us-west-1.amazonaws.com/#!/history');
      } else {
        res.cookie('loggedIn', 'false');
        res.redirect('http://spotifytrackr.s3-website-us-west-1.amazonaws.com/' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
    client.connect(err => {
  assert.equal(null, err);
  console.log("Connected to MongoDb");
  const db = client.db(dbName);
  db.createCollection(userName, {
        strict: true
    }, function(err, collection) {
       if(err) {
        //collection exists and do nothing
       }
       else{
        collection.createIndex( { "songName": 1 }, { unique: true })
       }
    });
  const agenda = new Agenda({mongo: db});
  agenda.define('get current track',function(job, done) {
    getCurrentTrack();
    db.collection(userName).insertOne({"songName":songName}, function(err,r) {
    });
      done();
    //make sure to send this track back to the front end, when the front end makes periodic calls to server
  });
  agenda.on('ready', function() {
  agenda.every('30 seconds', 'get current track');
  agenda.start();
  });
});
});
app.get('/logout', function(req,res){
  res.cookie('loggedIn','false');
  res.redirect('http://spotifytrackr.s3-website-us-west-1.amazonaws.com/');
  console.log("Logged out of TrackR");
  client.close();
});
//I would use this function before making any new calls.
app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

function refreshAccess(){
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: userRefresh
    },
    json: true
  };
  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
          userAccess = body.access_token;
    }
    else{
      console.log("Refresh Token has expired or is invalid");
    }
  });

}

const port = process.env.PORT || 8888;
console.log("Listening on port: " + port);
app.listen(port);
