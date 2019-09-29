// *********************************************************************
//
// API Hub request, persist and respond web services
// JavaScript code file: ah_rpr_ws.js
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
// To run this code execute;
//    nodejs ah_rpr_ws.js
//
// *********************************************************************
'use strict';

//Initialize the API hub modules
const ahGlob = require('./ah_rpr_glob.js'); //Globals
const ahErr = require('./ah_rpr_err.js'); //Error handling code
const api = require('./ah_rpr_objs.js'); //Foundational objects

//Use the express library for the web services infrastructure
const express = require('express');
const app = express();

//Settings body-parser, Node.js body parsing middleware
//Documentation: https://github.com/expressjs/body-parser#body-parser
//const bodyParser = require('body-parser');
//app.use(bodyParser.urlencoded({extended: true}));
//app.use(bodyParser.json()); 

const path = require('path');

//HTTP host server and port
const http_host = '0.0.0.0'
const http_port = 8081;

//Return JSON data in response to an HTTP request
const doSend = (req, res, sStruct, sBody, err) => {
   let sContentType = 'application/' + sStruct.toLowerCase();
   let httpStatus = ahErr.httpStatusOK;

   if(err) {
      //Make sure the error is returned with the correct HTTP status code
      httpStatus = ahErr.getHttpStatusCode(err);

      //Add the requested path to the API hub error object
      if(err.api_hub_err && req.path) err.api_hub_err.ws_path = req.path;

      //Prepare the body of the error response
      if(err.api_hub_err) {
         sBody = err.toString();
      }
      else {
         sContentType = 'application/json';
         sBody = JSON.stringify(err, null, 3);
      }
   }

   res.setHeader('Content-Type', sContentType); 
   res.status(httpStatus).send(sBody);
}

//Return application information when the top resource is requested
app.get('/hub', (req, res) => {
   const ret = {
      msg: 'API Hub for requesting, persisting & passing on 3rd party API data',
      license: 'Apache license, v2.0',
      licenseDetails: 'http://www.apache.org/licenses/LICENSE-2.0',
      copyright: 'Hans de Rooij, 2019'
   };

   res.setHeader('Content-Type', 'application/json'); 
   res.status(ahErr.httpStatusOK).send(JSON.stringify(ret, null, 3));
});

//Return a data product for a particular access key
app.get('/hub/:sProduct/:sKey', (req, res) => {
   //console.log('Product requested: ' + req.params.sProduct);

   let oDataProd, sStruct = ahGlob.dataStruct[ahGlob.structJSON]; //JSON is default

   //Return XML if applicable
   if(api.getDataStructure(req.params.sProduct) === ahGlob.dataStruct[ahGlob.structXML]) {
      sStruct = ahGlob.dataStruct[ahGlob.structXML];
   }

   //Try to instantiate the data product object, errors might be thrown!
   try {
      oDataProd = api.getDataProduct(req.params.sKey, req.params.sProduct, req.query.forceNew);
   }
   catch(err) { //Error thrown while constructing data product object
      doSend(req, res, sStruct, null, err);
      return;
   }

   oDataProd.on('onLoad', () => { //Data product successfully loaded
      res.setHeader('X-API-Hub-Prod-DB', oDataProd.fromDB.toString());
      doSend(req, res, sStruct, oDataProd.rsltJSON);
   });

   oDataProd.on('onError', err => doSend(req, res, sStruct, null, err));
});

/*
//Return a Direct+ identity resolution response (note post!)
app.post('/api/idr', (req, res) => {
   const oIDR = api.getIDR(req.body);

   res.setHeader('Content-Type', 'application/json');

   oIDR.on('onLoad', () => {
      res.setHeader('X-DNB-DPL-IDR-ID', oIDR.ID);
      res.setHeader('X-DNB-DPL-HTTP-Stat', oIDR.dplHttpStatus);
      res.send(oIDR.rsltJSON);
   });

   oIDR.on('onError', () => {
      res.setHeader('X-DNB-DPL-HTTP-Stat', oIDR.dplHttpStatus);
      res.send(oIDR.rsltJSON);
   });
});

//Associate a specific DUNS with a Direct+ IDR transaction
app.post('/api/idr/:idrID', (req, res) => {
   const updIdrDuns = api.doUpdIdrDuns(req.params.idrID, req.body.DUNS);

   res.setHeader('Content-Type', 'application/json');

   updIdrDuns
      .then(rowCount => {
         console.log('Successfully updated DUNS for IDR ' + req.params.idrID);
         res.send('{\"rowCount\": ' + rowCount + '}');
      })
      .catch(err => {
         console.log('Error occured updating DUNS for IDR ' + req.params.idrID);
         res.status(404).send('{\"err_msg\": \"' + err.message + '\"}');
      });
});

//Return test Direct+ identity resolution test page
app.get('/api/test_idr', (req, res) => {
   res.setHeader('Content-Type', 'text/html');
   res.sendFile(path.join(__dirname, 'static', 'test_dpl_idr.html'));
});

//Return the CSS associated with the IDR form
app.get('/api/dnb_frm_idr.css', (req, res) => {
   res.setHeader('Content-Type', 'text/css');
   res.sendFile(path.join(__dirname, 'static', 'dnb_frm_idr.css'));
});

//Return the CSS associate with the Pixabay auto-complete control
app.get('/api/auto-complete.css', (req, res) => {
   res.setHeader('Content-Type', 'text/css');
   res.sendFile(path.join(__dirname, 'static', 'auto-complete.css'));
});

//Return the JavaScript associated with the IDR form
app.get('/api/dnb_frm_idr.js', (req, res) => {
   res.setHeader('Content-Type', 'text/javascript');
   res.sendFile(path.join(__dirname, 'static', 'dnb_frm_idr.js'));
});

//Return the JavaScript associated with the Pixabay auto-complete
app.get('/api/auto-complete.min.js', (req, res) => {
   res.setHeader('Content-Type', 'text/javascript');
   res.sendFile(path.join(__dirname, 'static', 'auto-complete.min.js'));
});
*/

//Backstop for requests for nonexistent resources
app.use((req, res, next) => {
   let sStruct = ahGlob.dataStruct[ahGlob.structJSON];

   let msgInfo = 'The requested resource (' + req.path + ') can not be located';
   console.log(msgInfo);

   let err = new ahErr.ApiHubErr(ahErr.unableToLocate,
                                 ahGlob.dataStruct[ahGlob.structJSON],
                                 msgInfo);

   doSend(req, res, sStruct, null, err);
});

//Instantiate the HTTP server object
const server = app.listen(http_port, http_host, () => {
   const host = server.address().address;
   const port = server.address().port;
   
   console.log('Node.js Express server started on ' + new Date());
   console.log('Web services hosted on http://' + host + ':' + port);
});

