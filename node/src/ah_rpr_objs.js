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

//Provider hosting the API
const providers = ['dnb'];

const prvdrDnb = 0; //D&B (Dun & Bradstreet)

//Identifying keys
const keys = ['duns'];

const keyDnb = 0; //D&B (i.e. DUNS)

//Supported products
const products = [
   {  prodID: 'cmpelk',
      api: apis[apiDpl],
      provider: providers[prvdrDnb],
      key: keys[keyDnb],
      versions: ['v1', 'v2']
   },

   {  prodID: 'cmptcs',
      api: apis[apiDpl],
      provider: providers[prvdrDnb],
      key: keys[keyDnb],
      versions: ['v1']
   }
]

const cmpelk = 0;
const cmptcs = 1;

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
   },

   insDataProduct: function() {
      let sSQL = 'INSERT INTO products_' + this._product.provider + ' ';
      sSQL += '(' + this._product.key + ', ' + this._product.prodID + ', ' + this._product.prodID + '_obtained_at) ';
      sSQL += 'VALUES ($1, $2, $3) ';
      sSQL += 'ON CONFLICT (duns) DO UPDATE SET ';
      sSQL += this._product.prodID + ' = $2, ';
      sSQL += this._product.prodID + '_obtained_at = $3';;
      //console.log('SQL insDataProduct -> ' + sSQL);

      return {
         name: 'ins_' + this._product.prodID,
         text: sSQL,
         values: [this._sKey, this._rawRsltProduct.replace(/'/g, "''"), this._obtainedAt]
      };
   },
              
   getDataProduct: function() {
      let sSQL = 'SELECT ' + this._product.key + ', ' + this._product.prodID + ' AS product, ';
      sSQL += this._product.prodID + '_obtained_at AS poa FROM products_' + this._product.provider + ' ';
      sSQL += 'WHERE ' + this._product.key + ' = $1;';
      //console.log('SQL getDataProduct -> ' + sSQL);

      return {
         name: 'get_' + this._product.prodID,
         text: sSQL,
         values: [this._sKey]
      };
   }
};

//API parameters for HTTP transaction
const apiParams = {
   [apis[apiDpl]]: { //D&B Direct+
      authToken: {
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
      dataProduct: {
         getHttpAttr: function() {
            const ret = {
               host: 'plus.dnb.com',
               path: '/v1/data/duns',
               method: 'GET',
               headers: {
                  'Content-Type': 'application/json',
                  Origin: 'www.dnb.com'
               }
            }

            const oQryStr = {
               productId: this._product.prodID,
               versionId: this._versionID
            };

            ret.path += '/' + this._sKey + '?' + qryStr.stringify(oQryStr);
            ret.headers.Authorization = dplAuthToken.toString();

            return ret;
         }
      }
   },
   [apis[apiD2o]]: { //D&B Direct 2.0 Onboad
      authToken: {
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
      },
      dataProduct: {
         getHttpAttr: function() {
            const ret = {
               host: 'direct.dnb.com',
               path: '/' + this._versionID + '/organizations/' + this._sKey + '/products/' + this._prodID,
               method: 'GET',
               headers: {
                  'Content-Type': 'application/json'
               }
            };

            const oQryStr = {
               OrderReasonCode: '6332'
            };

            if(this._prodID === cmp_bos.prodID) {
               oQryStr.OwnershipPercentage = '25';
            }

            ret.path += '?' + qryStr.stringify(oQryStr);
            ret.headers.Authorization = d2oAuthToken.toString();

            return ret;
         }
      }
   }
};

//Generic functions
const iniApi = api => {
   api = api || apis[apiDpl];

   if(apis.indexOf(api) === -1) {
      throw new Error('API specified is not valid');
   }

   return api;
};

const iniProd = prodID => {
   prodID = prodID || products[cmpelk].prodID;

   try {
      return products.find(oProd => oProd.prodID === prodID);
   }
   catch(err) {
      console.log('Product ID ' + prodID + ' is not valid');
      throw err;
   }
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
}

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
}

//Function returning the result of the REST call as a promise
function getAuthTokenAPI() {
   const httpAttr = apiParams[this._api].authToken.getHttpAttr();
   const httpPostBody = apiParams[this._api].authToken.getHttpPostBody();

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
}

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
}

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

