// *********************************************************************
//
// API Hub request, persist & respond foundational objects
// Target RDBMS:          PostgreSQL
// JavaScript code file:  ah_rpr_objs.js
//
// Copyright 2019 Hans de Rooij
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//       http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, 
// software distributed under the License is distributed on an 
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, 
// either express or implied. See the License for the specific 
// language governing permissions and limitations under the 
// License.
//
// *********************************************************************
'use strict';

//Supported APIs
const apis = ['dpl', 'd2o'];

const apiDpl = 0; //D&B Direct+
const apiD2o = 1; //D&B Direct 2.0 Onboard

//This code defines event emitting classes so ...
const EvntEmit = require('events');

//Event in constructor workaround, more visit https://goo.gl/KO547I
const emitConstructorEvnt = (instanceThis, sEvnt) => {
   EvntEmit.call(instanceThis);
   setImmediate(() => {instanceThis.emit(sEvnt)});
};

//Libraries for REST API invocation
const https = require('https');
const qryStr = require('querystring');

//Postgresql initialization
//Setting parseInt8 enables storing and retrieving JS dates as BIGINTs
const pg = require('pg'); pg.defaults.parseInt8 = true;
const pgConnPool = new pg.Pool(require('./creds/pg.json'));

pgConnPool.on('error', function (err, client) {
   // See: https://github.com/brianc/node-postgres
   // if an error is encountered by a client while it sits idle in the pool
   // the pool itself will emit an error event with both the error and
   // the client which emitted the original error
   // this is a rare occurrence but can happen if there is a network partition
   // between your application and the database, the database restarts, etc.
   // and so you might want to handle it and at least log it out
   console.log('Idle client error', err.message);
});

//Prepared statements used by the API Hub objects 
const sqlPrepStmts = {
   insAuthToken: function() {
      let sSQL = 'INSERT INTO auth_tokens ';
      sSQL += '(api, token, expires_in, obtained_at) ';
      sSQL += 'VALUES ($1, $2, $3, $4) ';
      sSQL += 'RETURNING id;';
      //console.log('SQL insAuthToken -> ' + sSQL);

      return {
         name: this._api + 'InsAuthToken',
         text: sSQL,
         values: [this._api, this._token, this._expiresIn, this._obtainedAt]
      };
   },

   getAuthToken: function() {
      let sSQL = 'SELECT id, token, expires_in, obtained_at ';
      sSQL += 'FROM auth_tokens ';
      sSQL += 'WHERE api = $1 ';
      sSQL += 'ORDER BY id DESC LIMIT 1;';
      //console.log('SQL getAuthToken -> ' + sSQL);

      return {
         name: this._api + 'GetAuthToken',
         text: sSQL,
         values: [this._api]
      };
   }
};

//API parameters for HTTP transaction
const apiParams = {
   [apis[apiDpl]]: { //D&B Direct+
      getHttpAttr: function() {
         const ret = {
            host: 'plus.dnb.com',
            path: '/v2/token',
            method: 'POST',
            headers: {
               'Content-Type': 'application/json',
               Origin: 'www.dnb.com',
               Authorization: 'Basic '
            }
         };

         let dpl_credentials = require('./creds/dpl.json');
         let buff = new Buffer(dpl_credentials.usrID + ':' + dpl_credentials.pwd);
         let b64 = buff.toString('Base64');
         ret.headers.Authorization += b64;

         return ret;
      },

      getHttpPostBody: function() {
         return '{ "grant_type" : "client_credentials" }';
      }
   },
   [apis[apiD2o]]: { //D&B Direct 2.0 Onboard
      getHttpAttr: function() {
         const ret = {
            host: 'direct.dnb.com',
            path: '/Authentication/V2.0/',
            method: 'POST',
            headers: {
               'Content-Type': 'application/json'
            }
         };

         let d2o_credentials = require('./creds/d2o.json');
         ret.headers['x-dnb-user'] = d2o_credentials.usrID;
         ret.headers['x-dnb-pwd'] = d2o_credentials.pwd;

         return ret; 
      },

      getHttpPostBody: function() {
         const ret = {
            TransactionDetail: {
               ApplicationTransactionID: 'Node.js object code',
            }
         };

         let rnd = Math.floor(Math.random() * 10000) + 1;
         let dtNow = new Date();

         ret.TransactionDetail.ServiceTransactionID = rnd.toString();
         ret.TransactionDetail.TransactionTimestamp = dtNow.toISOString();

         return ret;
      }
   }
};

