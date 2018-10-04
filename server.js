#!/usr/bin/env node
'use strict';

const express = require('express');
const moment = require('moment-timezone');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const multer = require('multer');
const Stomp = require('stomp-client');
const fs = require('fs');
const exec = require('child_process').exec;
const path = require('path');
const nconf = require('nconf');
const pkg = require('./package.json');
const colors = require('colors/safe');

const yellow = colors.yellow;

nconf.argv()
    .env('__')
    .defaults({ conf: `${__dirname}/config.json` })
    .file(nconf.get('conf'));

// SET morgan date local
morgan.token('date', (req, res, tz) => {
    return moment().tz(tz).format(nconf.get('log:dateFormat'));
});

const app = express();
app.use(morgan(colors.green(nconf.get('log:format'))));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const upload = multer({ dest: nconf.get('task:dir')});
/* DONT DO THIS BECAUSE THE 'taskId' IS NOT READY.
const upload = multer({ storage: multer.diskStorage({
    destination: nconf.get('task:dir'),
      filename: (req, file, cb) => {
          cb(null, req.body.taskId);
      }
    })
});
*/

function amqSendMessage(host, port, queue, msg)
{
    const stomp = new Stomp(host, port);
    stomp.connect(sessionId => {
        console.log(`${yellow('AMQ')} ${host}:${port}/${queue} connected`);
        stomp.publish('/queue/' + queue, msg);
    });
};

function genResult(err, hostname, taskId, reportPath)
{
    const result = {
        taskId,
        status: err? "FAIL": "SUCCESS",
        message: err? JSON.stringify(err): '',
        link: err? '': `http:\/\/${hostname}:${nconf.get('port')}/csf/task/report/${path.basename(reportPath)}`
    };

    console.log(`${yellow('RESULT')}  ${JSON.stringify(result, null, 2)}`);
    return result;
}

function execCmd(samplePath, reportPath, execCB)
{
    const genCmd = (samplePath) => eval(`\`${nconf.get('task:cmd')}\``);

    const cmd = `${genCmd(samplePath)} > "${reportPath}"`;
    console.log(`${yellow('CMD')} ${cmd}`);

    exec(cmd, (err, stdout, stderr) => execCB(err, stdout, stderr));
}

function renameSamplePath(req, newSamplePath, renameCB)
{
    fs.rename(req.file.path, newSamplePath, (err) => {
        if(err) throw err;
        req.file.path = newSamplePath;
        req.file.filename = path.basename(newSamplePath);
        console.log(`${yellow('SAMPLE')} ${JSON.stringify(req.file, null, 2)}`);

        renameCB();
    });
}

app.get('/csf/task/status', (req, res) => {
    console.log('');  //split output
    res.status(200).json({status: "hello"});
});

app.get('/csf/task/report/:reportName', (req, res) => {
    console.log('');  //split output
    const file = path.join(__dirname,
        nconf.get('task:dir'),
        req.params.reportName);
    console.log(`${yellow('DL')} ${file}`);
    res.sendFile(file);
});

app.post('/csf/task/upload', upload.single('sampleFile'), (req, res) => {
    console.log('');  //split output
    res.status(200).json({
        status: "SUCCESS",
        message: "",
    });

    // RENAME file by taskId.
    // **NOT** config 'multer' by 'storeage' to do the rename, because 'taskId' is not ready at that moment.
    const newSamplePath = path.join(nconf.get('task:dir'),
        req.body.taskId + path.extname(req.file.originalname));

    renameSamplePath(req, newSamplePath, () => {
        // DO command
        const reportPath = req.file.path + nconf.get('task:reportSuffix');

        execCmd(req.file.path, reportPath, (err, stdout, stderr) => {
            //GEN result
            const hostname = nconf.get('host') || req.hostname;
            const result = genResult(err, hostname, req.body.taskId, reportPath);

            //send amq result
            const amqHost = nconf.get('amq:host') || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            const amqPort = nconf.get('amq:port');
            const queue = req.body.amqName || nconf.get('amq:queue');
            amqSendMessage(amqHost, amqPort, queue, JSON.stringify(result));
        });
    });
});

const port = nconf.get('port');
app.listen(port, () => console.log(`${yellow('SERV')} listening at ${port}`));
