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

//Include shared project code
const ahGlob = require('./ah_rpr_glob.js');
const ahErr = require('./ah_rpr_err.js');

//Supported APIs
const apis = [
   {id: 'dpl', struct: ahGlob.dataStruct[ahGlob.structJSON]}, 
   {id: 'd2o', struct: ahGlob.dataStruct[ahGlob.structJSON]},
   {id: 'dit', struct: ahGlob.dataStruct[ahGlob.structXML]}
];

const apiDpl = 0; //D&B Direct+
const apiD2o = 1; //D&B Direct 2.0 Onboard
const apiDit = 2; //D&B Toolkit

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
   },

   {  prodID: 'CMP_VRF_ID',
      api: apis[apiD2o],
      provider: providers[prvdrDnb],
      key: keys[keyDnb],
      versions: ['V6.0']
   },

   {  prodID: 'CMP_BOS',
      api: apis[apiD2o],
      provider: providers[prvdrDnb],
      key: keys[keyDnb],
      versions: ['V6.0']
   },

   {  prodID: 'gdp_em',
      prodName: 'Enterprise Management',
      api: apis[apiDit],
      provider: providers[prvdrDnb],
      key: keys[keyDnb],
      versions: ['V4']
   }
];

const cmpelk = 0;
const cmptcs = 1;
const cmpvrfid = 2;
const cmpbos = 3;
const gdpem = 4;

//This code defines event emitting classes so ...
const EvntEmit = require('events');

//Event in constructor workaround, more visit https://goo.gl/KO547I
const emitConstructorEvnt = (instanceThis, sEvnt, err) => {
   EvntEmit.call(instanceThis);
   setImmediate(() => {instanceThis.emit(sEvnt, err)});
};

//Libraries for REST API invocation
const https = require('https');
const qryStr = require('querystring');

