module.exports = async () => {
  require('../check-steam-appid.js');
  return require('./content-provenance.cjs').check();
};
