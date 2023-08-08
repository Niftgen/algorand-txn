const util = require('util');
const algosdk = require('algosdk');
const {algod} = require('./lib/algod');
const {cors} = require('./lib/cors');
const {env} = require('./lib/env');
const {getSecretObject} = require('./lib/secret');
const {getAccount, getOptinApp} = require('./lib/account');

exports.handler = cors(async function subscribe(request) {
  const body = JSON.parse(request.body);

  try {
    const account = await getAccount(body.from);
    const subscriptionApp = getOptinApp({account, appId: body.subscriptionAppId});

    if (!subscriptionApp) {
      return {
        statusCode: 200,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({subscriptionApp, txns: [], id: []}, null, 2),
      };
    }
    const isPlatformSubscription = parseInt(env('PLATFORM_SUBSCRIPTION_APP_ID'), 10) === body.subscriptionAppId;

    const {price: ALGO_PRICE} = await require('./lib/price').price({id: 'algorand'});
    const monthlyUsd = isPlatformSubscription
      ? parseInt(env('MONTHLY_PLATFORM_SUBSCRIPTION'), 10)
      : parseInt(env('MONTHLY_CREATOR_SUBSCRIPTION'), 10);
    const subscriptionPrice = algosdk.algosToMicroalgos(monthlyUsd / 100 / ALGO_PRICE);

    if (!subscriptionPrice) {
      return {
        statusCode: 500,
        body: 'Cannot calculate subscription price',
      };
    }

    const {NIFTGEN_MNEMONIC} = await getSecretObject(env('NIFTGEN_WALLET_SECRET'));
    const {addr: NIFTGEN_ADDR, sk: NIFTGEN_SK} = algosdk.mnemonicToSecretKey(NIFTGEN_MNEMONIC);

    const subscriptionAppAddress = algosdk.getApplicationAddress(body.subscriptionAppId);

    const now = Math.floor(Date.now() / 1000);
    const currentExpirationDate = subscriptionApp.SUBSCRIPTION_EXPIRES_DATE;
    const nextExpirationDate = Math.max(currentExpirationDate, now) + 2_629_743;

    const ADMIN_MODULE_ID = parseInt(env('ADMIN_ID'), 10);
    const ADMIN_MODULE_ADDR = algosdk.getApplicationAddress(ADMIN_MODULE_ID);

    const CREATOR_POOL_ID = parseInt(env('CREATOR_POOL_ID'), 10);
    const CREATOR_POOL_ADDR = algosdk.getApplicationAddress(CREATOR_POOL_ID);

    const SUBSCRIPTION_MODULE_ID = parseInt(env('SUBSCRIPTION_MODULE_ID'), 10);

    const getReferralWallet = async () => {
      // Check if referral is approved creator
      try {
        if (isPlatformSubscription && body.referral) {
          const referral = await getAccount(body.referral);
          const referralAdminState = getOptinApp({account: referral, appId: ADMIN_MODULE_ID});
          if (referralAdminState?.STATUS === 1) {
            return body.referral;
          }
        }
      } catch (e) {
        // whatever
      }
      return subscriptionApp.CREATOR_ADDRESS;
    };
    const referralAddress = await getReferralWallet();

    const getSubscriptionType = () => {
      if (!isPlatformSubscription) {
        return 0; // SUBSCRIBE_CREATOR
      }
      if (referralAddress !== subscriptionApp.CREATOR_ADDRESS) {
        return 1; // SUBSCRIBE_REFERRAL
      }
      return 2; // SUBSCRIBE_PLATFORM
    };
    const subscriptionType = getSubscriptionType();

    const params = [
      {from: body.from, to: subscriptionAppAddress, amount: subscriptionPrice},
      {
        from: body.from,
        appIndex: body.subscriptionAppId,
        appArgs: [subscriptionApp.SUBSCRIPTION_STATUS === 1 ? 'RENEW_SUBSCRIPTION' : 'SUBSCRIBE'],
        accounts: [NIFTGEN_ADDR, ADMIN_MODULE_ADDR, referralAddress, CREATOR_POOL_ADDR],
        foreignApps: [ADMIN_MODULE_ID, CREATOR_POOL_ID, SUBSCRIPTION_MODULE_ID, body.subscriptionAppId],
      },
      {
        from: NIFTGEN_ADDR,
        appIndex: body.subscriptionAppId,
        appArgs: [
          'UTILITY',
          0, // payment type
          subscriptionPrice,
          nextExpirationDate,
          subscriptionType,
        ],
        accounts: [isPlatformSubscription ? CREATOR_POOL_ADDR : subscriptionApp.CREATOR_ADDRESS, referralAddress],
        note: subscriptionApp.SUBSCRIPTION_STATUS === 1 ? 'R' : 'S',
      },
    ];

    const enc = new util.TextEncoder();
    const unsignedTransactions = [
      algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        suggestedParams: Object.assign(await algod.getTransactionParams().do(), {fee: 1_000, flatFee: true}),
        ...params[0],
      }),

      algosdk.makeApplicationNoOpTxnFromObject({
        suggestedParams: Object.assign(await algod.getTransactionParams().do(), {
          fee: subscriptionApp.SUBSCRIPTION_STATUS === 1 ? 9_000 : 10000,
          flatFee: true,
        }),
        ...params[1],
        appArgs: [enc.encode(subscriptionApp.SUBSCRIPTION_STATUS === 1 ? 'RENEW_SUBSCRIPTION' : 'SUBSCRIBE')],
      }),

      algosdk.makeApplicationNoOpTxnFromObject({
        suggestedParams: Object.assign(await algod.getTransactionParams().do(), {fee: 0, flatFee: true}),
        ...params[2],
        appArgs: [
          enc.encode('UTILITY'),
          algosdk.encodeUint64(0), // payment type
          algosdk.encodeUint64(subscriptionPrice),
          algosdk.encodeUint64(nextExpirationDate),
          algosdk.encodeUint64(subscriptionType),
        ],
        note: enc.encode(subscriptionApp.SUBSCRIPTION_STATUS === 1 ? 'R' : 'S'),
      }),
    ];
    algosdk.assignGroupID(unsignedTransactions);

    const id = unsignedTransactions.map(txn => txn.txID());
    const signedTxns = [];
    const txns = unsignedTransactions.map(txn => {
      if (txn.appArgs[0] && Buffer.compare(txn.appArgs[0], enc.encode('UTILITY')) === 0) {
        signedTxns.push(Buffer.from(txn.signTxn(NIFTGEN_SK)).toString('base64'));
      } else {
        signedTxns.push(null);
      }
      return Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64');
    });

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({subscriptionApp, txns, signedTxns, id}, null, 2),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 400,
      body: error.message,
    };
  }
});
