const algosdk = require('algosdk');
const {algod} = require('./algod');

function decodeKey(key) {
  return Buffer.from(key, 'base64').toString();
}

function decodeValue(bytes) {
  const maybeAddress = algosdk.encodeAddress(new Uint8Array(Buffer.from(bytes, 'base64')));
  return algosdk.isValidAddress(maybeAddress) ? maybeAddress : Buffer.from(bytes, 'base64').toString();
}

function decodeAppState(appState) {
  return Object.fromEntries(
    appState
      .map(({key, value}) => {
        const decodedKey = decodeKey(key);
        if (typeof value === 'object') {
          if ('type' in value && value.type === 1) {
            return [decodedKey, decodeValue(value.bytes)];
          }
          if ('type' in value && value.type === 2) {
            return [decodedKey, value.uint];
          }
          if ('uint' in value) {
            return [decodedKey, value.uint];
          }
          if ('bytes' in value) {
            return [decodedKey, decodeValue(value.bytes)];
          }
        }
        if (typeof value === 'string') {
          return [decodedKey, decodeValue(value)];
        }
        return [decodedKey, undefined];
      })
      .sort(([key1], [key2]) => `${key1}`.localeCompare(`${key2}`))
  );
}

async function getAccount(addr) {
  return await algod.accountInformation(addr).do();
}

function getOptinApp({account, appId}) {
  if (!account) {
    return undefined;
  }
  if (!appId) {
    return undefined;
  }
  const app = account['apps-local-state'].find(app => app.id === appId);
  if (!app) {
    return undefined;
  }
  return {
    id: app.id,
    ...decodeAppState(app['key-value']),
  };
}

module.exports = {
  getAccount,
  getOptinApp,
};
