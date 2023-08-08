exports.cors = function cors(handler) {
  return async request => {
    const {headers: requestHeaders} = request;
    const origin = (requestHeaders && requestHeaders.origin) || '';

    const headers = {};
    if (origin.endsWith('niftgen.com') || origin.startsWith('http://localhost:')) {
      Object.assign(headers, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Content-Type,Accept,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,POST',
      });
    }
    if (request.httpMethod === 'OPTIONS') {
      return {statusCode: 200, headers};
    }

    const response = await handler(request);
    return {
      ...response,
      headers: {
        ...headers,
        ...response.headers,
      },
    };
  };
};
