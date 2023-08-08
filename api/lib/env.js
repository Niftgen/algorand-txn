function notFound(param) {
  throw new Error(`${param} required`);
}

function env(param) {
  const {[param]: value = notFound(param)} = process.env;
  return value;
}

module.exports = {
  env,
};
