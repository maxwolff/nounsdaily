FROM node:14
WORKDIR /usr/src/app
COPY package*.json ./
ARG NODE_ENV=production
RUN npm i
COPY . .
CMD npm start