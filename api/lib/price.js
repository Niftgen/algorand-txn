const AWS = require('aws-sdk');
const fetch = require('node-fetch');

async function fetchPrice() {
  const url = new URL('https://price.algoexplorerapi.io/price/algo-usd');
  const response = await fetch(url);
  const text = await response.text();
  if (!text.includes('ALGO-USD')) {
    console.error('Error fetching price', text);
    return;
  }
  try {
    const data = JSON.parse(text);
    if (!data?.price) {
      return;
    }
    return parseFloat(data?.price);
  } catch (e) {
    console.error(e);
    console.error('Error parsing price', text);
  }
}

async function get({db, id}) {
  const {STATE_TABLE_NAME, STATE_PRIMARY_KEY} = process.env;
  const response = await db
    .get({
      TableName: STATE_TABLE_NAME,
      Key: {[STATE_PRIMARY_KEY]: id},
    })
    .promise();
  if (response?.Item?.ttl > Date.now()) {
    return response?.Item?.price;
  }
  return undefined;
}

async function put({db, id, price}) {
  const {STATE_TABLE_NAME} = process.env;
  const result = await db
    .put({
      TableName: STATE_TABLE_NAME,
      Item: {
        id,
        price,
        ttl: Date.now() + 60_000,
      },
    })
    .promise();
  return result;
}

async function price({id}) {
  const db = new AWS.DynamoDB.DocumentClient();
  const price = await get({db, id});
  if (price) {
    return {id, price};
  }
  const current = await fetchPrice({id});
  await put({db, id, price: current});
  return {id, price: current};
}

module.exports = {
  price,
  get,
  put,
};
