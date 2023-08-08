const fetch = require('node-fetch');
const FormData = require('form-data');
const busboy = require('busboy');
const {cors} = require('./lib/cors');
const {getWalletAddress} = require('./lib/auth');

exports.handler = cors(async function storjIpfs(request) {
  try {
    // just validate, don't care
    await getWalletAddress(request);
  } catch (e) {
    console.error(e);
    return {
      statusCode: 403,
      body: e.message,
    };
  }

  const {file, filename, contentType} = await new Promise(resolve => {
    const chunks = [];
    let info;
    const bb = busboy({headers: request.headers});
    bb.on('file', (name, file, fileInfo) => {
      info = fileInfo;
      file.on('data', chunk => chunks.push(chunk));
    });
    bb.on('close', async () => {
      resolve({
        file: Buffer.concat(chunks),
        filename: info.filename,
        contentType: info.mimeType,
      });
    });
    bb.write(Buffer.from(request.body, 'base64'));
    bb.end();
  });

  const form = new FormData();
  form.append('file', file, {filename, contentType});

  const auth = Buffer.from(`${process.env.STORJ_IPFS_USER}:${process.env.STORJ_IPFS_PASSWORD}`).toString('base64');
  const response = await fetch(process.env.STORJ_IPFS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
    },
    body: form,
  });

  return {
    statusCode: 200,
    body: await response.text(),
  };
});
