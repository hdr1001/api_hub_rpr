// *********************************************************************
//
// API Hub request, persist & respond error handling code
// JavaScript code file: ah_rpr_err.js
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

//Libraries for SOAP APIs
const domParser = require('xmldom').DOMParser;
const domSerializer = require('xmldom').XMLSerializer;

//API Hub errors
const ahErrMsgs = [
   {shrtDesc: 'Error occurred in API HUB', httpStatus: 500},
   {shrtDesc: 'Error instantiating DataProduct object', httpStatus: 400},
   {shrtDesc: 'Ext API returned an invalid HTTP status', httpStatus: 500},
   {shrtDesc: 'Unable to locate the requested resource', httpStatus: 404}
];

//API hub error constructor function
function ApiHubErr(errIdx, struct, msgInfo, extApiHttpStatus, extApiErrMsg) {
   //Every API hub error odject must include an error number and
   //derived error message
   this.api_hub_err = {
      message: ahErrMsgs[errIdx].shrtDesc,
      err_num: errIdx,
      err_struct: struct
   };

   //More detailed information about the specific error
   if(msgInfo) this.api_hub_err.msg_info = msgInfo;

   //Error information derived from an external API can be
   //included in property ext_api
   if(extApiHttpStatus || extApiErrMsg) {
      this.api_hub_err.ext_api = {};

      if(extApiHttpStatus) {
         this.api_hub_err.ext_api.http_status = extApiHttpStatus;
      }

      if(extApiErrMsg) {
         if(this.api_hub_err.err_struct === ahGlob.dataStruct[ahGlob.structXML]) {
            //External API error is unparsed XML
            let oXML = null;

            try {
               oXML = new domParser().parseFromString(extApiErrMsg, 'text/xml');
            }
            catch(err) {
               console.log(err);
            }

            this.api_hub_err.ext_api.err_msg = oXML;
         }
         else { //External API error is unparsed JSON or string
            try {
               this.api_hub_err.ext_api.err_msg = JSON.parse(extApiErrMsg);
            }
            catch(err) {
               this.api_hub_err.ext_api.err_msg = extApiErrMsg;
            }
         }
      }
   }
}

ApiHubErr.prototype.toString = function() {
   if(this.api_hub_err && this.api_hub_err.err_struct && 
         this.api_hub_err.err_struct === ahGlob.dataStruct[ahGlob.structXML]) {

      let sXML = '<api_hub_err>';
      sXML += '<message>' + this.api_hub_err.message + '</message>';
      sXML += '<err_num>' + this.api_hub_err.err_num + '</err_num>';
      sXML += '<err_struct>' + this.api_hub_err.err_struct + '</err_struct>';

      if(this.api_hub_err.msg_info) sXML += '<msg_info>' + this.api_hub_err.msg_info + '</msg_info>';

      if(this.api_hub_err.ext_api) {
         sXML += '<ext_api>';

         if(this.api_hub_err.ext_api.http_status) {
            sXML += '<http_status>' + this.api_hub_err.ext_api.http_status + '</http_status>';
         }

         if(this.api_hub_err.ext_api.err_msg) {
            let sMsg = new domSerializer().serializeToString(this.api_hub_err.ext_api.err_msg);

            sXML += '<err_msg>' + sMsg + '</err_msg>';
         }

         sXML += '</ext_api>';
      }

      if(this.api_hub_err.ws_path) sXML += '<ws_path>' + this.api_hub_err.ws_path + '</ws_path>';

      sXML += '</api_hub_err>';

      return sXML;
   }

   return JSON.stringify(this, null, 3);
}

//Get the HTTP status error code from an API hub error object
const ahErrGetHttpStatusCode = err => {
   //If available an external API status code takes precedence
   try {
      if(err.api_hub_err.ext_api.http_status) {
         return err.api_hub_err.ext_api.http_status;
      }
   }
   catch(c_err) {
      //console.log('No external API HTTP status code available');
   }

   //If no external HTTP status code is available, get the code
   //from the ahErrMsgs array
   try {
      if(ahErrMsgs[err.api_hub_err.err_num].httpStatus) {
         return ahErrMsgs[err.api_hub_err.err_num].httpStatus;
      }
   }
   catch(c_err) {
      //console.log('Unable to get API HTTP status code from array ahErrMsgs');
   }

   //Just return the default error code
   return module.exports.httpStatusDfltErr; //500, internal server error
};

module.exports = Object.freeze({
   //HTTP status codes
   httpStatusOK: 200,
   httpStatusDfltErr: 500,

   //Error type codes
   genericErr: 0,
   instantiateDataProduct: 1,
   httpStatusExtApi: 2,
   unableToLocate: 3,

   //Error handling functions for use in applications
   ApiHubErr,
   getHttpStatusCode: ahErrGetHttpStatusCode
});

