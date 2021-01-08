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

function toAbs(p){
    return path.isAbsolute(p)? p: path.join(__dirname, p);
}

function getTaskLogger(taskId='', method=''){
    const fmt = nconf.get('log').dateFormat;
    const tz = moment.tz.guess();
    const now = () => {
        return moment().tz(tz).format(fmt);
    }

    const {blue: b, green: g, yellow: y, red: r} = colors;
    return {
        debug: (tag, msg) => console.log(`[${now()}][${taskId}][${method}] ${b(tag)} ${msg}`),
        info:  (tag, msg) => console.log(`[${now()}][${taskId}][${method}] ${g(tag)} ${msg}`),
        warn:  (tag, msg) => console.log(`[${now()}][${taskId}][${method}] ${y(tag)} ${msg}`),
        error: (tag, msg) => console.log(`[${now()}][${taskId}][${method}] ${r(tag)} ${msg}`),
    };
};

const runningTasks = new Set();

// =========== init ====================
nconf.argv()
    .env('_')
    .defaults({ conf: `${__dirname}/config.json` })
    .file(nconf.get('conf'));


const log = getTaskLogger();

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

const taskDirRoot = toAbs(nconf.get('task:dir'));

const upload = multer({ dest: path.join(taskDirRoot, ".incoming")});
/* DONT DO THIS BECAUSE THE 'taskId' IS NOT READY.
const upload = multer({ storage: multer.diskStorage({
    destination: taskDirRoot,
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

function taskExists(id){
    return fs.existsSync(path.join(taskDirRoot, id));
}

app.delete(`${taskpath}/:id`, (req, res) => {
    const log = getTaskLogger(req.params.id, 'DELETE');

    if(!taskExists(req.params.id))
        return res.status(404).end();

    // need more robust wasy to do this
    //if(!runningTasks.has(req.params.id))
    //    return res.status(400).end();

    res.status(200).end();
    deleteTask(req.params.id);
});

async function deleteTask(taskId){
    const genCmd = ({taskId}) => {
        const cmd = eval('`' + nconf.get('task:delete:cmd') + '`');
        log.info('CMD', cmd);
        return cmd;
    };

    try{
        const {stdout, stderr} = await exec(genCmd({taskId}));
        log.info('CMD', `stdout[${stdout}], stderr[${stderr}]`);
    }
    catch(e){
        log.error('CMD', e.stack);
    }
}

app.get(`${taskpath}/:id/*`, (req, res) => {
    const log = getTaskLogger(req.params.id, 'GET');

    const file = path.join(
        taskDirRoot,
        req.params.id,
        req.params['0']);
    log.debug('DL', file);

    if(!fs.existsSync(file)){
        res.status(404).end();
        return;
    }

    res.sendFile(file, {dotfiles: 'allow'});
});

app.post(`${taskpath}/:id?`, upload.single('sampleFile'), (req, res) => {
    const taskId = req.params.id || req.body.taskId;  //back-compatability to get taskId from body
    const file = req.file;

    if (!taskId)
        res.status(400).json(utils.genAppResult(taskId, "No taskId"));
    else if (!req.file)
        res.status(400).json(utils.genAppResult(taskId, "No sampleFile"));
    else {
        res.status(200).json(utils.genAppResult(taskId));
        runTask(req, taskId, file);
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
        this.log.info('REPORT', `AMQ sending ${pretty(obj)}` );
        const msg = JSON.stringify(obj);
        const sendmsg = promisify(utils.sendAmqMessage);
        await sendmsg(this.amqHost, this.amqPort, this.queue, msg);
        this.log.info('REPORT', "AMQ done" );
    }
}

class ApiReporter {
    constructor(req, log){
        this.log = log;
        this.apiHost = req.body.apiHost || nconf.get('report:api:host');
    }

    async send(obj){
        this.log.info('REPORT', `API sending ${pretty(obj)}` );
        const res = await axios.post(this.apiHost, obj);
        this.log.info('REPORT', `API resp (${res.status}) ${pretty(res.data)}` );
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

async function _runTask(taskId, file, log){
    //the parameter name mtters.
    const genCmd = ({sampleFile, taskId, taskDir}) => {
        const cmd = eval('`' + nconf.get('task:create:cmd') + '`');
        log.info('CMD', cmd);
        return cmd;
    };

    try {
        // **NOT** config 'multer' by 'storeage' to do the rename, because 'taskId' may be not ready at that moment.
        //await resetReqFile(req.file, sampleFile);
        log.info('SAMPLE', `${pretty(file)}`);

        const { stdout, stderr } = await exec(genCmd({
            sampleFile: file.path,
            taskId,
            taskDir: path.join(taskDirRoot, taskId),
        }));
        log.info('CMD', `stdout[${stdout}], stderr[${stderr}]`);

        return JSON.parse(stdout);   //checking if stdout is json format
    }
    catch (e) {
        log.error('CMD', e.stack);
        return utils.genAppResult(taskId, e.message);
    }
}

async function runTask(req, taskId, file){

    const log = getTaskLogger(taskId, 'POST');
    const reporter = getReporter(req, log);

    runningTasks.add(taskId);
    try{
        const result = await _runTask(taskId, file, log);
        await reporter.send(result);
    }
    catch (e) {
        log.error('REPORT', e.stack);
    }
    finally{
        runningTasks.delete(taskId);
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