//Validate the key associated with the data product
function iniKey(sKey) {
   switch(this._product.key) {
      case keys[keyDnb]: // i.e. DUNS
         //Remove dashes from sKey submitted and, if shorter than 9 characters, prepend 0's
         sKey = sKey.replace(/-/g, '');
         if(sKey.length < 9) {
            return '000000000'.substring(0, 9 - sKey.length).concat(sKey);
         }
         else {
            return sKey;
         }
      default:
         return sKey;
   }
}

function iniForceNew(bForceNew) {
   //forceNew is false except if query string contains forceNew=true
   if(typeof bForceNew === 'boolean') {
      return bForceNew;
   }
   else { //String comparison
      return (bForceNew === 'true');
   }
}

function iniVersionID(sVersionID) {
   //Default product version
   switch(this._product.prodID) {
      case products[cmpelk].prodID:
      case products[cmptcs].prodID:
         if(sVersionID) {
            if(this._product.versions.indexOf(sVersionID) === -1) {
               throw new Error('Product version specified is not valid');
            }
            else {
               return sVersionID;
            }
         }
         else { //Default value is the most recent version
            return this._product.versions[this._product.versions.length - 1];
         }
      default:
         return sVersionID;
   }
}

//Get a data product from the database, resolve to 0 if not available
function getDataProductDB() {
   return new Promise((resolve, reject) => {
      let ret_val = 0;

      if(this._forceNew) {
         resolve(ret_val); //Force new, no need to check the database
      }
      else {
         pgConnPool.connect((err, client, done) => {
            if(err) {
               console.log('Error fetching client from pool');
               reject(err); return;
            }

            client.query(sqlPrepStmts.getDataProduct.call(this), (err, rslt) => {
               done(err);

               if(err) {
                  console.log('Error executing get product from database query');
                  reject(err); return;
               }

               if(rslt.rowCount > 0) {
                  if(rslt.rows[0].product) {
                     this._oRsltProduct = rslt.rows[0].product;
                     this._obtainedAt = rslt.rows[0].poa;
                     this._productDB = true;

                     ret_val = rslt.rowCount;
                  }
               }

               resolve(ret_val);
            });
         });
      }
   });
}

//Write the data product to the database
function DataProductToDB() {
   return new Promise((resolve, reject) => {
      pgConnPool.connect((err, client, done) => {
         if(err) {
            console.log('Error fetching client from pool');
            reject(err); return;
         }

         client.query(sqlPrepStmts.insDataProduct.call(this), (err, rslt) => {
            done(err);

            if(err) {
               console.log('Error executing persist data product query');
               reject(err); return;
            }

            resolve(0);
         });
      });
   });
}

//Private function returning the result of the data product call as a promise
function getDataProductAPI() {
   let httpAttr = apiParams[this._product.api].dataProduct.getHttpAttr.call(this);

   return new Promise((resolve, reject) => {
      https.request(httpAttr, resp => {
         var body = [];

         resp.on('error', err => reject(err));

         resp.on('data', chunk => body.push(chunk));

         resp.on('end', () => { //The data product is now available in full
            //As a first step register when the response was available
            this._obtainedAt = Date.now();
            this._productDB = false;

            // ... then process the raw JSON response as returned by the API
            this._rawRsltProduct = body.join('');

            if(resp.statusCode < 200 || resp.statusCode > 299) {
               let errMsg = 'API request returned an invalid HTTP status code';
               errMsg += ' (' + resp.statusCode + ')';

               reject(new Error(errMsg)); return;
            }

            if(!/^application\/json/.test(resp.headers['content-type'])) {
               let errMsg = 'Invalid content-type, expected application/json';

               reject(new Error(errMsg)); return;
            }

            resolve(true);
         });
      }).end();
   });
}

