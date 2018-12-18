'use strict';

const fs = require('fs');
const Stomp = require('stomp-client');
const colors = require('colors/safe');

const logDebug = (tag, msg) => console.log(`${colors.blue(tag)} ${msg}`);
const logInfo = (tag, msg) => console.log(`${colors.green(tag)} ${msg}`);
const logWarn = (tag, msg) => console.log(`${colors.yellow(tag)} ${msg}`);
const logError = (tag, msg) => console.log(`${colors.red(tag)} ${msg}`);

module.exports.logDebug = logDebug;
module.exports.logInfo = logInfo;
module.exports.logWarn = logWarn;
module.exports.logError = logError;

//mkdir -p
module.exports.mkdir = (path, cb) => {
    fs.mkdir(path, { recursive: true }, err => { 
        if (err && err.code != 'EEXIST')
            return cb(err);

        cb(null);
    });
};

module.exports.sendAmqMessage = function(host, port, queue, msg)
{
    //const client = new Stomp(host, port, "", "", '1.0', null, {retries: 3, delay: 100});
    const client = new Stomp(host, port);
    client.connect(sessionId => {
        logDebug('AMQ', `${host}:${port}/${queue} connected`);
        client.publish('/queue/' + queue, msg);
        //client.disconnect();
    },
    err => logError('ERROR', err));
};

module.exports.genUtestResult = function(taskId, errmsg, link)
{
    const result = {
        taskId,
        status: errmsg? "FAIL": "SUCCESS",
        message: errmsg? JSON.stringify(errmsg): '',
        link: errmsg? '': link
    };

    logDebug('RESULT', `${JSON.stringify(result, null, 2)}`);
    return result;
}
