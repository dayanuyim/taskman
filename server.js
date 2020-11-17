#!/usr/bin/env node
'use strict';

const {promisify} = require('util');
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const rename = promisify(fs.rename);
const exec = promisify(require('child_process').exec);
const path = require('path');
const nconf = require('nconf');
const axios = require('axios');
const colors = require('colors/safe');
const moment = require('moment-timezone');
const pkg = require('./package.json');
const utils = require('./utils');

function pretty(obj){ return JSON.stringify(obj, null, 2);}

nconf.argv()
    .env('__')
    .defaults({ conf: `${__dirname}/config.json` })
    .file(nconf.get('conf'));

const log = function(){
    const fmt = nconf.get('log').dateFormat;
    const tz = moment.tz.guess();
    const now = () => {
        return moment().tz(tz).format(fmt);
    }

    //const {blue: b, green: g, yellow: y, red: r} = colors;
    return {
        debug: (tag, msg) => console.log(`[${now()}] ${colors.blue(tag)} ${msg}`),
        info:  (tag, msg) => console.log(`[${now()}] ${colors.green(tag)} ${msg}`),
        warn:  (tag, msg) => console.log(`[${now()}] ${colors.yellow(tag)} ${msg}`),
        error: (tag, msg) => console.log(`[${now()}] ${colors.red(tag)} ${msg}`),
    };
}();

function getTaskLogger(taskId){
    return {
        debug: (tag, msg) => log.debug(tag, `[${taskId}] ${msg}`),
        info:  (tag, msg) =>  log.info(tag, `[${taskId}] ${msg}`),
        warn:  (tag, msg) =>  log.warn(tag, `[${taskId}] ${msg}`),
        error: (tag, msg) => log.error(tag, `[${taskId}] ${msg}`),
    }
}

// SET morgan date local
const initMorgan = (log) => {
    const morgan = require('morgan');
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

const upload = multer({ dest: nconf.get('task:incomingDir')});
/* DONT DO THIS BECAUSE THE 'taskId' IS NOT READY.
const upload = multer({ storage: multer.diskStorage({
    destination: nconf.get('task:dir'),
      filename: (req, file, cb) => {
          cb(null, req.body.taskId);
      }
    })
});
//*/

const taskpath = nconf.get('task:path');

/*
app.get(`${taskpath}/status`, (req, res) => {
    res.status(200).json({status: "hello"});
});
*/

app.get(`${taskpath}/:id/*`, (req, res) => {
    const log = getTaskLogger(req.params.id);

    const file = path.join(__dirname,
        nconf.get('task:dir'),
        req.params.id,
        req.params['0']);
    log.debug('DL', file);

    if(!fs.existsSync(file))
        res.status(404).end();
    else
        res.sendFile(file, {dotfiles: 'allow'});
});

app.post(taskpath, upload.single('sampleFile'), (req, res) => {
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
app.listen(port, () => log.debug('SERV', `listening at ${port}`));

class AmqReporter {
    constructor(req, log){
        this.log = log;
        this.amqHost = nconf.get('report:amq:host') || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        this.amqPort = nconf.get('report:amq:port') || 61613;
        this.queue = req.body.amqName || nconf.get('report:amq:queue');
    }

    async send(obj){
        const msg = JSON.stringify(obj);
        const sendmsg = promisify(utils.sendAmqMessage);
        await sendmsg(this.amqHost, this.amqPort, this.queue, msg);
    }
}

class ApiReporter {
    constructor(req, log){
        this.log = log;
        this.apiHost = req.body.apiHost || nconf.get('report:api:host');
    }

    async send(obj){
        const res = await axios.post(this.apiHost, obj);
        this.log.info('REPORT', `(${res.status}) ${pretty(res.data)}` );
    }
}

function getReporter(req, log){
    switch(nconf.get('report:method')){
        case 'amq':
            return new AmqReporter(req, log);
        case 'api':
            return new ApiReporter(req, log);
        default:
            return {
                send: (obj) => {
                    log.info('REPORT', "Done");
                }
            }
    }
}

async function runTask(req){

    const log = getTaskLogger(req.body.taskId);
    const reporter = getReporter(req, log);

    //the parameter name mtters.
    const genCmd = (sampleFile, taskDir) => {
        const cmd = eval('`' + nconf.get('task:cmd') + '`');
        log.info('CMD', cmd);
        return cmd;
    };

    try{
        // **NOT** config 'multer' by 'storeage' to do the rename, because 'taskId' may be not ready at that moment.
        //await resetReqFile(req.file, sampleFile);
        log.info('SAMPLE', `${pretty(req.file)}`);

        const taskDir = path.join(nconf.get('task:dir'), req.body.taskId);
        const {stdout, stderr} = await exec(genCmd(req.file.path, taskDir));
        log.info('RESULT', stdout);

        await reporter.send(JSON.parse(stdout)); //checking if stdout is json format
    }
    catch(err){
        log.error('ERROR', err);
        await reporter.send(utils.genUtestResult(req.body.taskId, err, null));
    }
};

function mkdirp(dirpath){
    if(!fs.existsSync(dirpath))
        fs.mkdirSync(dirpath, { resursie: true });
}

async function resetReqFile(fileobj, newpath){
    //move file
    mkdirp(path.dirname(newpath))
    await rename(fileobj.path, newpath);

    //reset data
    fileobj.path = newpath;
    fileobj.filename = path.basename(newpath);
}
