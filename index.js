

module.exports = function(loaders) {
  if (typeof loaders === 'string') {
    loaders = loaders.split('!');
  } else if (!Array.isArray(loaders)) {
    throw new Error('loaders definition must be string or array');
  }
  loaders = loaders.map(item => {
    if (typeof item === 'string') {
      const parts = item.split('?');
      return [parts[0], '?' + parts.slice(1).join('?')];
    } else if (Array.isArray(item)) {
      const name = item[0];
      let query = item[1];
      if (typeof query === 'string') {
        if (/^\?/.test(query)) {
          query = '?' + query;
        }
      } else if (query) {
        query = '?' + JSON.stringify(query);
      } else {
        query = '?';
      }
      return [name, query];
    }
  });
  loaders = new Buffer(JSON.stringify(loaders), 'utf-8').toString('base64');
  return require.resolve('./loader') + '?' + loaders;
};
