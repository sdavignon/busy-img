const cloudinary = require('cloudinary');
const express = require('express');
const limiter = require('limiter');
const multipart = require('connect-multiparty');
const handleImageProxy = require('./imageProxy');

const multipartMiddleware = multipart();
// 2000 calls an hour because we're on the Bronze plan, usually would be 500
const cloudinaryRateLimiter = new limiter.RateLimiter(2000, 'hour');
const router = express.Router();

router.get('/@:username', handleImageProxy);
router.get('/@:username/cover', handleImageProxy);

router.post('/@:username', multipartMiddleware, (req, res, next) => {
  const username = req.params.username;
  const file = req.files;
  const path = file[Object.keys(file)[0]].path;
  cloudinary.uploader.upload(path, (result) => {
    res.json({ url: result.url });
  }, {
      public_id: '@' + username,
      tags: [
        '@' + username,
        'profile_image'
      ]
    });
  delete req.files;
});

router.post('/@:username/cover', multipartMiddleware, (req, res, next) => {
  const username = req.params.username;
  const file = req.files;
  const path = file[Object.keys(file)[0]].path;
  cloudinary.uploader.upload(path, (result) => {
    res.json({ url: result.url });
  }, {
      public_id: '@' + username + '/cover',
      tags: [
        '@' + username,
        'cover_image'
      ]
    });
  delete req.files;
});

/*!
 * POST /@:username/uploads
 *
 * Uploads a file to cloudinary and responds with the result. Requires one
 * multipart form file field
 */

router.post('/@:username/uploads', multipartMiddleware, (req, res, next) => {
  const username = req.params.username;
  const files = req.files;
  const keys = Object.keys(files);

  if (!keys[0]) {
    const err = new Error('Missing a file parameter');
    err.status = 422;
    return next(err);
  }

  const path = files[keys[0]].path;
  cloudinary.uploader.upload(path, (result) => {
    res.status(201);
    res.json(result);
  }, {
      tags: [
        '@' + username,
        'general-upload'
      ]
    });
});

/*!
 * GET /@:username/uploads
 *
 * Gets an user's uploads by querying cloudinary for its tag
 */

router.get('/@:username/uploads', (req, res, next) => {
  const username = req.params.username;
  cloudinaryRateLimiter.removeTokens(1, () => {
    // ^^ Error isn't relevant here, see
    // https://www.npmjs.com/package/limiter#usage
    cloudinary.api.resources_by_tag('@' + username, (result) => {
      res.json(result.resources);
    });
  });
});

module.exports = router;
