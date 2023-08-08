/* eslint-disable no-console */
require('dotenv').config({override: true});

function cors(handler) {
  return request => handler(request);
}
Object.assign(require('@niftgen/api/lib/cors'), {cors});

async function getSecretObject(id) {
  const {env} = require('@niftgen/api/lib/env');
  switch (id) {
    case 'NIFTGEN_WALLET_SECRET':
      return {
        NIFTGEN_ADDRESS: env('ROOT_ADDRESS'),
        NIFTGEN_MNEMONIC: env('ROOT_MNEMONIC'),
      };
  }
}
Object.assign(require('@niftgen/api/lib/secret'), {getSecretObject});

const ALGO_PRICE = 1.0;

async function price({id}) {
  switch (id) {
    case 'algorand':
      return {
        id,
        price: ALGO_PRICE,
      };
  }
}
Object.assign(require('@niftgen/api/lib/price'), {price});

const express = require('express');

function die(error) {
  console.error(error);
  process.exit(1);
}

process.on('uncaughtException', die);
process.on('unhandledRejection', die);

const {NODE_HOST = '127.0.0.1', NODE_PORT = '3001'} = process.env;

function lambda(handler) {
  return async function respond(req, res) {
    try {
      const response = await handler({
        headers: {
          ...req.headers,
          Authorization: req.headers.authorization,
        },
        body: JSON.stringify(req.body),
      });
      res.status(response.statusCode);
      res.set(response.headers);
      res.send(response.body);
    } catch (error) {
      console.error(error);
      res.status(500);
      res.send(error.message);
    }
  };
}

const app = express();
app.use(require('body-parser').json());
app.use(require('cors')());

app.post('/subscribe', lambda(require('./api/subscribe').handler));

app.post('/video', lambda(require('./api/video').handler));
app.post('/storjPut', lambda(require('./api/storjPut').handler));
app.post('/storjIpfs', lambda(require('./api/storjIpfs').handler));

app.post(
  '/price',
  lambda(async request => {
    const body = JSON.parse(request.body);
    const id = body.id;
    return {
      statusCode: 200,
      body: JSON.stringify({id, price: ALGO_PRICE}),
    };
  })
);

app.post(
  '/room',
  lambda(async () => {
    return {
      statusCode: 200,
      body: JSON.stringify({roomId: 'local-niftgen'}),
    };
  })
);

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  res.status(500);
  res.text(err.message);
});

app.listen(NODE_PORT, NODE_HOST, error =>
  error ? die(error) : console.log(`Server is listening on http://${NODE_HOST}:${NODE_PORT}`)
);