//Definition of class DataProduct to retrieve API delivered data products
class DataProduct extends EvntEmit {
   constructor(sKey, prodID, forceNew, versionID) {
      super(); //Call necessary to resolve the currect execution context (this) in the extended class

      //Private object properties
      this._product = iniProd(prodID);                      //Product object has prodID, provider, api & key properties
      this._sKey = iniKey.call(this, sKey);                 //The key with which the data product is associated
      this._forceNew = iniForceNew(forceNew);               //If true the product will retrieved online not from the database
      this._versionID = iniVersionID.call(this, versionID); //The data product version
      this._productDB = null;                               //Boolean indicating whether the data product was retrieved from the database
      this._obtainedAt = null;                              //Timestamp -> data product available
      this._rawRsltProduct = null;                          //The JSON as returned by the API
      this._oRsltProduct = null;                            //Object representation of the data product

      //This is where the rubber meets the road. Default behaviour of the API
      //is to first check the database for availability of the requested key.
      //If the forceNew parameter is set to true the function getDataProductDB
      //immediately resolves to a row count of zero to, in this way, trigger
      //an online product request. If forceNew is not true (which is default)
      //the function getDataProductDB resolves to either 0 or 1, i.e. no
      //product available or product available on the database.
      getDataProductDB.call(this)
         .then(rowCount => {
            console.log('Retrieved ' + rowCount + ' row(s) for sKey ' + this._sKey);

            //Please note that the row count can be zero becase (1) the forceNew
            //parameter was set to true or (2) the database does not contain the
            //sKey requested. Either way, in case the row count returned is zero
            //a new data product will be requested online.
            if(rowCount == 0) {
               return getDataProductAPI.call(this);
            }
            //The data product was loaded from the datatabse in function
            //getDataProductDb. Additional work is needed here but the on
            //load event can be fired if the row count != zero (i.e. 1)
            else {
               emitConstructorEvnt(this, 'onLoad');
            }

            return false; //Data product loaded was from the database
         })
         .then(productAPI => {
            //There is no need to store the product if it was retrieved from the
            //database. The parameter rawProduct will evaluate to null if this is
            //so and the body of the if clause below will not execute. For a data
            //product loaded from cache the onLoad event has already fired at
            //this point. In case, however, a new data product was retrieved
            //(successfully) online, the parameter rawProduct evaluates to true
            //and the body of the if clause will be processed. First the onLoad
            //is emitted, then the new product is stored on the database. When
            //storing new products old products are automatically archived.
            if(productAPI) {
               console.log('About to emit onLoad for ' + this._sKey + ' (obtained online)');
               emitConstructorEvnt(this, 'onLoad');

               DataProductToDB.call(this);
            }
         })
         .catch(err => {
            const oErr = {err_msg: err.message};

            if(this._rawRsltProduct) {
               oErr.err_api = JSON.parse(this._rawRsltProduct);
            }

            this._rawRsltProduct = JSON.stringify(oErr, null, 3);

            console.log('Error occured in constructor DataProduct!');
            console.log(this._rawRsltProduct);

            console.log('About to emit onError for object of class DataProduct');
            emitConstructorEvnt(this, 'onError');
         });
   }

   //Public object interface
   get sKey() { //The sKey with which the data product is associated
      return this._sKey;
   }

   get forceNew() { //If true the product will be retrieved online not from the database
      return this._forceNew;
   }

   get prodID() { //The data product
      return this._prodID;
   }

   get versionID() { //Version of the D&B data product
      return this._versionID;
   }

   get fromDB() { //Was the data product retrieved from the database?
      return this._productDB;
   }

   get obtainedAt() { //Timestamp -> data product available
      return this._obtainedAt;
   }

   get rsltJSON() { //JSON as returned by the API
      if(this._rawRsltProduct) return this._rawRsltProduct;

      if(this._oRsltProduct) {
         return this.rawRsltProduct = JSON.stringify(this._oRsltProduct);
      }

      throw new Error('Raw data product results not (yet) available');
   }

   get rsltObj() {  //Return the data product as a JavaScript object
      if(this._oRsltProduct) return this._oRsltProduct;

      if(this._rawRsltProduct) {
         return this._oRsltProduct = JSON.parse(this._rawRsltProduct);
      }

      throw new Error('Data product results not (yet) available');
   }
}

// Global variables holding the authorization tokens
let dplAuthToken; setTimeout(() => {dplAuthToken = new AuthToken(apis[apiDpl])}, 2500);
let d2oAuthToken; setTimeout(() => {d2oAuthToken = new AuthToken(apis[apiD2o])}, 3000);

module.exports = {
   getCmpelk: (DUNS, forceNew, versionID) => {
      return new DataProduct(DUNS, products[cmpelk].prodID, forceNew, versionID);
   },

   getCmptcs: (DUNS, forceNew, versionID) => {
      return new DataProduct(DUNS, products[cmptcs].prodID, forceNew, versionID);
   }
}

