const AWS = require('aws-sdk');
const fetch = require('node-fetch');
const {env} = require('./lib/env');
const {cors} = require('./lib/cors');
const {getWalletAddress} = require('./lib/auth');
const {getAccount, getOptinApp} = require('./lib/account');

const gql = ([x]) => x;
const query = gql`
  query getAsset($id: Int!) {
    getAsset(id: $id) {
      id
      filePath
      kind
    }
  }
`;

async function getSubscriptionError({walletAddress, filePath}) {
  const [creatorAddress] = filePath.split('/');
  if (walletAddress !== creatorAddress) {
    const [creatorAlgoAccount, userAlgoAccount] = await Promise.all([
      getAccount(creatorAddress),
      getAccount(walletAddress),
    ]);
    const subscriptionModuleState = getOptinApp({
      account: creatorAlgoAccount,
      appId: parseInt(env('SUBSCRIPTION_MODULE_ID'), 10),
    });
    const subscriptionAppState = getOptinApp({
      account: userAlgoAccount,
      appId: subscriptionModuleState?.SUBSCRIPTION_APP_ID,
    });
    const platformAppState = getOptinApp({
      account: userAlgoAccount,
      appId: parseInt(env('PLATFORM_SUBSCRIPTION_APP_ID'), 10),
    });

    if (
      (!platformAppState || !platformAppState.SUBSCRIPTION_EXPIRES_DATE) &&
      (!subscriptionAppState || !subscriptionAppState.SUBSCRIPTION_EXPIRES_DATE)
    ) {
      return {
        statusCode: 402,
        body: 'Only subscribers can access channel content',
      };
    }
    const platformExpiration =
      platformAppState && platformAppState.SUBSCRIPTION_EXPIRES_DATE
        ? new Date(platformAppState.SUBSCRIPTION_EXPIRES_DATE * 1000)
        : null;
    const creatorExpiration =
      subscriptionAppState && subscriptionAppState.SUBSCRIPTION_EXPIRES_DATE
        ? new Date(subscriptionAppState.SUBSCRIPTION_EXPIRES_DATE * 1000)
        : null;
    const isActive =
      (platformExpiration && platformExpiration > Date.now()) || (creatorExpiration && creatorExpiration > Date.now());
    if (!isActive) {
      return {
        statusCode: 402,
        body: 'Subscription expired',
      };
    }
  }
}

exports.handler = cors(async function video(request) {
  const body = JSON.parse(request.body);

  let walletAddress;
  try {
    walletAddress = await getWalletAddress(request);
  } catch (error) {
    return {
      statusCode: 401,
      body: error.message,
    };
  }

  let asset;
  try {
    const resp = await fetch(`${env('API_URL')}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: request.headers.Authorization,
        'x-api-key': env('API_KEY'),
      },
      body: JSON.stringify({
        query,
        variables: {
          id: body.id,
        },
      }),
    });
    const {data, errors} = await resp.json();
    if (data?.getAsset) {
      asset = data?.getAsset;
    } else {
      throw new Error(errors?.[0]?.message || 'Unknown server error');
    }
  } catch (error) {
    return {
      statusCode: 401,
      body: error.message,
    };
  }

  if (asset.kind !== 'FREE_VIDEO') {
    const maybeError = await getSubscriptionError({filePath: asset.filePath, walletAddress});
    if (maybeError) {
      return maybeError;
    }
  }

  const s3 = new AWS.S3({
    endpoint: process.env.STORJ_ENDPOINT,
    accessKeyId: process.env.STORJ_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORJ_SECRET_ACCESS_KEY,
  });

  return {
    statusCode: 200,
    body: await s3.getSignedUrlPromise('getObject', {
      Bucket: process.env.STORJ_BUCKET,
      Key: asset.filePath,
    }),
  };
});
