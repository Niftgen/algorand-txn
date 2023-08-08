const {cors} = require('./lib/cors');
const {price} = require('./lib/price');

exports.handler = cors(async function priceLambda() {
  const data = await price({id: 'algorand'});
  return {
    statusCode: 200,
    body: JSON.stringify(data),
  };
});
