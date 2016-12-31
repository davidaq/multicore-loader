
module.exports = warpLoader;

function warpLoader() {
  var args = arguments;
  if (typeof arguments[0] === 'string' && typeof arguments[1] === 'number' && Array.isArray(arguments[2])) {
    args = [arguments[0]];
  }
  return Array.prototype.map.call(args, function(item) {
    if (typeof item !== 'string') {
      throw new Error('Loader must be defined as string');
    }
    item = item.split('!');
    if (item.length > 1) {
      return warpLoader.apply(this, item);
    }
    item = item[0];
    var parts = item.split('?');
    var query = new Buffer('?' + parts.slice(1).join('?'), 'utf-8').toString('base64');
    return require.resolve('./loader') + '?' + parts[0] + '/' + query;
  }).join('!');
};
