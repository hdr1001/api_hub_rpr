##
# Copyright Hans de Rooij 2019
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
##

# Docker image is based on the Alpine Linux Apache image (v2.4)
FROM httpd:2.4.35-alpine

# Add customised configuration file
COPY ./conf/httpd.conf /usr/local/apache2/conf/httpd.conf
COPY ./conf/httpd-ssl.conf /usr/local/apache2/conf/extra/httpd-ssl.conf

# Change default web page
COPY ./static/index.html /usr/local/apache2/htdocs/

# Add the SSL keys
COPY ./SSL/* /usr/local/apache2/conf/

# Add (SSL client authenticated) directory dnb and default content
RUN mkdir /usr/local/apache2/htdocs/apihub
COPY ./static/hub_index.html /usr/local/apache2/htdocs/apihub/index.html

