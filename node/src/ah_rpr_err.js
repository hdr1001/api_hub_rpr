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

const ahErrMsgs = [
   {shrtDesc: 'Error occurred in API HUB', httpStatus: 500},
   {shrtDesc: 'Error instantiating DataProduct object', httpStatus: 400},
   {shrtDesc: 'Ext API returned an invalid HTTP status', httpStatus: 500},
   {shrtDesc: 'Unable to locate the requested resource', httpStatus: 404}
];

//Factory funtion to create a generic API Hub error
const ahErrFactory = (errIdx, msgInfo, extApiHttpStatus, extApiErrMsg) => {
   let retErr = new Error(ahErrMsgs[errIdx].shrtDesc);

   //Every API hub error odject must include an error number and
   //derived error message
   retErr.api_hub_err = {
      message: ahErrMsgs[errIdx].shrtDesc,
      err_num: errIdx
   };

   //More detailed information about the specific error
   if(msgInfo) retErr.api_hub_err.msg_info = msgInfo;

   //Error information derived from an external API can be
   //included in property ext_api
   if(extApiHttpStatus || extApiErrMsg) {
      retErr.api_hub_err.ext_api = {};

      if(extApiHttpStatus) {
         retErr.api_hub_err.ext_api.http_status = extApiHttpStatus;
      }

      if(extApiErrMsg) {
         retErr.api_hub_err.ext_api.err_msg = JSON.parse(extApiErrMsg);
      }
   }

   return retErr;
};

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
   factory: ahErrFactory,
   getHttpStatusCode: ahErrGetHttpStatusCode
});

