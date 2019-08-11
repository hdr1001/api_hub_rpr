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

//Initialize the hub's foundational objects
const api = require('./ah_rpr_objs.js');

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
 
//Return application information when the top resource is requested
app.get('/hub', (req, res) => {
   const ret = {
      msg: 'API Hub for requesting, persisting & passing on 3rd party API data',
      license: 'Apache license, v2.0',
      licenseDetails: 'http://www.apache.org/licenses/LICENSE-2.0',
      copyright: 'Hans de Rooij, 2019'
   };

   res.setHeader('Content-Type', 'application/json');
   res.send(JSON.stringify(ret, null, 3));
});
/*
//Return the cmpelk product for a particular DUNS
app.get('/api/cmpelk/:sDUNS', (req, res) => {
   const oDUNS = api.getCmpelk(req.params.sDUNS, req.query.forceNew);

   oDUNS.on('onLoad', () => {
      res.setHeader('Content-Type', 'application/json');
      res.send(oDUNS.rsltJSON);
   });

   oDUNS.on('onError', () => {
      res.setHeader('Content-Type', 'application/json');
      res.send(oDUNS.rsltJSON);
   });
});

//Return the cmptcs product for a particular DUNS
app.get('/api/cmptcs/:sDUNS', (req, res) => {
   const oDUNS = api.getCmptcs(req.params.sDUNS, req.query.forceNew);

   oDUNS.on('onLoad', () => {
      res.setHeader('Content-Type', 'application/json');
      res.send(oDUNS.rsltJSON);
   });

   oDUNS.on('onError', () => {
      res.setHeader('Content-Type', 'application/json');
      res.send(oDUNS.rsltJSON);
   });
});

//Return the cmp_vrf_id product for a particular DUNS
app.get('/api/cmpvrfid/:sDUNS', (req, res) => {
   const oDUNS = api.getCmpVrfID(req.params.sDUNS, req.query.forceNew);

   oDUNS.on('onLoad', () => {
      res.setHeader('Content-Type', 'application/json');
      res.send(oDUNS.rsltJSON);
   });

   oDUNS.on('onError', () => {
      res.setHeader('Content-Type', 'application/json');
      res.send(oDUNS.rsltJSON);
   });
});

//Return the cmp_bos product for a particular DUNS
app.get('/api/cmpbos/:sDUNS', (req, res) => {
   const oDUNS = api.getCmpBos(req.params.sDUNS, req.query.forceNew);

   oDUNS.on('onLoad', () => {
      res.setHeader('Content-Type', 'application/json');
      res.send(oDUNS.rsltJSON);
   });

   oDUNS.on('onError', () => {
      res.setHeader('Content-Type', 'application/json');
      res.send(oDUNS.rsltJSON);
   });
});


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
//Instantiate the HTTP server object
const server = app.listen(http_port, http_host, () => {
   const host = server.address().address;
   const port = server.address().port;
   
   console.log('Node.js Express server started on ' + new Date());
   console.log('Web services hosted on http://' + host + ':' + port);
});
