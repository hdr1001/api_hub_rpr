// *********************************************************************
//
// API Hub JavaScript test code
// JavaScript code file: ah_test_code.js
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

const dataStruct  = ['XML', 'JSON'];

const structXML   = 0; //XML data
const structJSON  = 1; //JSON data

const fs          = require('fs');
const https       = require('https');
const qryStr      = require('querystring');
const Bottleneck  = require('bottleneck/es5');
const domParser   = require('xmldom').DOMParser;

const ahHost      = 'url.com';
const ahPath      = '/apihub';
const sshClntKey  = 'ssh_clnt.key';
const sshClntCert = 'ssh_clnt.crt';

const ahHttpAttr = {
    host: ahHost,
    path: ahPath,
    method: 'GET',
    rejectUnauthorized: true,
    key: fs.readFileSync(sshClntKey),
    cert: fs.readFileSync(sshClntCert)
};

//Read & parse the example DUNS from the file
const arrDUNS = fs.readFileSync('DUNS.txt').toString().split('\n');
console.log('Test file contains ' + arrDUNS.length + ' records');

const arrProd = [
   {id: 'cmpelk', ms: 500, percDUNS: 100, percForce: 0},
   {id: 'cmptcs', ms: 500, percDUNS: 0, percForce: 0},
   {id: 'cmpcvf', ms: 1000, percDUNS: 100, percForce: 0},
   {id: 'cmpbos', ms: 1000, percDUNS: 100, percForce: 0},
   {id: 'gdp_em', ms: 10000, percDUNS: 0, percForce: 0},
   {id: 'CMP_VRF_ID', ms: 5000, percDUNS: 100, percForce: 0},
   {id: 'CMP_BOS', ms: 5000, percDUNS: 100, percForce: 0}
];

const arrLmtrs = [];

function isContentJSON(respHdrs) {
   try {
      return respHdrs.content.match(/JSON/i);
   }
   catch(err) {
      return false;
   }
}

function isContentXML(respHdrs) {
   try {
      return respHdrs.content.match(/XML/i);
   }
   catch(err) {
      return false;
   }
}

function getAhDataProduct(sPath, forceNew) {
   //Set the product request HTTP attributes
   let httpAttr = Object.assign({}, ahHttpAttr);
   httpAttr.path += sPath;

   if(forceNew) {
      let oQryStr = {
         forceNew: true
      };

      httpAttr.path += '?' + qryStr.stringify(oQryStr);
   }

   return new Promise((resolve, reject) => {
      https.request(httpAttr, resp => {
         let body = [];

         resp.on('error', err => reject(err));

         resp.on('data', chunk => body.push(chunk));

         resp.on('end', () => { //The data product is now available in full
            let oResp = {
               sBody: body.join(''),
               httpStatus: resp.statusCode,
               hdrs: {
                  content: resp.headers['content-type']
               }
            };

            if(resp.statusCode < 200 || resp.statusCode > 299) {
               reject(oResp); return;
            }

            oResp.hdrs.prodDB = resp.headers['x-api-hub-prod-db'];

            resolve(oResp);
         }); //resp.on('end'

      }).end(); //https.request
   }); //new Promise
} //function

