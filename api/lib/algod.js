const algosdk = require('algosdk');
const {env} = require('./env');

const auth = env('ALGOD_AUTH_HEADER') ? {[env('ALGOD_AUTH_HEADER')]: env('ALGOD_TOKEN')} : env('ALGOD_TOKEN');

exports.algod = new algosdk.Algodv2(auth, env('ALGOD_SERVER'), env('ALGOD_PORT'));