//Libraries for SOAP APIs
const domParser = require('xmldom').DOMParser;
const domSerializer = require('xmldom').XMLSerializer;

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
         name: this._api.id + 'InsAuthToken',
         text: sSQL,
         values: [this._api.id, this._token, this._expiresIn, this._obtainedAt]
      };
   },

   getAuthToken: function() {
      let sSQL = 'SELECT id, token, expires_in, obtained_at ';
      sSQL += 'FROM auth_tokens ';
      sSQL += 'WHERE api = $1 ';
      sSQL += 'ORDER BY id DESC LIMIT 1;';
      //console.log('SQL getAuthToken -> ' + sSQL);

      return {
         name: this._api.id + 'GetAuthToken',
         text: sSQL,
         values: [this._api.id]
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
         values: [this._sKey, this._rawRsltProduct, this._obtainedAt]
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
   [apis[apiDpl].id]: { //D&B Direct+
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

            if(this._product.prodID === products[cmptcs].prodID) {
               oQryStr.orderReason = 6332;
            }

            ret.path += '/' + this._sKey + '?' + qryStr.stringify(oQryStr);
            ret.headers.Authorization = dplAuthToken.toString();

            return ret;
         }
      }
   },
   [apis[apiD2o].id]: { //D&B Direct 2.0 Onboad
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
               path: '/' + this._versionID + '/organizations/' + this._sKey + '/products/' + this._product.prodID,
               method: 'GET',
               headers: {
                  'Content-Type': 'application/json'
               }
            };

            const oQryStr = {
               OrderReasonCode: '6332'
            };

            if(this._product.prodID === products[cmpbos].prodID) {
               oQryStr.OwnershipPercentage = '25';
            }

            ret.path += '?' + qryStr.stringify(oQryStr);
            ret.headers.Authorization = d2oAuthToken.toString();

            return ret;
         }
      }
   },
   [apis[apiDit].id]: { //D&B Data Integration Toolkit
      dataProduct: {
         getHttpAttr: function() {
            const ret = {
               host: 'toolkit-wsdl.dnb.com',
               path: '/ws/DNB_WebServices.Providers.OrderAndInvestigations.GDP_V4:wsp_GDP_V4',
               method: 'POST',
               headers: {
                  'Content-Type': 'text/xml;charset=UTF-8',
                  SOAPAction: 'DNB_WebServices_Providers_OrderAndInvestigations_GDP_V4_wsp_GDP_V4_Binder_ws_OtherGDPProducts'
               }
            };

            return ret; 
         },

         getHttpPostBody: function() {
            const dit_credentials = require('./creds/dit.json');

            let sTrnUID = '';
            for(let i = 0; i < 12; i++) {
               sTrnUID += Math.floor(Math.random() * 16).toString(16).toUpperCase();
            }

            let ret;
            ret =  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ';
            ret +=    'xmlns:wsp="http://www.dnb.com/DNB_WebServices/Providers/OrderAndInvestigations/GDP_V4/wsp_GDP_V4">';
            ret += '<soapenv:Header/><soapenv:Body><wsp:ws_OtherGDPProducts>';
            ret += '<GDPRequest>';
            ret += '   <UserId>' + dit_credentials.usrID + '</UserId>';
            ret += '   <Password>' + dit_credentials.pwd + '</Password>';
            ret += '   <TRNUID>' + sTrnUID + '</TRNUID>';
            ret += '   <socCode><AppId>NodeJS HdR</AppId><AppVer>0010</AppVer></socCode>';
            ret += '   <Orders>';
            ret += '      <User_Language>EN</User_Language>';
            ret += '      <DnB_DUNS_Number>' + this._sKey + '</DnB_DUNS_Number>';
            ret += '      <Trade_Up_Indicator>Y</Trade_Up_Indicator>';
            ret += '      <Product>' + this._product.prodName + '</Product>';
            ret += '      <Product_Type>D</Product_Type>';
            ret += '      <Reason_Code>1</Reason_Code>';
            ret += '   </Orders>';
            ret += '   <Immediate_Delivery>';
            ret += '      <Mode>DIRECT</Mode>';
            ret += '      <Format>XML</Format>';
            ret += '   </Immediate_Delivery>';
            ret += '</GDPRequest>';
            ret += '</wsp:ws_OtherGDPProducts></soapenv:Body>';
            ret += '</soapenv:Envelope>';
            //console.log(ret);

            return ret;
         }
      }
   }
};

//Check if object reference points to an authorization token
function isAuthToken(obj) {
   return '_token' in obj;
}

//Check if the data product request is HTTP POST or GET
function isHttpPost(apiPrms) {
   return 'getHttpPostBody' in apiPrms;
}

//Private function returning the result of the data product call as a promise
function execHttpReqResp() {
   let httpAttr, httpPostBody = null, prms;

   if(isAuthToken(this)) { //API call for authorization token
      prms = apiParams[this._api.id].authToken;

      httpAttr = prms.getHttpAttr();
      httpPostBody = prms.getHttpPostBody();
   }
   else { //Execute an HTTP data product request
      prms = apiParams[this._product.api.id].dataProduct;

      httpAttr = prms.getHttpAttr.call(this);

      if(isHttpPost(prms)) {
         httpPostBody = prms.getHttpPostBody.call(this);
      }
   }

   return new Promise((resolve, reject) => {
      let httpTransaction = https.request(httpAttr, resp => {
         var body = [];

         resp.on('error', err => reject(err));

         resp.on('data', chunk => body.push(chunk));

         resp.on('end', () => { //The data product is now available in full
            //As a first step register when the response was available
            this._obtainedAt = Date.now();
            this._productDB = false;

            // ... then process the raw JSON response as returned by the API
            let respBody = body.join('');

            if(resp.statusCode < 200 || resp.statusCode > 299) {
               let msgInfo = 'API call returned an HTTP status code outside the 2XX range (code: ' + resp.statusCode + ').';
               console.log(msgInfo);

               let sStruct = ahGlob.dataStruct[ahGlob.structJSON];

               if(this._product && this._product.api.struct === ahGlob.dataStruct[ahGlob.structXML]) {
                  //Please note that in SOAP APIs errors are usually communicated in the HTTP
                  //response body. It is therefore unlikely to end up in this particular branch
                  //of code but it is possible (most likely involving an HTTP status code 500).
                  sStruct = this._product.api.struct;
               }

               reject(new ahErr.ApiHubErr( ahErr.httpStatusExtApi,   //Error type code
                                           sStruct,                  //The structure in which the error should be passed back
                                           msgInfo,                  //Specific information concerning the error
                                           resp.statusCode,          //HTTP status code 
                                           respBody));               //String (JSON or XML) containing external API error
               return;
            }

            resolve(respBody);
         });
      });

      if(httpPostBody) {
         if(typeof httpPostBody === 'object') {
            httpTransaction.write(JSON.stringify(httpPostBody));
         }
         else {
            httpTransaction.write(httpPostBody);
         }
      }

      httpTransaction.end();
   });
}