arrProd.forEach(oProd => {
   //Create a set of test DUNS for a product
   let prodDUNS = []; //Default value if 0 or smaller

   if(oProd.percDUNS > 0 && oProd.percDUNS < 100) {
      arrDUNS.forEach(aDUNS => {
         if(Math.random() < oProd.percDUNS / 100) { prodDUNS.push(aDUNS) }
      });
   }
   else if(oProd.percDUNS >= 100) {
      prodDUNS = arrDUNS.slice();
   }
   console.log('Test array for product ' + oProd.id + ' contains ' + prodDUNS.length + ' elements');

   //Randomize the DUNS sequence
   prodDUNS = arrShuffle(prodDUNS);

   //Initialize a limiter for the product
   if(prodDUNS.length > 0) { arrLmtrs.push(new Bottleneck( { minTime: oProd.ms } )) };

   //Schedule product's test DUNS
   prodDUNS.forEach(aDUNS => {
      let ahPath = '/' + oProd.id + '/' + aDUNS; // console.log(ahPath);
      let bForceNew = Math.random() < oProd.percForce / 100; // console.log(bForceNew);

      arrLmtrs[arrLmtrs.length - 1].schedule(() => {

         getAhDataProduct(ahPath, bForceNew)

         .then( httpResp => {

            let oDataProd = null;

            if(isContentJSON(httpResp.hdrs)) {
               oDataProd = JSON.parse(httpResp.sBody);

               switch(oProd.id) {
                  case 'cmpelk':
                  case 'cmptcs':
                  case 'cmpcvf':
                  case 'cmpbos':
                     console.log(oDataProd.organization.primaryName +
                                    ' (' + oDataProd.transactionDetail.productID + ')');
                     break;
                  case 'CMP_VRF_ID':
                  case 'CMP_BOS':
                      console.log(oDataProd.OrderProductResponse.OrderProductResponseDetail.Product.Organization.OrganizationName.OrganizationPrimaryName[0].OrganizationName['$']  +
                                    ' (' + oDataProd.OrderProductResponse.OrderProductResponseDetail.Product.DNBProductID + ')');
                     break;
                  default:
                     console.log('Unknown product in JSON format');
               }
            }
            else if(isContentXML(httpResp.hdrs)) {
               oDataProd = new domParser().parseFromString(httpResp.sBody, 'text/xml');

               switch(oProd.id) {
                  case 'gdp_em':
                     let datars = oDataProd.getElementsByTagName('DATARS')[0];
                     let primName = datars.getElementsByTagName('PRIM_NME')[0];

                     console.log(primName.childNodes[0].nodeValue + ' (' + oProd.id + ')');
                     break;
                  default:
                     console.log('Unknown product in XML format');
               }
            }
            else {
               console.log('Unsupported content type');
               console.log(httpResp);
            }

         })

         .catch( httpResp => {

            let err, errAh;

            console.log('In catch clause, ' + ahPath);

            if(isContentJSON(httpResp.hdrs)) {
               err = JSON.parse(httpResp.sBody);
               errAh = err.api_hub_err;

               let errMsg = 'Error: ' + errAh.err_num + ', ' + errAh.message;
               if(errAh.ws_path) {errMsg += ' (' + errAh.ws_path + ')';}

               console.log(errMsg);

               if(errAh.msg_info) console.log(errAh.msg_info);
            }
            else if(isContentXML(httpResp.hdrs)) {
               err = new domParser().parseFromString(httpResp.sBody, 'text/xml');
               errAh = err.getElementsByTagName('api_hub_err')[0];

               if(errAh) {
                  let errMsg = '';

                  let errNumNode = errAh.getElementsByTagName('err_num')[0];
                  let errMsgNode = errAh.getElementsByTagName('message')[0];

                  errMsg = 'Error: ' + errNumNode.childNodes[0].nodeValue;
                  errMsg += ', ' + errMsgNode.childNodes[0].nodeValue;

                  let errPathNode = errAh.getElementsByTagName('ws_path')[0];
                  if(errPathNode) {
                     errMsg += ' (' + errPathNode.childNodes[0].nodeValue + ')';
                  }

                  console.log(errMsg);

                  let errInfoNode = errAh.getElementsByTagName('msg_info')[0];
                  if(errInfoNode) {
                     console.log(errInfoNode.childNodes[0].nodeValue);
                  }
               }
               else {
                  console.log('Unable to parse XML API Hub error');
               }
            }
            else {
               console.log('Unsupported content type');
               console.log(httpResp);
            }

         })
      });
   });
});

//Randomly change the sequence of array elements
function arrShuffle(arr) {
  let currIdx = arr.length;
  let tempVal, rndIdx;

  while (0 !== currIdx) {
    // Pick a remaining element...
    rndIdx = Math.floor(Math.random() * currIdx--);

    // And swap it with the current element.
    tempVal = arr[currIdx];
    arr[currIdx] = arr[rndIdx];
    arr[rndIdx] = tempVal;
  }

  return arr;
}

