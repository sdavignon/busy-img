const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const md5 = require('md5');

function getDefaultAvatar (username) {
  const id = md5(username).charCodeAt(0) % 10;
  return path.resolve(__dirname, `../img/${id}.png`);
}

function getDefaultCover () {
  return path.resolve(__dirname, '../img/transparent.png');
}

const getAccountsAsync = (client, usernames) => new Promise((resolve, reject) => {
  client.send('get_accounts', [usernames], function(err, result) {
    if (err !== null) reject(err);
    resolve(result);
  });
});

function getFromMetadata (account, key) {
  if (!account || !account.json_metadata) {
    throw new Error('account or account.json_metadata is undefined.');
  }

  const metadata = _.attempt(JSON.parse, account.json_metadata);
  if (_.isError(metadata)) throw metadata;

  return _.get(metadata, key);
}

module.exports = {
  getDefaultAvatar,
  getDefaultCover,
  getAccountsAsync,
  getFromMetadata,
};
