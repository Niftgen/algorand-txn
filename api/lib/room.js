const AWS = require('aws-sdk');
const {v4: uuid} = require('uuid');

async function get({creatorAddress}) {
  const db = new AWS.DynamoDB.DocumentClient();
  const {STATE_TABLE_NAME, STATE_PRIMARY_KEY} = process.env;
  const response = await db
    .get({
      TableName: STATE_TABLE_NAME,
      Key: {[STATE_PRIMARY_KEY]: creatorAddress},
    })
    .promise();
  if (response?.Item?.expiryTime > Date.now()) {
    return response?.Item?.roomId;
  }
  return undefined;
}

async function put({creatorAddress}) {
  const db = new AWS.DynamoDB.DocumentClient();
  const {STATE_TABLE_NAME} = process.env;
  const roomId = uuid();
  await db
    .put({
      TableName: STATE_TABLE_NAME,
      Item: {
        id: creatorAddress,
        roomId,
        expiryTime: Date.now() + 600_000, // 10 minutes (should be enough to join)
      },
    })
    .promise();
  return roomId;
}

module.exports = {
  get,
  put,
};
