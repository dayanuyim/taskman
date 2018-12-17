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

const logInfo = (tag, msg) => console.log(`${colors.yellow(tag)} ${msg}`);
const logError = (tag, msg) => console.log(`${colors.red(tag)} ${msg}`);

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
        logInfo('AMQ', `${host}:${port}/${queue} connected`);
        stomp.publish('/queue/' + queue, msg);
    },
    err => logError('ERROR', err));
};

function genResult(taskId, errmsg, link)
{
    const result = {
        taskId,
        status: errmsg? "FAIL": "SUCCESS",
        message: errmsg? JSON.stringify(errmsg): '',
        link: errmsg? '': link
    };

    logInfo('RESULT', `${JSON.stringify(result, null, 2)}`);
    return result;
}

function execCmd(samplePath, reportPath, callback)
{
    const genCmd = (samplePath) => eval(`\`${nconf.get('task:cmd')}\``);
    const cmd = `${genCmd(samplePath)} > "${reportPath}"`;
    logInfo('CMD', cmd);

    fs.mkdir(path.dirname(reportPath), { recursive: true }, err => { 

        if (err && err.code != 'EEXIST')
            return callback(err, null, null);

        exec(cmd, (err, stdout, stderr) => callback(err, stdout, stderr));
    });
}

function renameReqSample(req, newSamplePath, callback)
{
    fs.rename(req.file.path, newSamplePath, (err) => {
        if(err)
            return callback(err);

        req.file.path = newSamplePath;
        req.file.filename = path.basename(newSamplePath);
        logInfo('SAMPLE', `${JSON.stringify(req.file, null, 2)}`);

        callback(null);
    });
}

app.get('/csf/task/status', (req, res) => {
    console.log('');  //split output
    res.status(200).json({status: "hello"});
});

app.get('/csf/task/report/:reportName', (req, res) => {
    console.log('');  //split output
    const file = path.join(__dirname,
        nconf.get('report:dir'),
        req.params.reportName);
    logInfo('DL', file);
    res.sendFile(file);
});

const runTask = req => {

    const result = (errmsg, reportName) => {
        const hostname = nconf.get('host') || req.hostname;
        const port = nconf.get('port');
        const taskId = req.body.taskId;
        const link = `http:\/\/${hostname}:${port}/csf/task/report/${reportName}`
        genResult(taskId, errmsg, link);
    };

    const sendMsg = (msg) => {
        const amqHost = nconf.get('amq:host') || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const amqPort = nconf.get('amq:port') || 61613;
        const queue = req.body.amqName || nconf.get('amq:queue');
        amqSendMessage(amqHost, amqPort, queue, msg);
    };

    // RENAME file by taskId.
    // **NOT** config 'multer' by 'storeage' to do the rename, because 'taskId' may be not ready at that moment.
    const newSamplePath = path.join(nconf.get('task:dir'), req.body.taskId + path.extname(req.file.originalname));

    renameReqSample(req, newSamplePath, (err) => {
        if(err)
            return sendMsg(JSON.stringify(result(err, null)));

        const reportName = req.body.taskId + nconf.get('report:suffix');
        const reportPath = path.join(nconf.get('report:dir'), reportName);

        execCmd(req.file.path, reportPath, (err, stdout, stderr) => {
            return sendMsg(JSON.stringify(result(err, reportName)));
        });
    });
};

app.post('/csf/task/upload', upload.single('sampleFile'), (req, res) => {
    console.log('');  //split output

    if(!req.body.taskId){
        res.status(400).json({
            status: "FAIL",
            message: "No taskId",
        });
    }
    else if(!req.file){
        res.status(400).json({
            status: "FAIL",
            message: "No sampleFile",
        });
    }
    else{
        res.status(200).json({
            status: "SUCCESS",
            message: "",
        });

        runTask(req);
    }
});

const port = nconf.get('port');
app.listen(port, () => logInfo('SERV', `listening at ${port}`));
