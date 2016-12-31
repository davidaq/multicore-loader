
process.send({
  idle: true,
});

process.on('message', function(message) {
  if (!message.loader) {
    return;
  }
  var job = message;
  runLoader(job.loader, job.context, job.source, job.sourceMap)
    .then(function(result) {
      process.send(Object.assign({
        idle: true,
      }, result));
    }, function(err) {
      process.send({
        idle: true,
        error: err.toString(),
      });
    });
});

function runLoader(modName, contextData, source, sourceMap) {
  if (!/\-loader$/.test(modName)) {
    modName = modName + '-loader';
  }
  var context = new FakeLoaderContext(modName, contextData);
  return context.execLoaderAsPromise(source, sourceMap);
}

var priv = '___MULTICORE_LOADER_CONTEXT_PIRV';

function FakeLoaderContext(loaderModName, data) {
  var self = this;
  Object.assign(self, data);

  self[priv] = {};
  self[priv].loaderModName = loaderModName;
  self[priv].promise = new Promise(function(resolve, reject) {
    self[priv].resolve = resolve;
    self[priv].reject = reject;
  });
}

FakeLoaderContext.prototype.async = function() {
  this[priv].isAsync = true;
  return this.callback.bind(this);
};

FakeLoaderContext.prototype.callback = function(err, source, sourceMap) {
  if (err) {
    this[priv].reject(err);
  } else {
    this[priv].resolve({
      source: source,
      sourceMap: sourceMap,
    });
  }
};

FakeLoaderContext.prototype.resolve = function(context, request, callback) {
  queryMaster({
    action: 'context.resolve',
    context: context,
    request: request,
  }).then(function(result) {
    callback(null, result);
  }, function(err) {
    callback(err);
  });
};

FakeLoaderContext.prototype.resolveSync = function() {
  throw new Error('Resolve sync is not supported');
};

FakeLoaderContext.prototype.loadModule = function(name, callback) {
  queryMaster({
    action: 'context.loadModule',
    name: name,
  }).then(function(result) {
    callback(null, result);
  }, function(err) {
    callback(err);
  });
};

FakeLoaderContext.prototype.cacheable = function(flag) {
  if (typeof flag === 'undefined') {
    flag = true;
  }
  queryMaster({
    action: 'context.cacheable',
    flag: flag,
  });
};

FakeLoaderContext.prototype.emitWarning = function(message) {
  queryMaster({
    action: 'context.emitWarning',
    message: message,
  });
};

FakeLoaderContext.prototype.emitError = function(message) {
  queryMaster({
    action: 'context.emitError',
    message: message,
  });
};

FakeLoaderContext.prototype.addDependency = function(file) {
  queryMaster({
    action: 'context.addDependency',
    file: file,
  });
};

FakeLoaderContext.prototype.dependency = FakeLoaderContext.prototype.addDependency;

FakeLoaderContext.prototype.addContextDependency = function(file) {
  queryMaster({
    action: 'context.addContextDependency',
    file: file,
  });
};

FakeLoaderContext.prototype.emitFile = function(name, content, sourceMap) {
  var isBuffer = Buffer.isBuffer(content);
  queryMaster({
    action: 'context.addContextDependency',
    name: name,
    content: isBuffer ? content.toString('base64') : content,
    isBuffer: isBuffer,
    sourceMap: sourceMap,
  });
};

FakeLoaderContext.prototype.execLoaderAsPromise = function(source, sourceMap) {
  var loaderFunc = require(this[priv].loaderModName);
  var result;
  try {
    result = loaderFunc.call(this, source, sourceMap);
  } catch (err) {
    return Promise.reject(err);
  }
  if (!this[priv].isAsync && result) {
    return Promise.resolve({
      source: result,
    });
  }
  return this[priv].promise;
};


var queryCounter = 1;
var queryCallbacks = {};
function queryMaster(payload) {
  var id = queryCounter;
  queryCounter++;
  process.send({
    id: id,
    payload: payload,
  });
  return new Promise(function(resolve) {
    queryCallbacks[id] = resolve;
  });
}

process.on('message', function(payload) {
  if (payload.reply) {
    var cb = queryCallbacks[payload.id];
    if (cb) {
      delete queryCallbacks[payload.id];
      if (payload.error) {
        cb(Promise.reject(payload.err));
      } else {
        cb(payload.result);
      }
    }
  }
});