//Generic functions
const iniApi = api => {
   api = api || apis[apiDpl];

   if(apis.indexOf(api) === -1) {
      throw new Error('API specified not valid');
   }

   return api;
};

//Get the most recent authorization token from the database,
//return 0 if no token is available
function getAuthTokenDB() {
   return new Promise((resolve, reject) => {
      pgConnPool.connect((err, client, done) => {
         if(err) {
            console.log('Error fetching client from pool');
            reject(err); return;
         }

         client.query(sqlPrepStmts.getAuthToken.call(this), (err, rslt) => {
            done(err);

            if(err) {
               console.log('Error executing get authorization token query');
               reject(err); return;
            }

            if(rslt.rowCount > 0) {
               this._id = rslt.rows[0].id;
               this._token = rslt.rows[0].token;
               this._expiresIn = rslt.rows[0].expires_in;
               this._obtainedAt = rslt.rows[0].obtained_at;
            }

            resolve(rslt.rowCount);
         });
      });
   });
};

//Write an authorization token to the database
function authTokenToDB() {
   return new Promise((resolve, reject) => {
      pgConnPool.connect((err, client, done) => {
         if(err) {
            console.log('Error fetching client from pool');
            reject(err); return;
         }

         client.query(sqlPrepStmts.insAuthToken.call(this), (err, rslt) => {
            done(err);

            if(err) {
               console.log('Error running persist authorization token query');
               reject(err); return;
            }

            resolve(rslt.rows[0].id);
         });
      });
   });
};

//Function returning the result of the REST call as a promise
function getAuthTokenAPI() {
   const httpAttr = apiParams[this._api].getHttpAttr();
   const httpPostBody = apiParams[this._api].getHttpPostBody();

   return new Promise((resolve, reject) => {
      const httpPost = https.request(httpAttr, resp => {
         var body = [];

         resp.on('error', err => reject(err));

         resp.on('data', chunk => body.push(chunk));

         resp.on('end', () => { //Token is now available
            //As a first step register when the response was available
            this._obtainedAt = Date.now();

            // ... then process the raw JSON response as returned by the API
            let jsonAuthToken = body.join('');

            if(resp.statusCode < 200 || resp.statusCode > 299) {
               let errMsg = 'API token request returned an invalid HTTP status code';
               errMsg += ' (' + resp.statusCode + ')';

               reject(new Error(errMsg)); return;
            }

            if(!/^application\/json/.test(resp.headers['content-type'])) {
               let errMsg = 'Invalid content-type, expected application/json';

               reject(new Error(errMsg)); return;
            }

            resolve(jsonAuthToken);
         });
      });

      if(typeof httpPostBody === 'object') {
         httpPost.write(JSON.stringify(httpPostBody));
      }
      else {
         httpPost.write(httpPostBody);
      }
      httpPost.end();
   });
};

//Process the results returned from the call to retrieve a token from the database
function processAuthTokenDB(rowCount) {
   let bRenewToken = false;

   if(rowCount > 0) {
      console.log('Token (' + this._api +  ') retrieved from database = ' + this._token.substring(0, 3) +
         ' ... ' + this._token.substring(this._token.length - 2));

      if(!this._token || this._token.length == 0 || this.renewAdvised) {
         console.log('Token invalid or (nearly) expired, get new token online');
         bRenewToken = true;
      }
      else {
         //No need to renew the authorization token
         console.log('Token validated okay (' + this.expiresInMins + ' minutes remaining)');
         emitConstructorEvnt(this, 'onLoad');
         return bRenewToken; //bRenewToken === false
      }
   }

   //bRenewToken === true, i.e get a new authorization token online
   return getAuthTokenAPI.call(this);
}

