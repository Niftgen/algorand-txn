const jwt = require('jsonwebtoken');

function getToken(request) {
  const [prefix, token] = `${request.headers.Authorization}`.split(' ');
  return prefix === 'Bearer' ? `${token}`.trim() : '';
}
exports.getToken = getToken;

async function getWalletAddress(request) {
  const token = getToken(request);
  if (!token) {
    throw Error('Missing JWT');
  }
  const decoded = await jwt.verify(token, process.env.JWT_SECRET);
  if (!decoded) {
    throw Error('Invalid JWT');
  }

  return decoded.walletAddress;
}
exports.getWalletAddress = getWalletAddress;
