const AWS = require('aws-sdk');

async function getSecretString(id) {
  const client = new AWS.SecretsManager();
  const secret = await client.getSecretValue({SecretId: id}).promise();
  return secret.SecretString;
}

async function getSecretObject(id) {
  return JSON.parse(await getSecretString(id));
}

module.exports = {
  getSecretObject,
};
