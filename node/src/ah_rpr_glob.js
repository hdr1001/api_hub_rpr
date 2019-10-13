// *********************************************************************
//
// API Hub request, persist & respond global variables
// JavaScript code file: ah_rpr_glob.js
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

//Structure of the data delivered
const dataStruct = ['XML', 'JSON'];

const structXML = 0;  //XML data
const structJSON = 1; //JSON data

module.exports = Object.freeze({
   //Structure of the data delivered
   dataStruct,

   structXML,  //XML data
   structJSON  //JSON data
});

