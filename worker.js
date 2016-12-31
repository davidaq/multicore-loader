
process.send({
  idle: true,
});

process.on('message', function(job) {
  runLoader(job.loader, job.context, job.source, job.sourceMap)
    .then(function(result) {
      process.send(Object.assign({
        idle: true,
      }, result));
    }, function(err) {
      console.error(err);
      process.send({
        idle: true,
        error: err.toString(),
      });
    });
});

function runLoader(loader, contextData, source, sourceMap) {
  var modName = loader[0];
  if (!/\-loader$/.test(modName)) {
    modName = modName + '-loader';
  }
  var context = new FakeLoaderContext(modName, loader[1], contextData);
  return context.execLoaderAsPromise(source, sourceMap);
}

var priv = '___MULTICORE_LOADER_CONTEXT_PIRV';

function FakeLoaderContext(loaderModName, query, data) {
  var self = this;
  Object.assign(self, data, {
    query: query,
  });

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

FakeLoaderContext.prototype.cacheable = function() {
  this[priv].cacheable = true;
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
    return Promise.resolve(result);
  }
  return this[priv].promise;
}
