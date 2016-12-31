var childProcess = require('child_process');
var os = require('os');

var workerCountLimit = os.cpus().length * 10;
var workers = {};
var idleWorkerIds = [];

module.exports = function(source, sourceMap) {
  var self = this;
  var loaders = JSON.parse(new Buffer(self.query, 'base64'));
  self.async();
  var context = {
    options: self.options,
    context: self.context,
    request: self.request,
    resource: self.resource,
    resourcePath: self.resourcePath,
    resourceQuery: self.resourceQuery,
    remainingRequest: null,
    data: self.data,
    loaders: loaders.map(function(item) {
      return {
        request: item[0] + item[1],
        path: item[0],
        query: item[1],
      }
    }),
  };

  var promise = Promise.resolve();
  loaders.slice(0).reverse().forEach(function(loader, index) {
    promise = promise
      .then(function() {
        return runLoader(loader, Object.assign({
          loaderIndex: index,
        }, context), source, sourceMap);
      })
      .then(function(result) {
        if (result.error) {
          return Promise.reject(result.error);
        }
        source = result.source;
        sourceMap = result.sourceMap;
      });
  });
  promise
    .then(function() {
      self.callback(null, source, sourceMap);
    }, function(err) {
      self.callback(err);
    });
};

function runLoader(loader, context, source, sourceMap) {
  return requestWorker()
    .then(function(worker) {
      return worker.send({
        loader: loader,
        source: source,
        context: context,
        sourceMap: sourceMap
      });
    });
}

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
          console.log('===== KILL =====');
        }, 2000);
      }
    });
    workers[id] = {
      id: id,
      process: child,
      idle: false,
      send: function(message) {
        clearTimeout(killTimeout);
        killTimeout = null;
        child.send(message);
        return new Promise(function(reply) {
          child.once('message', reply);
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
