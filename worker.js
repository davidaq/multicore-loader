
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
      process.send({
        idle: true,
        error: err.toString(),
      });
    });
});

function runLoader(loader, contextData, source, sourceMap) {
  var context = new FakeLoaderContext(loader[1], contextData);
  var modName = loader[0];
  if (!/\-loader$/.test(modName)) {
    modName = modName + '-loader';
  }
  var loaderFunc = require(modName);
  loaderFunc.call(context, source, sourceMap);
  return Promise.resolve({});
}

function FakeLoaderContext(query, data) {
  this.query = query;
  Object.assign(this, data);
}