//Parse authorization token as delivered by the API
function parseJsonToken(jsonToken) {
   let oToken = JSON.parse(jsonToken);

   switch(this._api) {
      case apis[apiDpl]:
         this._token = oToken.access_token;
         this._expiresIn = oToken.expiresIn;
         break;

      case apis[apiD2o]:
         this._token = oToken.AuthenticationDetail.Token;
         this._expiresIn = 86400; //Specified in the documentation
         break;

         default:
         console.log('Unsupported API parsing JSON token');
      }

   //Update the values of the object's private member variables
   return oToken;
};

//Process the results returned from the API call to retrieve a token online
function processAuthTokenAPI(jsonAuthToken) {
   if(jsonAuthToken) {
      console.log('Successfully retrieved a new ' + this._api + ' authorization token online!');
      parseJsonToken.call(this, jsonAuthToken); //Parse the JSON delivered & set the object properties
      emitConstructorEvnt(this, 'onLoad');

      //As a last step persist the token on the database
      return authTokenToDB.call(this);
   }

   return 0;
}

//Process the new token ID generated by the database insert
function processNewTokenID(tokenID) {
   if(tokenID) {
      this._id = tokenID;
      console.log('Persisted token, with id ' + tokenID);
   }

   return 0;
}

//Error handler of primary constructor logic authorization token class
function errHandlerAuthToken(err) {
   console.log('Error occured in constructor of class AuthToken! Parameter api: ' + this._api);
   console.log(err.message);

   console.log('About to emit onError for object of class AuthToken');
   emitConstructorEvnt(this, 'onError');
}

//Periodic token validity check and, if necessary, renewal
function periodicCheckAuthToken() {
   console.log('API ' + this._api + ' token check at ' + new Date());

   if(this.renewAdvised) {
      console.log('API ' + this._api + ' token about to expire or expired, going online');

      getAuthTokenAPI.call(this)
         .then( jsonAuthToken => processAuthTokenAPI.call(this, jsonAuthToken) )
         .then( tokenID => processNewTokenID.call(this, tokenID) )
         .catch( err => errHandlerAuthToken.call(this, err) );
   }
   else {
      console.log('Authorization token for api ' + this._api + ' verifies okay, ' + 
         this.expiresInMins + ' minutes remaining');
   }
}

//Definition of the authorization token class
class AuthToken extends EvntEmit {
   constructor(api) {
      super(); //Call necessary to resolve the currect execution context (this) in the extended class

      //Private object properties
      this._api = iniApi(api);              //Store the API for which this token is valid
      this._id = null;                      //Unique token sequence number & primary key
      this._token = null;                   //Token for use in the Authorization header
      this._expiresIn = null;               //Number of secs until the token expires (from when it was retrieved)
      this._obtainedAt = null;              //Timestamp -> IDR response available

      //Below the implementation of the primary constructor logic
      getAuthTokenDB.call(this)
         .then( rowCount => processAuthTokenDB.call(this, rowCount) )
         .then( jsonAuthToken => processAuthTokenAPI.call(this, jsonAuthToken) )
         .then( tokenID => processNewTokenID.call(this, tokenID) )
         .catch( err => errHandlerAuthToken.call(this, err) );

         //Check every 30 mins whether the authorization token is up for renewal
         setInterval( () => periodicCheckAuthToken.call(this), 1800000 );
   }

   //Public object interface
   toString() { //Converts the value of an AuthToken object instance to a string
      if(this._token.length === 0) {
         return '';
      }
      else {
         switch(this._api) {
            case apis[apiDpl]:
               return 'Bearer ' + this._token;

            default:
               return this._token;
         }
      }
   }

   get token() { //Return token for use in an HTTP Authorization header
      return this._token;
   }

   get expiresInMins() { //Return the number of minutes until the token expires
      if(this._expiresIn == 0 || this._obtainedAt === undefined) return 0;

      let mins = (this._obtainedAt + (this._expiresIn * 1000) - Date.now()) / 60000;

      return Math.floor(mins);
   }

   get renewAdvised() { //Answer the question; should this authorization token be renewed?
      if(this.expiresInMins < 76) {
         return true;
      }
      else { 
         return false;
      }
   }
}

// Global variables holding the authorization tokens
let dplAuthToken; setTimeout(() => {dplAuthToken = new AuthToken(apis[apiDpl])}, 2500);
let d2oAuthToken; setTimeout(() => {d2oAuthToken = new AuthToken(apis[apiD2o])}, 3000);

