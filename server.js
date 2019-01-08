#!/usr/bin/env node
'use strict';

const {promisify} = require('util');
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const rename = promisify(fs.rename);
const mkdirp = promisify(require('mkdirp'));
const exec = promisify(require('child_process').exec);
const path = require('path');
const nconf = require('nconf');
const pkg = require('./package.json');
const utils = require('./utils');

const { logDebug, logError } = utils;

nconf.argv()
    .env('__')
    .defaults({ conf: `${__dirname}/config.json` })
    .file(nconf.get('conf'));

// SET morgan date local
const initMorgan = (log) => {
    const morgan = require('morgan');
    const moment = require('moment-timezone');
    morgan.token('date', (req, res, tz) => {
        return moment().tz(tz).format(log.dateFormat);
    });

    const {red, green, yellow} = require('colors/safe');
    return morgan(eval('`' + log.format + '`'));
};

const app = express();
app.use(initMorgan(nconf.get('log')));
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

app.get('/csf/task/status', (req, res) => {
    console.log('');  //split output
    res.status(200).json({status: "hello"});
});

app.get('/csf/task/report/:reportName', (req, res) => {
    console.log('');  //split output
    const file = path.join(__dirname,
        nconf.get('report:dir'),
        req.params.reportName);
    logDebug('DL', file);
    res.sendFile(file);
});

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

const runTask = async (req) => {

    const result = (errmsg, reportName) => {
        const hostname = nconf.get('host') || req.hostname;
        const port = nconf.get('port');
        const taskId = req.body.taskId;
        const link = `http:\/\/${hostname}:${port}/csf/task/report/${reportName}`
        const rst =  utils.genUtestResult(taskId, errmsg, link);
        logDebug('RESULT', `${JSON.stringify(rst, null, 2)}`);
        return rst;
    };

    const sendmsg = (msg) => {
        const amqHost = nconf.get('amq:host') || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const amqPort = nconf.get('amq:port') || 61613;
        const queue = req.body.amqName || nconf.get('amq:queue');
        utils.sendAmqMessage(amqHost, amqPort, queue, msg, (err) => {
            if(err) return logError('ERROR', err);
        });
    };

    const genCmd = (samplePath, reportPath) => {
        const cmd_ = eval('`' + nconf.get('task:cmd') + '`');
        const cmd = `${cmd_} > "${reportPath}"`;
        logDebug('CMD', cmd);
        return cmd;
    };

    const reportName = req.body.taskId + nconf.get('report:suffix');
    const reportPath = path.join(nconf.get('report:dir'), reportName);
    const samplePath = path.join(nconf.get('task:dir'), req.body.taskId + path.extname(req.file.originalname));

    try{
        // RENAME file by taskId.
        // **NOT** config 'multer' by 'storeage' to do the rename, because 'taskId' may be not ready at that moment.
        await rename(req.file.path, samplePath);
        resetReqFile(req.file, samplePath); //just for data coherence

        await mkdirp(path.dirname(reportPath));
        await exec(genCmd(samplePath, reportPath));
        sendmsg(JSON.stringify(result(null, reportName)));
    }
    catch(err){
        logError('ERROR', err);
        sendmsg(JSON.stringify(result(err, null)));
    }
};

function resetReqFile(fileobj, newpath){
    fileobj.path = newpath;
    fileobj.filename = path.basename(newpath);
    logDebug('SAMPLE', `${JSON.stringify(fileobj, null, 2)}`);
}

const port = nconf.get('port');
app.listen(port, () => logDebug('SERV', `listening at ${port}`));
