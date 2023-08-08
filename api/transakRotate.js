const AWS = require('aws-sdk');
const fetch = require('node-fetch');

const {TRANSAK_KEYS_SECRET, TRANSAK_REFRESH_TOKEN_URL} = process.env;

exports.handler = async function transakRotate(request) {
  const arn = request.SecretId;
  const token = request.ClientRequestToken;
  const step = request.Step;

  const client = new AWS.SecretsManager();
  const metadata = await client
    .describeSecret({
      SecretId: arn,
    })
    .promise();

  if ('RotationEnabled' in metadata && !metadata.RotationEnabled) {
    throw new Error(`Secret ${arn} is not enabled for rotation`);
  }
  const versions = metadata.VersionIdsToStages;
  if (!(token in versions)) {
    throw new Error(`Secret version ${token} has no stage for rotation of secret ${arn}.`);
  }
  if (versions[token].includes('AWSCURRENT')) {
    console.log(`Secret version ${token} already set as AWSCURRENT for secret ${arn}.`);
    return;
  }
  if (!versions[token].includes('AWSPENDING')) {
    console.log(`Secret version ${token}  not set as AWSPENDING for rotation of secret ${arn}.`);
    return;
  }

  switch (step) {
    case 'createSecret':
      return createSecret({client, arn, token});

    case 'setSecret':
      return setSecret({client, arn, token});

    case 'testSecret':
      return testSecret({client, arn, token});

    case 'finishSecret':
      return finishSecret({client, arn, token});

    default:
      throw new Error(`Invalid step parameter ${step} for secret ${arn}`);
  }
};

async function getSecret({client, arn, stage, token = undefined}) {
  const secret = await client.getSecretValue({SecretId: arn, VersionStage: stage, VersionId: token}).promise();
  return secret.SecretString;
}

async function generateToken({client}) {
  const {SecretString} = await client.getSecretValue({SecretId: TRANSAK_KEYS_SECRET}).promise();
  const {TRANSAK_API_KEY, TRANSAK_API_SECRET} = JSON.parse(SecretString);
  const options = {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'api-secret': TRANSAK_API_SECRET},
    body: JSON.stringify({apiKey: TRANSAK_API_KEY}),
  };

  const response = await fetch(TRANSAK_REFRESH_TOKEN_URL, options);
  const json = await response.json();
  const date = new Date(parseInt(json.data.expiresAt) * 1000).toISOString();
  console.log(`generateToken: Successfully created new Access Token, will expire at ${date}`);
  return json.data.accessToken;
}

async function createSecret({client, arn, token}) {
  const _current = await getSecret({client, arn, stage: 'AWSCURRENT'});
  console.log(`createSecret: Successfully retrieved AWSCURRENT secret for ${arn}.`);
  try {
    await getSecret({client, arn, stage: 'AWSPENDING', token});
    console.log(`createSecret: Successfully retrieved AWSPENDING secret for ${arn} and version ${token}.`);
  } catch (err) {
    const next = await generateToken({client});
    await client
      .putSecretValue({
        SecretId: arn,
        ClientRequestToken: token,
        SecretString: next,
        VersionStages: ['AWSPENDING'],
      })
      .promise();
    console.log(`createSecret: Successfully put secret for ${arn} and version ${token}.`);
  }
}

async function setSecret({client, arn, token}) {
  const _pending = await getSecret({client, arn, stage: 'AWSPENDING', token});
  console.log(`setSecret: Successfully retrieved AWSPENDING secret for ${arn} and version ${token}.`);
  // We don't need to do anything with the pending secret
}

async function testSecret({client, arn, token}) {
  const _pending = await getSecret({client, arn, stage: 'AWSPENDING', token});
  console.log(`testSecret: Successfully retrieved AWSPENDING secret for ${arn} and version ${token}.`);
  // We don't need to do anything with the pending secret
}

async function finishSecret({client, arn, token}) {
  const metadata = await client.describeSecret({SecretId: arn}).promise();
  const [current] =
    Object.entries(metadata['VersionIdsToStages']).find(([_version, stages]) => stages.includes('AWSCURRENT')) || [];
  if (current === token) {
    console.log(`finishSecret: Version ${token} already marked as AWSCURRENT for ${arn}`);
    return;
  }
  await client
    .updateSecretVersionStage({
      SecretId: arn,
      VersionStage: 'AWSCURRENT',
      MoveToVersionId: token,
      RemoveFromVersionId: current,
    })
    .promise();
  console.log(`finishSecret: Successfully set AWSCURRENT stage to version ${token} for secret ${arn}.`);
}
