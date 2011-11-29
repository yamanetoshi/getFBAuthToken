var connect = require('express');
var auth = require('connect-auth');
var url = require('url');
var fs = require('fs');
var https = require('https');

var routes = require('./routes');

var OAuth= require('oauth').OAuth;

var app = module.exports = connect.createServer();
var access_token = '';

// N.B. TO USE Any of the OAuth or RPX strategies you will need to provide
// a copy of the example_keys_file (named keys_file) 
try {
  var example_keys= require('./keys_file');
  for(var key in example_keys) {
    global[key]= example_keys[key];
  }
}
catch(e) {
  console.log('Unable to locate the keys_file.js file.' + 
	      ' Please copy and ammend the example_keys_file.js' +
	      ' as appropriate');
  return;
}

// Setup the 'template' pages (don't use sync calls generally, but meh.)
var authenticatedContent = fs.readFileSync( __dirname + 
					    "/public/authenticated.html", 
					    "utf8" );
var unAuthenticatedContent = fs.readFileSync( __dirname + 
					      "/public/unauthenticated.html", 
					      "utf8" );

// There appear to be Scurrilous ;) rumours abounding that connect-auth
// doesn't 'work with connect' as it does not act like an 'onion skin'
// to address this I'm showing how one might extend the *PRIMITIVES* 
// provided by connect-auth to simplify a middleware layer. 

// This middleware detects login requests 
// (in this case requests with a query param of ?login_with=xxx 
// where xxx is a known strategy)
var example_auth_middleware= function() {
  return function(req, res, next) {
    var urlp= url.parse(req.url, true);
    if( urlp.query.login_with ) {
      req.authenticate([urlp.query.login_with], function(error, authenticated) {
        if( error ) {
          // Something has gone awry, behave as you wish.
          console.log( error );
          res.end();
      }
      else {
          if( authenticated === undefined ) {
            // The authentication strategy requires 
	    // some more browser interaction, suggest you do nothing here!
          }
          else {
            // We've either failed to authenticate, or succeeded 
            // (req.isAuthenticated() will confirm, 
            // as will the value of the received argument)
            next();
          }
      }});
    }
    else {
      next();
    }
  };
};

app.configure(function() {
		  app.set('views', __dirname + '/views');
		  app.set('view engine', 'jade');

		  app.use(connect.static(__dirname + '/public'));
		  app.use(connect.cookieParser());
		  app.use(connect.session({secret: 'FlurbleGurgleBurgle', 
					   store: new connect.session.MemoryStore({ reapInterval: -1 }) }));
		  app.use(connect.bodyParser()); /* Only required for the janrain strategy*/
		  app.use(connect.compiler({enable: ["sass"]}));
		  app.use(auth([auth.Facebook({ appId : fbId, 
						appSecret: fbSecret, 
						callback: fbCallbackAddress, 
						scope: 'email, ' + 
						'read_stream, ' + 
						'read_requests, ' + 
						'offline_access, ' + 
						'publish_stream',
						failedUri: '/noauth'
					      })
			       ]));

		  app.use(example_auth_middleware());
		  app.use(app.router);
	      });

process.on('uncaughtException', function (err) {
  console.log('Caught exception: ' + err.stack);
});
  
app.get ('/logout', function(req, res, params) {
		req.logout(); 
	     // Using the 'event' model to do a redirect on logout.
	});

var auth_ed = false;

app.get(/.*/, function(req, res, next) {
		if( req.isAuthenticated() ) {
			console.log("DEBUG authenticated");
			auth_ed = false;
			next();
		}
		else {
			console.log("DEBUG --authentication");
			if (auth_ed) {
				next();
			} else {
				auth_ed = true;
				res.writeHead(200, 
					      {'Content-Type': 'text/html'});
				res.end( unAuthenticatedContent.replace(
					     "#PAGE#", 
					     req.url) );
			}
		}
	});

app.get('/', routes.index);

var request;
var options = {	host: 'graph.facebook.com',
		port: 443,
		path: '',
		method: 'GET'
};

app.get('/authenticate', function(req, res, next) {
		console.log(req.query.code);

		options.path = "/oauth/" + 
		"access_token?client_id=" + fbId + 
		"&redirect_uri=" + fbCallbackAddress + 
		"&client_secret=" + fbSecret + 
		"&code=" + req.query.code +
		"&scope=email,read_stream";

		console.log("options.path is " + options.path);
		
		request = https.request(options);

		request.on('response', function(response) {
			       response.setEncoding('utf8');
			       response.on('data', 
					   function(chunk) {
					       var parsed_chunk = url.parse('/?' + chunk, true);
					       access_token = parsed_chunk.query.access_token;
					       console.log('acess_token is ' + parsed_chunk.query.access_token);
					   });
				response.on('end', function() {
						res.redirect('/');
					    });
			   });

		request.on('error', function(e) {
			       console.log('error: ', e.message);
			   });

		request.end();
	});

var port = process.env.PORT || 3000;
app.listen(port);

console.log("Express server listening on port %d in %s mode", 
	    app.address().port, 
	    app.settings.env);
