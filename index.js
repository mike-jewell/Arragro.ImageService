const fs = require('fs')
const util = require('util')
const Promise = require('bluebird');

const gm = require('gm').subClass({imageMagick: true});
const express = require('express');
const multer = require('multer');
const imagemin = require('imagemin');
const imageminGifSicle = require('./imagemin-gifsicle');
const toArray = require('stream-to-array');
const sbuff = require('simple-bufferstream');

Promise.promisifyAll(gm.prototype);

function fileFilter(req, file, cb) {
    console.log('file is', file)
    cb(null,true);
}

const storage = multer.memoryStorage();
const upload = multer({ dest: 'uploads/', storage: storage });
const app = express();
app.use(express.static('public'));

function getBinaryData(req, res, next) {
    var data = [];
    req.on('data', function(chunk) { 
        data.push(chunk);
    });

    req.on('end', function() {
        req.body = Buffer.concat(data);
        next();
    });
}

function getMimeType (features) {
    if (features.format === 'MVG') {
        return 'image/svg+xml';
    } else if (typeof(features['Mime type']) === 'string') {
        return features['Mime type'];
    } else {
        return features['Mime type'][0];
    }
}

async function streamToBuffer(fileStream) {
    try {
        var parts = await toArray(fileStream);
        const buffers = parts
                .map(part => util.isBuffer(part) ? part : Buffer.from(part));
        return Buffer.concat(buffers);
    } catch (err) {
        console.log('Something went wrong converting stream to buffer');
        throw err;
    }
}

async function processGif (features, buffer, options) {
    let width = features.size.width;
    if (options.width && options.width <= width) {
        width = options.width;
    }

    return await imagemin.buffer(buffer, {use: [imageminGifSicle({ interlaced: true, optimizationLevel: 3, resize: width })]});
}

async function processImage (features, buffer, options) {
    let image = new gm(buffer)
        .strip()
        .interlace('Line')
        .quality(options.quality)

    if (options.width <= features.size.width) {        
      image.resize(options.width)
    }
    
    if (options.asProgressiveJpeg !== undefined && options.asProgressiveJpeg === 'true') {
        image = image.setFormat('pjpeg');
    } else {
        image = image.setFormat(features.format);
    }
    return await image.toBufferAsync();
}

async function handleResize (features, buffer, options) {
    switch (features.format) {
        case "GIF":        
            return await processGif(features, buffer, options);
        case "SVG":
        case "MVG":
            return new Promise(function(resolve, reject) {
                resolve(buffer);
            });
        default:
            return await processImage(features, buffer, options);
    }
}

async function processResizeAndRespond (req, res, features, options) {
    try {
        var buffer = await handleResize(features, req.file.buffer, options);
        var imageDetails = await gm(buffer).identifyAsync();

        var header = {
            'Content-Type': getMimeType(features),
            'Image-Height': imageDetails.size.height,
            'Image-Width': imageDetails.size.width,
            'IsImage': features.format !== 'SVG' && features.format !== 'MVG'
        }
        res.writeHead(200, header);
        
        const s = sbuff(buffer.slice(0));
        s.pipe(res);
    } catch (err) {
        res.status(500).send({ 
            error: 'Something has gone wrong when processing the file!',
            message: err.message
        });
    }
}

app.post('/image/resize', upload.single('image'), async function (req, res, next) {
    if (!req.file || !req.body) {
        res.status(500).send({ 
            error: 'You need to supply a file with options'
        });
        return;
    }
    let options = req.body;

    try {
        const im = gm(req.file.buffer);
        const features = await im.identifyAsync();
        
        if (!options.width || isNaN(parseInt(options.width))) {
            options.width = features.size.width
        }
        
        if (!options.quality || isNaN(parseInt(options.quality))) {
            options.quality = 80
        }

        await processResizeAndRespond(req, res, features, options)
    }
    catch (err) {
        console.log('Error', err);
        res.status(500).send({ 
            error: 'Something has gone wrong when identifying the file!',
            message: err.message
        });
    }
});


app.listen(3000, function () {
	console.log('ImageOptimizer listening on port 3000!');
});