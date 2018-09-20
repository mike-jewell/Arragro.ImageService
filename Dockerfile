# Start from base node alpine image
FROM node:10.10-alpine AS build-env

# install imagemagick
RUN apk add --no-cache autoconf
RUN apk add --no-cache automake
RUN apk add --no-cache build-base gcc g++ abuild binutils binutils-doc gcc-doc make coreutils 
RUN npm i npm@latest -g

WORKDIR /usr/src/app

COPY package*.json ./
# RUN npm audit
RUN npm install

COPY . .

FROM node:10.10-alpine

RUN apk add --no-cache imagemagick
RUN apk add --no-cache graphicsmagick

WORKDIR /usr/src/app

COPY --from=build-env /usr/src/app .
EXPOSE 3000

CMD [ "npm", "start" ]