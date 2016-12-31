var childProcess = require('child_process');
var os = require('os');

var workerCountLimit = os.cpus().length * 4;
var workers = {};
var idleWorkerIds = [];
var runningLoaders = {};
setInterval(function() {
  console.log(runningLoaders);
}, 5000).unref();

module.exports = function(source, sourceMap) {
  var self = this;
  var parts = self.query.split('/');
  var targetLoader = {
    name: parts[0].replace(/^\?/, ''),
    query: new Buffer(parts[1], 'base64').toString(),
  };

  var callback = self.async();
  var context = {
    options: self.options,
    context: self.context,
    request: self.request,
    resource: self.resource,
    resourcePath: self.resourcePath,
    resourceQuery: self.resourceQuery,
    remainingRequest: null,
    data: self.data,
    loaders: self.loaders,
    loaderIndex: self.loaderIndex,
    query: targetLoader.query,
    debug: self.debug,
    minimize: self.minimize,
    sourceMap: self.sourceMap,
    target: self.target,
    webpack: self.webpack,
  };
  if (runningLoaders[targetLoader.name]) {
    runningLoaders[targetLoader.name]++;
  } else {
    runningLoaders[targetLoader.name] = 1;
  }
  requestWorker()
    .then(function(worker) {
      worker.onMessage = function(payload) {
        switch(payload.action) {
          case 'context.resolve':
            return new Promise(function(resolve, reject) {
              self.resolve(payload.context, payload.request, function(err, result) {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              });
            });
          case 'context.loadModule':
            return new Promise(function(resolve, reject) {
              self.loadModule(payload.name, function(err, result) {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              });
            });
          case 'context.cacheable':
            self.cacheable(payload.flag);
            return Promise.resolve();
          case 'context.emitWarning':
            self.emitWarning(payload.message);
            return Promise.resolve();
          case 'context.emitError':
            self.emitError(payload.message);
            return Promise.resolve();
          case 'context.addDependency':
            self.addDependency(payload.file);
            return Promise.resolve();
          case 'context.addContextDependency':
            self.addContextDependency(payload.file);
            return Promise.resolve();
          case 'context.emitFile':
            console.log(payload.content);
            self.emitFile(payload.name, payload.isBuffer ? new Buffer(payload.content, base64) : payload.content, payload.sourceMap);
            return Promise.resolve();
          default:
            return Promise.reject('Unsupported operation');
        }
      };
      return worker.sendJob({
        loader: targetLoader.name,
        context: context,
        source: source,
        sourceMap: sourceMap
      });
    })
    .then(function(result) {
      runningLoaders[targetLoader.name]--;
      callback(null, result.source, result.sourceMap);
    }, function(err) {
      runningLoaders[targetLoader.name]--;
      callback(err);
    });
};

var workerCounter = 1;
function requestWorker() {
  if (idleWorkerIds.length > 0) {
    return Promise.resolve(workers[idleWorkerIds.pop()]);
  }
  if (Object.keys(workers).length < workerCountLimit) {
    var id = workerCounter;
    workerCounter++;
    var killTimeout;
    var killed = false;
    var child = childProcess.fork(require.resolve('./worker'), {
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    child.on('close', function(code) {
      if (!killed) {
        console.error('A worker closed unexpectedly');
        process.exit(1);
      }
    });
    child.on('message', function(data) {
      if (data.idle) {
        idleWorkerIds.push(id);
        incomingIdle();
        killTimeout = setTimeout(function() {
          delete workers[id];
          var pos = idleWorkerIds.indexOf(id);
          if (pos !== -1) {
            idleWorkerIds.splice(pos, 1);
          }
          killed = true;
          child.kill();
        }, 2000);
      }
    });
    workers[id] = {
      id: id,
      process: child,
      idle: false,
      sendJob: function(message) {
        clearTimeout(killTimeout);
        killTimeout = null;
        child.send(message);
        return new Promise(function(reply) {
          function messageHandler(payload) {
            if (payload.idle) {
              workers[id].onMessage = null;
              reply(payload);
              child.removeListener('message', messageHandler);
            } else if (payload.id && payload.payload) {
              workers[id].onMessage && workers[id].onMessage(payload.payload)
                .then(function(result) {
                  child.send({
                    id: payload.id,
                    reply: true,
                    result: result,
                  });
                }, function(err) {
                  child.send({
                    id: payload.id,
                    reply: true,
                    error: err,
                  });
                });
            }
          }
          child.on('message', messageHandler);
        });
      }
    };
  }
  return waitForIdle().then(requestWorker);
}


var idleWaiters = [];
function waitForIdle() {
  return new Promise(function(resolve) {
    idleWaiters.unshift(resolve);
  });
}

function incomingIdle() {
  var waiter = idleWaiters.pop();
  waiter && waiter();
}
