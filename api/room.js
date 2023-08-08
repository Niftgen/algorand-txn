const {env} = require('./lib/env');
const {cors} = require('./lib/cors');
const {get, put} = require('./lib/room');
const {getAccount, getOptinApp} = require('./lib/account');
const {getWalletAddress} = require('./lib/auth');

exports.handler = cors(async function room(request) {
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

  try {
    if (walletAddress === body.creatorAddress) {
      const roomId = await put({creatorAddress: walletAddress});
      return {
        statusCode: 200,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({roomId}, null, 2),
      };
    }

    const [userAlgoAccount, creatorAlgoAccount] = await Promise.all([
      getAccount(walletAddress),
      getAccount(body.creatorAddress),
    ]);
    const subscriptionModuleState = getOptinApp({
      account: creatorAlgoAccount,
      appId: parseInt(env('SUBSCRIPTION_MODULE_ID'), 10),
    });
    const subscriptionAppState = getOptinApp({
      account: userAlgoAccount,
      appId: subscriptionModuleState?.SUBSCRIPTION_APP_ID,
    });

    if (!subscriptionAppState || !subscriptionAppState.SUBSCRIPTION_EXPIRES_DATE) {
      return {
        statusCode: 402,
        body: 'Only subscribers can access the room',
      };
    }

    const creatorExpiration =
      subscriptionAppState && subscriptionAppState.SUBSCRIPTION_EXPIRES_DATE
        ? new Date(subscriptionAppState.SUBSCRIPTION_EXPIRES_DATE * 1000)
        : null;
    const isActive = creatorExpiration && creatorExpiration > Date.now();
    if (!isActive) {
      return {
        statusCode: 402,
        body: 'Subscription expired',
      };
    }

    const roomId = await get({creatorAddress: body.creatorAddress});
    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({roomId}, null, 2),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 400,
      body: error.message,
    };
  }
});
