const fs = require('fs')
const util = require('util')
const gm = require('gm').subClass({imageMagick: true});
const express = require('express');
const multer = require('multer');
const unlinkAsync = util.promisify(fs.unlink);
const imagemin = require('imagemin');
const imageminGifSicle = require('imagemin-gifsicle');
const toArray = require('stream-to-array');
const sbuff = require('simple-bufferstream');
const streamLength = require("stream-length");


function fileFilter(req, file, cb) {
    console.log('file is', file)
    cb(null,true);
}

const upload = multer({ dest: 'uploads/' })
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
    if (typeof(features['Mime type']) === 'string') {
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

async function processGif (res, next, features, fileStream, im, options) {
    var buffer = await streamToBuffer(fileStream);
    return imagemin.buffer(buffer, {use: [imageminGifSicle({ interlaced: true, optimizationLevel: 3 })]});
}

function handleResize (res, next, features, fileStream, im, options) {
    switch (features.format) {
        case "SVG":
            return streamToBuffer(fileStream);
        case "GIF":        
            return processGif(res, next, features, fileStream, im, options);
        default:
            return streamToBuffer(fileStream);
    }
}

app.post('/image/resize', upload.single('image'), async function (req, res, next) {
    if (!req.file || !req.body) {
        res.status(500).send({ 
            error: 'You need to supply a file with options'
        });
        return;
    }
    let fileStream = fs.createReadStream(req.file.path);
    const im = gm(fileStream);

    const options = req.body;
    if (!options.width || isNaN(parseInt(options.width))) {
        res.status(500).send({ 
            error: 'You need to supply a numeric width'
        });
        return;
    }
    if (!options.quality || isNaN(parseInt(options.quality))) {
        res.status(500).send({ 
            error: 'You need to supply a numeric width'
        });
        return;
    }

    im.identify(async function(err, features){
        if (err) {
            console.log('Error', err);
            res.status(500).send({ 
                error: 'Something has gon wrong when identifying the file!',
                message: err.message
            });
        } else {
            fileStream = fs.createReadStream(req.file.path);
            await unlinkAsync(req.file.path);

            handleResize(res, next, features, fileStream, im, options)
                .then(buffer => {                
                    streamLength(buffer, {}, (err, result) => {
                        var header = {
                            'Content-Type': getMimeType(features)
                        }
                        if (!err) {
                            header['Content-Length'] = result;
                        }
                        res.writeHead(200, header);
                        const s = sbuff(buffer);
                        s.pipe(res);
                        next();
                    })
                });
        }
    });
});


app.listen(3000, function () {
	console.log('ImageOptimizer listening on port 3000!');
});