const AWS = require('aws-sdk');
const crypto = require('crypto');
const mime = require('mime-types');
const {cors} = require('./lib/cors');
const {getWalletAddress} = require('./lib/auth');

exports.handler = cors(async function storjPut(request) {
  const body = JSON.parse(request.body);

  const walletAddress = await getWalletAddress(request);
  const ext = mime.extension(body.type);
  if (!ext) {
    return {
      statusCode: 400,
      body: 'File type not supported',
    };
  }

  const s3 = new AWS.S3({
    endpoint: process.env.STORJ_ENDPOINT,
    accessKeyId: process.env.STORJ_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORJ_SECRET_ACCESS_KEY,
  });
  const key = `${walletAddress}/${crypto.randomUUID({disableEntropyCache: true})}.${ext}`;

  return {
    statusCode: 200,
    body: await s3.getSignedUrlPromise('putObject', {Bucket: process.env.STORJ_BUCKET, Key: key}),
  };
});