//Generic functions
//Return an API object based on an ID like 'dpl', 'd2o', etc.
const getAPI = sAPI => { 
   return apis.find(oAPI => oAPI.id === sAPI); 
};

//Return a product object based on an ID like 'cmpelk', 'cmptcs', etc.
const getProduct = sProduct => {
   return products.find(oProd => oProd.prodID === sProduct);
};

//Return data structure of a product
const getDataStruct = sProduct => {
   let sDataStruct = ahGlob.dataStruct[ahGlob.structJSON]; //Default

   let oProduct = getProduct(sProduct);

   if(oProduct) {
      sDataStruct = oProduct.api.struct;
   }

   return sDataStruct;
}

const iniApi = sAPI => { //Return the API object based on the ID provided
   sAPI = sAPI || apis[apiDpl].id; //Default provided

   let oAPI = getAPI(sAPI);

   if(oAPI) {
      return oAPI;
   }
   else { //Throw error
      let msgInfo = 'API specified (' + sAPI + ') is not supported';
      console.log(msgInfo);
 
      throw new ahErr.ApiHubErr( ahErr.instantiateDataProduct,
                                 ahGlob.dataStruct[ahGlob.structJSON],
                                 msgInfo );
   }
};

const iniProd = sProductID => {
   sProductID = sProductID || products[cmpelk].prodID; //Default provided

   let oProduct = getProduct(sProductID);

   if(oProduct) {
      return oProduct;
   }
   else { //Throw error
      let msgInfo = 'Product identifier specified (' + sProductID + ') is not supported';
      console.log(msgInfo);
 
      throw new ahErr.ApiHubErr( ahErr.instantiateDataProduct,
                                 ahGlob.dataStruct[ahGlob.structJSON],
                                 msgInfo );
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

//Process the results returned from the call to retrieve a token from the database
function processAuthTokenDB(rowCount) {
   let bRenewToken = false;

   if(rowCount > 0) {
      console.log('Token (' + this._api.id +  ') retrieved from database = ' + this._token.substring(0, 3) +
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
   return execHttpReqResp.call(this);
}

//Parse authorization token as delivered by the API
function parseJsonToken(jsonToken) {
   let oToken = JSON.parse(jsonToken);

   switch(this._api.id) {
      case apis[apiDpl].id:
         this._token = oToken.access_token;
         this._expiresIn = oToken.expiresIn;
         break;

      case apis[apiD2o].id:
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
      console.log('Successfully retrieved a new ' + this._api.id + ' authorization token online!');
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
   console.log('Error occured in constructor of class AuthToken! Parameter api: ' + this._api.id);
   console.log(err.message);

   console.log('About to emit onError for object of class AuthToken');
   emitConstructorEvnt(this, 'onError');
}

//Periodic token validity check and, if necessary, renewal
function periodicCheckAuthToken() {
   console.log('API ' + this._api.id + ' token check at ' + new Date());

   if(this.renewAdvised) {
      console.log('API ' + this._api.id + ' token about to expire or expired, going online');

      execHttpReqResp.call(this)
         .then( jsonAuthToken => processAuthTokenAPI.call(this, jsonAuthToken) )
         .then( tokenID => processNewTokenID.call(this, tokenID) )
         .catch( err => errHandlerAuthToken.call(this, err) );
   }
   else {
      console.log('Authorization token for api ' + this._api.id + ' verifies okay, ' + 
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
         switch(this._api.id) {
            case apis[apiDpl].id:
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
         //Remove dashes from the DUNS submitted and,
         sKey = sKey.replace(/-/g, '');
         //After the removal of the dashes the DUNS should only contain numeric characters
         let regExp = /^\d+$/;
         if(!regExp.test(sKey)) {
            let msgInfo = 'DUNS submitted (' + sKey + ') contains ';
            msgInfo += 'non-numeric characters and is therefore invalid';
            console.log(msgInfo);

            throw new ahErr.ApiHubErr( ahErr.instantiateDataProduct,
                                       this._product.api.struct,
                                       msgInfo );
         }
         //Prepend 0's in case the DUNS is shorter than 9 characters,
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
   if(sVersionID) {
      if(this._product.versions.indexOf(sVersionID) === -1) {
         let msgInfo = 'Version identifier specified (' + sVersionID + ') is not supported';
         console.log(msgInfo);

         throw new ahErr.ApiHubErr( ahErr.instantiateDataProduct,
                                    this._product.api.struct,
                                    msgInfo );
      }
      else {
         return sVersionID;
      }
   }
   else { //Default value is the most recent version
      return this._product.versions[this._product.versions.length - 1];
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
                     if(this._product.api.struct === ahGlob.dataStruct[ahGlob.structXML]) {
                         this._rawRsltProduct = rslt.rows[0].product;
                     }
                     else {
                        this._oRsltProduct = rslt.rows[0].product;
                     }
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

//Process the raw data product returned by the HTTP response
function processHttpResp(respBody) {
   if(this._product.api.id === apis[apiDit].id) {
      //Parse the HTTP response
      this._oRsltProduct = new domParser().parseFromString(respBody, 'text/xml');

      //Strip the SOAP envelope from the response
      this._oRsltProduct = this._oRsltProduct.getElementsByTagName('DGX')[0];

      //The stripped product will be written to the database
      this._rawRsltProduct = new domSerializer().serializeToString(this._oRsltProduct);

      //The D&B Data Integration Toolkit is a SOAP API and therefore tends to
      //communicate errors in the message body (where REST APIs are more likely
      //to use HTTP status codes out of the 2XX range). This implies that, in
      //order to implement robust error handling, the response must be checked
      //for error codes.
      let iStatus; //Integer value of the main status code reurned

      let statusNodes = this._oRsltProduct.getElementsByTagName('STATUS');
      let statusCodeNode = null;

      for(let i = 0; i < statusNodes.length; i++) {
         iStatus = null;

         statusCodeNode = statusNodes[i].getElementsByTagName('CODE')[0];

         if(statusCodeNode) {
            iStatus = parseInt(statusCodeNode.childNodes[0].nodeValue);
         }

         if(iStatus === null || isNaN(iStatus) || iStatus != 0) {
            let msgInfo = '<![CDATA[D&B Toolkit GDP request returned an error status code';
            msgInfo += ' (code: ' + iStatus + ')]]>';

            throw new ahErr.ApiHubErr( ahErr.httpStatusExtApi,              //Error type code
                                       ahGlob.dataStruct[ahGlob.structXML], //The structure in which the error should be passed back
                                       msgInfo,                             //Specific information concerning the error
                                       null,                                //HTTP status code not available
                                       this._rawRsltProduct);               //String (JSON or XML) containing external API error
         }
      }
   }
   else {
      this._rawRsltProduct = respBody;
   }
}

//Definition of class DataProduct to retrieve API delivered data products
class DataProduct extends EvntEmit {
   constructor(sKey, prodID, forceNew, versionID) {
      super(); //Call necessary to resolve the currect execution context (this) in the extended class

      //Initialization of the private object properties. Please note that the
      //functions used to initialize object instance properties can, under
      //specific conditions, throw errors. It's therefore advised to implement
      //a try-catch block when instantiating a DataProduct.
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
            let sMsg = 'Retrieved ' + rowCount + ' row(s) '; 
            sMsg += 'for product ' + this._product.prodID + ' with ';
            sMsg += 'key ' + this._sKey;
            console.log(sMsg);

            //Please note that the row count can be zero becase (1) the forceNew
            //parameter was set to true or (2) the database does not contain the
            //sKey requested. Either way, in case the row count returned is zero
            //a new data product will be requested online.
            if(rowCount == 0) {
               return execHttpReqResp.call(this);
            }
            //The data product was loaded from the datatabse in function
            //getDataProductDb. Additional work is needed here but the on
            //load event can be fired if the row count != zero (i.e. 1)
            else {
               emitConstructorEvnt(this, 'onLoad');
            }

            return false; //Data product loaded was from the database
         })
         .then(httpRespBody => {
            //There is no need to store the product if it was retrieved from the
            //database. The parameter rawProduct will evaluate to null if this is
            //so and the body of the if clause below will not execute. For a data
            //product loaded from cache the onLoad event has already fired at
            //this point. In case, however, a new data product was retrieved
            //(successfully) online, the parameter rawProduct evaluates to true
            //and the body of the if clause will be processed. First the onLoad
            //is emitted, then the new product is stored on the database. When
            //storing new products old products are automatically archived.
            if(httpRespBody) {
               processHttpResp.call(this, httpRespBody);

               console.log('About to emit onLoad for API ' + this._product.api.id + ', key ' + this._sKey + ' (obtained online)');
               emitConstructorEvnt(this, 'onLoad');

               DataProductToDB.call(this);
            }
         })
         .catch(err => {
            console.log('Error occured in constructor of class DataProduct!');
            //console.log(this._rawRsltProduct);

            console.log('About to emit onError for object of class DataProduct');
            emitConstructorEvnt(this, 'onError', err);
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
      return this._product.prodID;
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
         if(this._product.api.struct === ahGlob.dataStruct[ahGlob.structXML]) {
            return this._rawRsltProduct = new domSerializer().serializeToString(this._oRsltProduct)
         }
         else { //JSON
            return this.rawRsltProduct = JSON.stringify(this._oRsltProduct);
         }
      }

      throw new Error('Raw data product results not (yet) available');
   }

   get rsltObj() {  //Return the data product as a JavaScript object
      if(this._oRsltProduct) return this._oRsltProduct;

      if(this._rawRsltProduct) {
         if(this._product.api.struct === ahGlob.dataStruct[ahGlob.structXML]) {
            return this._oRsltProduct = new domParser().parseFromString(this._rawRsltProduct, 'text/xml');
         }
         else {
            return this._oRsltProduct = JSON.parse(this._rawRsltProduct);
         }
      }

      throw new Error('Data product results not (yet) available');
   }
}

// Global variables holding the authorization tokens
let dplAuthToken, d2oAuthToken;
setTimeout(() => {dplAuthToken = new AuthToken(apis[apiDpl].id)}, 2500);
//setTimeout(() => {d2oAuthToken = new AuthToken(apis[apiD2o])}, 3000);

module.exports = Object.freeze({
   //Object instantiantion exported as a function
   getDataProduct: (key, product, forceNew, versionID) => {
      return new DataProduct(key, product, forceNew, versionID);
   },

   getDataStructure: getDataStruct
});

