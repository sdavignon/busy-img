const debug = require('debug')('busy-img');
const bluebird = require('bluebird');
const axios = require('axios');
const redis = require('redis');
const sharp = require('sharp');
const { createClient } = require('lightrpc');
const { getAccountsAsync, getFromMetadata, getDefaultAvatar, getDefaultCover } = require('../helpers');

bluebird.promisifyAll(redis.RedisClient.prototype);

const redisClient = redis.createClient(process.env.REDISCLOUD_URL);
const client = createClient(process.env.STEEMJS_URL || 'https://api.steemit.com/', { timeout: 1500 });

const EXPIRY_TIME = 30 * 60;
const CACHE_MAX_AGE = 12 * 60 * 60;

function sendDefaultAvatar(res, username) {
  return res.sendFile(getDefaultAvatar(username))
}

function sendDefaultCover(res) {
  return res.sendFile(getDefaultCover())
}

function getAvatarKey (username, width, height) {
  return `@avatar/${username}/${width}/${height}`;
}

function getCoverKey (username, width, height) {
  return `@cover/${username}/${width}/${height}`;
}

function transformImage (input, width, height) {
  const intermediate = sharp(input)
    .resize(width, height)
    .crop(sharp.gravity.center);

  if (Math.min(width, height) > 150) {
    return intermediate.png({
      compressionLevel: 9,
    }).toBuffer();
  }

  return intermediate.jpeg({
    quality: 85,
  }).toBuffer();
}

async function getAvatarURL(username, width, height) {
  const key = getAvatarKey(username, width, height);
  let url = await redisClient.getAsync(key);
  if (url) return url;

  const [account] = await getAccountsAsync(client, [username]);
  const avatarURL = getFromMetadata(account, 'profile.profile_image');
  if (avatarURL) {
    redisClient.setex(key, EXPIRY_TIME, avatarURL);
  }
  return avatarURL;
}

async function getCoverURL(username, width, height) {
  const key = getCoverKey(username, width, height);
  let url = await redisClient.getAsync(key);
  if (url) return url;

  const [account] = await getAccountsAsync(client, [username]);
  const coverURL =  getFromMetadata(account, 'profile.cover_image');
  if (coverURL) {
    redisClient.setex(key, EXPIRY_TIME, coverURL);
  }
  return coverURL;
}

async function handleImageProxy(req, res) {
  const isCover = /\/@[a-z0-9-]+\/cover/.test(req.originalUrl);
  const username = req.params.username;
  const width = +(req.query.width || req.query.w || req.query.size || req.query.s || (isCover ? 1024 : 128));
  const height = +(req.query.height || req.query.h || req.query.size || req.query.s || (isCover ? 256 : 128));

  if (!username) {
    return res.send('Parameter username has to be specified.');
  }

  if (isCover) {
    if (width < 0 || width > 2000 || height < 0 || height > 2000) {
      return res.send('Parameters: width, height, and size has to be between 0 to 2000.');
    }
  } else {
    if (width < 0 || width > 1000 || height < 0 || height > 1000) {
      return res.send('Parameters: width, height, and size has to be between 0 to 1000.');
    }
  }

  const getURL = isCover ? getCoverURL : getAvatarURL;
  const getDefault = isCover ? getDefaultCover : getDefaultAvatar;

  try {
    const url = await getURL(username, width, height);
  
    if (!url) {
      return res.sendFile(getDefault(username));
    }
  
    const imageResponse = await axios.get(url, {
      timeout: 1000,
      responseType: 'arraybuffer',
    });
  
    const transformedImage = await transformImage(imageResponse.data, width, height);
  
    res.setHeader('Cache-Control', `max-age=${CACHE_MAX_AGE}`);
    res.setHeader('Content-Type', 'image/jpeg')
    return res.send(transformedImage);
  } catch(err) {
    debug(err);
    const transformedImage = await transformImage(getDefault(username), width, height);
  
    res.setHeader('Content-Type', 'image/jpeg')
    return res.send(transformedImage);
  }
}

module.exports = handleImageProxy;