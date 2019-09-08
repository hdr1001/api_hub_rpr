console.log('Application started');

const https = require('https');
const qryStr = require('querystring');
const fs = require('fs');
const Bottleneck = require('bottleneck/es5');

function getAhDataProduct(sKey, sProduct, forceNew) {
   let httpAttr = {
       host: 'url.test',
       path: '/apihub/' + sProduct + '/' + sKey,
       method: 'GET',
       rejectUnauthorized: true,
       key: fs.readFileSync('ssl_clnt.key'),
       cert: fs.readFileSync('ssl_clnt.crt')
   };

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
            let jsonBody = body.join('');

            if(resp.statusCode < 200 || resp.statusCode > 299) {
               let errMsg = 'API request returned an invalid HTTP status code';
               errMsg += ' (' + resp.statusCode + ')';

               //console.log(errMsg);
               reject(jsonBody); return;
            }

            resolve(jsonBody);
         }); //resp.on('end'

      }).end(); //https.request
   }); //new Promise
} //function

let limiter = new Bottleneck( { minTime: 500 } );
let arrDUNS = fs.readFileSync('DUNS.txt').toString().split('\n'); //Read the DUNS test file
let arrProd = ['cmpelk', 'cmptcs'];

arrDUNS.forEach(aDUNS => {
   limiter.schedule(() => getAhDataProduct(aDUNS, arrProd[1])
      .then( jsonProduct => {
         let dataProd = JSON.parse(jsonProduct);
         console.log(dataProd.organization.primaryName + ' (' + dataProd.transactionDetail.productID + ')');
      })
      .catch( jsonErr => {
         let err = JSON.parse(jsonErr); let errAh = err.api_hub_err;

         let errMsg = 'Error: ' + errAh.err_num + ', ' + errAh.message;
         if(errAh.ws_path) {errMsg += ' (' + errAh.ws_path + ')';}

         console.log(errMsg);

         if(errAh.msg_info) console.log(errAh.msg_info);
      })
   )
});

console.log('Last statement in the test program');

