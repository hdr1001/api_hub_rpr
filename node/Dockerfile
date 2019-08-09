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

FROM node:8.12-alpine

# App directory
WORKDIR /usr/src/app

# Copy the credential files
RUN mkdir ./creds
COPY creds/*.json ./creds/

# Set the correct credential value(s)
ARG node_pg_pwd
RUN sed -i s/ph_pg_pwd/${node_pg_pwd}/g ./creds/pg.json
ARG node_dpl_usr
ARG node_dpl_pwd
RUN sed -i s/ph_dpl_usr/${node_dpl_usr}/g ./creds/dpl.json
RUN sed -i s/ph_dpl_pwd/${node_dpl_pwd}/g ./creds/dpl.json
ARG node_d2o_usr
ARG node_d2o_pwd
RUN sed -i s/ph_d2o_usr/${node_d2o_usr}/g ./creds/d2o.json
RUN sed -i s/ph_d2o_pwd/${node_d2o_pwd}/g ./creds/d2o.json

# Install app dependencies
COPY src/package*.json ./
RUN npm install

# Deliver source code
COPY src/*.js ./

# Start app on port 8081
EXPOSE 8081
CMD [ "npm", "start" ]

